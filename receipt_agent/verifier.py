"""Verificação de conteúdo do comprovativo e decisão final.

Espelha a lógica da validação rápida existente na API (receiptValidation.ts),
e cruza também o código de confirmação por pedido quando existe.
"""
from __future__ import annotations

import re
import unicodedata
from typing import Any, Dict, List

from . import config


def _normalize(s: str) -> str:
    return unicodedata.normalize("NFD", s).encode("ascii", "ignore").decode("ascii", "ignore")


def _clean(s: str) -> str:
    return re.sub(r"[^a-z0-9]", "", _normalize(s).lower())


def _digits(s: str) -> str:
    return re.sub(r"[^0-9]", "", s)


def _search_token(text: str, needle: str) -> bool:
    n = _clean(needle)
    if len(n) < 2:
        return False
    return n in _clean(text)


def _match_amount(text: str, amount: float) -> bool:
    digits = _digits(str(int(round(amount))))
    if not digits:
        return True
    t = _digits(text)
    return digits in t


def _match_reference(text: str, reference: str) -> bool:
    ref = _digits(reference)
    if len(ref) < 3:
        return True
    return ref in _digits(text)


def cross_check(text: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Compara o OCR com os dados esperados (total, entidade, referência...)."""
    matched: List[str] = []
    missing: List[str] = []
    flags: List[str] = []
    reasons: List[str] = []

    score = 50

    amount = ctx.get("amount")
    if amount:
        if _match_amount(text, amount):
            score += 20
            matched.append("valor")
        else:
            score -= 10
            missing.append("valor_conferido")
            flags.append("AMOUNT_MISMATCH")
            reasons.append("Valor pedido não encontrado no comprovativo.")

    entity = str(ctx.get("entity") or "").strip()
    if entity:
        if _search_token(text, entity):
            score += 12
            matched.append("entidade")
        else:
            missing.append("entidade")

    reference = str(ctx.get("reference") or "").strip()
    if reference:
        if _match_reference(text, reference):
            score += 12
            matched.append("referencia")
        else:
            missing.append("referencia")
            flags.append("REFERENCE_MISMATCH")
            reasons.append("Referência do pedido não encontrada na imagem.")

    bank = str(ctx.get("bankName") or "").strip()
    if bank:
        b = _normalize(bank).lower()
        if _normalize(text).lower().find(b) != -1:
            score += 6
            matched.append("banco")
        else:
            missing.append("banco")

    owner = str(ctx.get("ownerName") or "").strip()
    if len(owner) > 2:
        first = owner.split(" ")[0]
        if first and _search_token(text, first):
            score += 4
            matched.append("titular")
        else:
            missing.append("titular")

    code = str(ctx.get("confirmationCode") or "").strip()
    if code:
        c = _clean(code)
        if len(c) >= 3 and c in _clean(text):
            score += 15
            matched.append("codigo_confirmacao")
        else:
            missing.append("codigo_confirmacao")
            flags.append("CODE_MISMATCH")
            reasons.append(
                "Código de confirmação do pedido não encontrado — possível comprovativo de outro pedido."
            )

    return {
        "score": score,
        "matched": matched,
        "missing": missing,
        "flags": flags,
        "reasons": reasons,
    }


def build_context(order: Dict[str, Any]) -> Dict[str, Any]:
    """Extrai o contexto de verificação de um pedido."""
    details = order.get("paymentDetails") or {}
    if not isinstance(details, dict):
        details = {}
    return {
        "amount": order.get("total"),
        "phone": details.get("phone"),
        "entity": details.get("entity"),
        "reference": details.get("reference"),
        "bankName": details.get("bankName"),
        "ownerName": details.get("ownerName"),
        "confirmationCode": details.get("confirmationCode"),
    }


_LLM_PENALTY = {
    "PASS": +8,
    "REVIEW": -5,
    "FAIL": -25,
    "ERROR": 0,
}

_FORENSIC_PENALTIES = {
    "MAGIC_MISMATCH": -45,
    "EDITOR_METADATA": -35,
    "EDITED_REGIONS": -30,
    "SCREENSHOT_LIKE": -15,
    "EXIF_STRIPPED": -5,
    "LOW_RES": -5,
    "FORENSICS_UNAVAILABLE": -20,
}


def decide(cross: Dict[str, Any], forensic: Dict[str, Any], llm: Any) -> Dict[str, Any]:
    """Combina os sinais e devolve o veredicto final (PASS/REVIEW/FAIL)."""
    flags: List[str] = []
    reasons: List[str] = []
    score = cross["score"]

    for f in forensic.get("flags", []):
        flags.append(f)
        score += _FORENSIC_PENALTIES.get(f, 0)
    reasons.extend(forensic.get("reasons", []))
    reasons.extend(cross.get("reasons", []))

    if llm:
        for f in llm.get("flags", []):
            if f not in flags:
                flags.append(f)
        score += _LLM_PENALTY.get(llm.get("verdict", "ERROR"), 0)
        if llm.get("verdict") == "FAIL":
            reasons.append(f"Visão LLM: {llm.get('rationale', '')}")
        elif llm.get("verdict") == "REVIEW":
            reasons.append(f"Visão LLM sinalizou revisão: {llm.get('rationale', '')}")

    score = max(0, min(100, score))

    status = "REVIEW"
    if score >= config.PASS_THRESHOLD:
        status = "PASS"
    elif score <= config.FAIL_THRESHOLD:
        status = "FAIL"

    # Regra de segurança: PASS jamais com flags forenses de suspeita.
    if status == "PASS" and any(
        f in flags
        for f in ("EDITOR_METADATA", "EDITED_REGIONS", "MAGIC_MISMATCH", "FORENSICS_UNAVAILABLE")
    ):
        status = "REVIEW"
        reasons.append("PASS bloqueado pela forense: relação imagem exige revisão humana.")

    return {
        "status": status,
        "score": score,
        "flags": flags,
        "reasons": reasons,
    }