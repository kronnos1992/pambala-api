"""Verificação de conteúdo do comprovativo e decisão final (PaymentRiskScore + Fingerprint).

Lógica MVP Anti-Burla:
- Payment Proof + Transaction Fingerprint + Reconciliation
- PaymentRiskScore (0-100):
    +20 referência / código corresponde
    +20 valor corresponde
    +15 beneficiário corresponde
    +10 data dentro da janela
    +10 número da transação novo
    +10 documento reconhecido
    +05 banco esperado
    -40 comprovativo já utilizado (ficheiro ou fingerprint)
    -30 referência pertence a outro pedido / código não confere
    -30 valor diferente
    -20 beneficiário diferente
    -20 documento suspeito

Decisão:
    >= 90  -> Baixo risco (PROOF_ACCEPTED)
    70-89  -> Revisão manual (MANUAL_REVIEW)
    < 70   -> Rejeitado (PROOF_REJECTED)
"""
from __future__ import annotations

import datetime as dt
import hashlib
import re
import unicodedata
from typing import Any, Dict, List, Optional, Tuple

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


def _parse_number(s: str) -> Optional[float]:
    s = s.strip()
    if not s:
        return None
    s = re.sub(r"[\.,;:\s]+$", "", s)
    if not any(c.isdigit() for c in s):
        return None
    if "." in s and "," in s:
        if s.rfind(",") > s.rfind("."):
            s = s.replace(".", "").replace(",", ".")
        else:
            s = s.replace(",", "")
    elif "," in s:
        parts = s.split(",")
        if len(parts) == 2 and len(parts[1]) == 2:
            s = s.replace(",", ".")
        else:
            s = s.replace(",", "")
    try:
        val = float(s)
        return val if val >= 0 else None
    except ValueError:
        return None


def _match_amount(text: str, amount: float) -> bool:
    digits = _digits(str(int(round(amount))))
    if not digits:
        return True
    t = _digits(text)
    if digits in t:
        return True
    extracted = _extract_amounts(text)
    for a in extracted:
        if abs(a - amount) < 0.01:
            return True
    return False


def _match_reference(text: str, reference: str) -> bool:
    ref = _digits(reference)
    if len(ref) < 3:
        return True
    return ref in _digits(text)


def _extract_dates(text: str) -> List[dt.date]:
    """Extrai datas no formato dd/mm/aaaa, dd-mm-aaaa, dd.mm.aaaa ou aaaa-mm-dd."""
    dates: List[dt.date] = []
    for m in re.finditer(r"\b(\d{1,2})[/.-](\d{1,2})[/.-](\d{4})\b", text):
        try:
            d, mth, y = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= d <= 31 and 1 <= mth <= 12 and 2020 <= y <= 2035:
                dates.append(dt.date(y, mth, d))
        except ValueError:
            pass
    for m in re.finditer(r"\b(\d{4})[/.-](\d{1,2})[/.-](\d{1,2})\b", text):
        try:
            y, mth, d = int(m.group(1)), int(m.group(2)), int(m.group(3))
            if 1 <= d <= 31 and 1 <= mth <= 12 and 2020 <= y <= 2035:
                dates.append(dt.date(y, mth, d))
        except ValueError:
            pass
    return dates


def _extract_amounts(text: str) -> List[float]:
    amounts: List[float] = []
    for m in re.finditer(r"(?:kz|akz|aoa)\s*([\d\.\,\s]+)", text, re.IGNORECASE):
        raw = m.group(1).strip().replace(" ", "")
        val = _parse_number(raw)
        if val is not None and 0 < val < 1_000_000_000:
            amounts.append(val)
    for m in re.finditer(r"(?<![A-Za-z0-9])([\d\.\,\s]{1,15})\s*(?:kz|akz|aoa)\b", text, re.IGNORECASE):
        raw = m.group(1).strip().replace(" ", "")
        val = _parse_number(raw)
        if val is not None and 0 < val < 1_000_000_000:
            amounts.append(val)
    for m in re.finditer(r"(?:montante|valor|total)[:.\s]*(?:kz|akz|aoa)?\s*([\d\.\,\s]+)", text, re.IGNORECASE):
        raw = m.group(1).strip().replace(" ", "")
        val = _parse_number(raw)
        if val is not None and 0 < val < 1_000_000_000:
            amounts.append(val)
    return list(dict.fromkeys(amounts))


KNOWN_BANKS: Dict[str, Dict[str, Any]] = {
    "STANDARD_BANK": {
        "name": "Standard Bank",
        "tokens": ["standard bank", "sba", "sbicaolu", "standardbank", "standard banck"],
    },
    "BFA": {
        "name": "BFA",
        "tokens": ["bfa", "banco de fomento angola", "fomento angola"],
    },
    "BAI": {
        "name": "BAI",
        "tokens": ["bai", "banco angolano de investimentos"],
    },
    "BIC": {
        "name": "Banco BIC",
        "tokens": ["banco bic", "bic"],
    },
    "ATLANTICO": {
        "name": "Millennium Atlântico",
        "tokens": ["millennium atlantico", "atlantico", "bma"],
    },
    "SOL": {
        "name": "Banco Sol",
        "tokens": ["banco sol", "bancosol"],
    },
    "KEVE": {
        "name": "Banco Keve",
        "tokens": ["banco keve", "keve"],
    },
    "BCI": {
        "name": "BCI",
        "tokens": ["bci", "banco de comercio e industria", "comercio e industria"],
    },
    "BIR": {
        "name": "BIR",
        "tokens": ["bir", "banco de investimento rural"],
    },
    "MULTICAIXA": {
        "name": "Multicaixa / EMIS",
        "tokens": ["multicaixa", "multicaixa express", "mcx", "emis", "kwik"],
    },
    "BCGA": {
        "name": "Caixa Geral Angola",
        "tokens": ["caixa geral angola", "bcga", "caixa geral"],
    },
    "ECONOMICO": {
        "name": "Banco Económico",
        "tokens": ["banco economico", "economico"],
    },
    "FINIBANCO": {
        "name": "Finibanco",
        "tokens": ["finibanco"],
    },
    "VALOR": {
        "name": "Banco Valor",
        "tokens": ["banco valor"],
    },
    "VTB": {
        "name": "VTB África",
        "tokens": ["vtb", "vtb africa"],
    },
}


def _detect_bank(text: str) -> Optional[str]:
    norm_txt = _clean(text)
    for code, data in KNOWN_BANKS.items():
        for t in data["tokens"]:
            if _clean(t) in norm_txt:
                return data["name"]
    return None


def _is_recognized_receipt_format(text: str) -> bool:
    norm_txt = _normalize(text).lower()
    indicators = [
        "comprovativo",
        "comprovativo digital",
        "comprovante",
        "talao",
        "talão",
        "ordem de transferencia",
        "transferencia bancaria",
        "transferência bancária",
        "detalhes da operacao",
        "detalhes da transaccao",
        "participante beneficiario",
        "chave kwik",
        "multicaixa express",
        "data de valor",
        "montante",
        "titular da conta",
    ]
    matches = sum(1 for ind in indicators if _normalize(ind).lower() in norm_txt)
    has_bank = _detect_bank(text) is not None
    return (matches >= 2) or (matches >= 1 and has_bank)


def extract_transaction(text: str, ctx: Dict[str, Any]) -> Dict[str, Any]:
    """Extrai entidades canónicas de uma transação bancária a partir do OCR."""
    tx_id: Optional[str] = None
    doc_number: Optional[str] = None

    # 1. FT Core banking reference (Standard Bank, BAI, BFA, etc.)
    m_ft = re.search(r"\b(FT\d{5}[A-Z0-9]{3,12})\b", text)
    if m_ft:
        tx_id = m_ft.group(1).strip()

    # 2. Doc N.º
    m_doc = re.search(r"(?:Doc|Documento)\s*N\.[ºo][:.\s]*([A-Z0-9]+)", text, re.IGNORECASE)
    if m_doc:
        doc_number = m_doc.group(1).strip()
        if not tx_id:
            tx_id = doc_number

    # 3. N.º da Operação / Transacção
    if not tx_id:
        m_op = re.search(
            r"N\.[ºo]\s*(?:de|da)?\s*(?:Opera[çc][ãa]o|Transac[çc][ãa]o)[:.\s]*([A-Z0-9]+)",
            text,
            re.IGNORECASE,
        )
        if m_op:
            tx_id = m_op.group(1).strip()

    # 4. Talão N.º
    if not tx_id:
        m_tal = re.search(r"(?:Tal[ãa]o|Talao)\s*N\.[ºo][:.\s]*([A-Z0-9]+)", text, re.IGNORECASE)
        if m_tal:
            tx_id = m_tal.group(1).strip()

    # 5. ID / Ref da Transação
    if not tx_id:
        m_ref = re.search(
            r"(?:ID|Ref(?:er[êe]ncia)?)\s*(?:da\s*Transac[çc][ãa]o)?[:.\s]*([A-Z0-9\-]{5,30})",
            text,
            re.IGNORECASE,
        )
        if m_ref:
            tx_id = m_ref.group(1).strip()

    # Montante
    amounts = _extract_amounts(text)
    amount: Optional[float] = None
    expected_amount = ctx.get("amount")
    if expected_amount:
        for a in amounts:
            if abs(a - float(expected_amount)) < 0.01:
                amount = a
                break
    if amount is None and amounts:
        amount = max(amounts)

    # Datas
    dates = _extract_dates(text)
    tx_date: Optional[dt.date] = None
    order_created = ctx.get("orderCreatedAt")
    ref_date = dt.date.today()
    if order_created:
        try:
            if isinstance(order_created, str):
                ref_date = dt.datetime.fromisoformat(order_created.replace("Z", "+00:00")).date()
            elif isinstance(order_created, (dt.datetime, dt.date)):
                ref_date = order_created.date() if isinstance(order_created, dt.datetime) else order_created
        except Exception:
            pass
    if dates:
        tx_date = min(dates, key=lambda d: abs((d - ref_date).days))

    # Banco
    bank = _detect_bank(text) or ctx.get("bankName")

    # Beneficiário
    beneficiary: Optional[str] = None
    m_iban_pre = re.search(r"([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,50})\n+\s*AO06", text)
    if m_iban_pre:
        lines = [l.strip() for l in m_iban_pre.group(1).splitlines() if l.strip()]
        if lines:
            cand = lines[-1]
            if len(cand) >= 3 and not any(k in _clean(cand) for k in ("iban", "conta", "banco", "nome", "detalhes", "transaccao", "chave", "montante")):
                beneficiary = cand
    if not beneficiary:
        m_ben = re.search(
            r"(?:Benefici[áa]rio|Titular da Conta|Destinat[áa]rio)[:\s]*\n?(?:Nome[:\s]*)?\n?([A-Za-zÀ-ÖØ-öø-ÿ\s]{3,40})",
            text,
            re.IGNORECASE,
        )
        if m_ben:
            cand = m_ben.group(1).strip()
            if len(cand) >= 3 and not any(k in _clean(cand) for k in ("iban", "conta", "banco", "nome")):
                beneficiary = cand
    if not beneficiary and ctx.get("ownerName") and _search_token(text, ctx["ownerName"]):
        beneficiary = ctx["ownerName"]

    # IBAN
    m_iban = re.search(r"\b(AO06[0-9\*\+\s]{15,30})\b", text)
    beneficiary_iban = re.sub(r"\s+", "", m_iban.group(1)) if m_iban else None

    # Código de confirmação / paymentCode presente no texto
    payment_code_found: Optional[str] = None
    code_expected = str(ctx.get("confirmationCode") or "").strip()
    if code_expected and _clean(code_expected) in _clean(text):
        payment_code_found = code_expected
    else:
        m_code = re.search(r"\b(\d{8})\b", text)
        if m_code:
            payment_code_found = m_code.group(1)

    return {
        "transactionId": tx_id,
        "docNumber": doc_number,
        "amount": amount,
        "currency": "AOA",
        "date": tx_date.isoformat() if tx_date else None,
        "bank": bank,
        "beneficiary": beneficiary,
        "beneficiaryIban": beneficiary_iban,
        "paymentCodeFound": payment_code_found,
        "rawTextExcerpt": text[:300],
    }


def generate_transaction_fingerprint(
    tx: Dict[str, Any], ctx: Dict[str, Any]
) -> Tuple[Optional[str], str]:
    """Gera o fingerprint canónico de desduplicação lógica da transação bancária.

    Canonical format:
      TX:<tx_id>|AMT:<amount>|CUR:AOA|DT:<date>|BEN:<beneficiary>|BANK:<bank>
    """
    tx_id = _clean(tx.get("transactionId") or "")
    amount_val = tx.get("amount")
    if amount_val is not None and float(amount_val) > 0:
        amt_str = f"{float(amount_val):.2f}"
    elif ctx.get("amount"):
        amt_str = f"{float(ctx[amount]):.2f}"
    else:
        amt_str = "0.00"

    date_str = str(tx.get("date") or "")
    ben_str = _clean(tx.get("beneficiary") or ctx.get("ownerName") or "")
    bank_str = _clean(tx.get("bank") or ctx.get("bankName") or "")
    code_str = _clean(tx.get("paymentCodeFound") or ctx.get("confirmationCode") or "")

    if tx_id:
        canonical = f"TX:{tx_id}|AMT:{amt_str}|CUR:AOA|DT:{date_str}|BEN:{ben_str}|BANK:{bank_str}"
    elif amt_str != "0.00" and date_str and (ben_str or code_str):
        canonical = f"TX_NONE|CODE:{code_str}|AMT:{amt_str}|CUR:AOA|DT:{date_str}|BEN:{ben_str}|BANK:{bank_str}"
    else:
        return None, ""

    fingerprint = hashlib.sha256(canonical.encode("utf-8")).hexdigest()
    return fingerprint, canonical


def cross_check(
    text: str,
    ctx: Dict[str, Any],
    tx: Optional[Dict[str, Any]] = None,
    ocr_ok: bool = True,
    is_duplicate_file: bool = False,
    is_duplicate_fingerprint: bool = False,
) -> Dict[str, Any]:
    """Calcula o PaymentRiskScore com cruzamento detalhado e rastreabilidade total.

    Regras de pontuação (MVP):
      Base: 10
      +20 referência / paymentCode corresponde
      +20 valor corresponde
      +15 beneficiário corresponde
      +10 data dentro da janela
      +10 número da transação novo
      +10 documento reconhecido
      +05 banco esperado
      -40 comprovativo já utilizado
      -30 referência pertence a outro pedido / código não confere
      -30 valor diferente
      -20 beneficiário diferente
      -20 documento suspeito (aplicado em decide)
    """
    if tx is None:
        tx = extract_transaction(text, ctx)

    matched: List[str] = []
    missing: List[str] = []
    flags: List[str] = []
    reasons: List[str] = []
    score_breakdown: List[Dict[str, Any]] = []

    score = 10  # base neutra
    score_breakdown.append({"rule": "BASE", "delta": 10, "label": "Pontuação base"})

    # 1. Referência / Código de confirmação (+20 / -30)
    code = str(ctx.get("confirmationCode") or "").strip()
    reference = str(ctx.get("reference") or "").strip()

    if code:
        if _search_token(text, code):
            score += 20
            matched.append("codigo_confirmacao")
            score_breakdown.append({"rule": "MATCH_CODE", "delta": 20, "label": f"Código de confirmação ({code}) conferido"})
        elif ocr_ok:
            score -= 30
            missing.append("codigo_confirmacao")
            flags.append("CODE_MISMATCH")
            reasons.append(
                f"Código de confirmação ({code}) não encontrado no comprovativo — possível reutilização ou comprovativo de terceiro."
            )
            score_breakdown.append({"rule": "MISMATCH_CODE", "delta": -30, "label": "Código de confirmação não confere"})
    elif reference:
        if _match_reference(text, reference):
            score += 20
            matched.append("referencia")
            score_breakdown.append({"rule": "MATCH_REFERENCE", "delta": 20, "label": f"Referência ({reference}) conferida"})
        elif ocr_ok:
            score -= 30
            missing.append("referencia")
            flags.append("REFERENCE_MISMATCH")
            reasons.append("Referência do pagamento não encontrada no comprovativo.")
            score_breakdown.append({"rule": "MISMATCH_REFERENCE", "delta": -30, "label": "Referência não confere"})
    else:
        score_breakdown.append({"rule": "NO_REF_REQUIRED", "delta": 0, "label": "Sem referência obrigatória configurada"})

    # 2. Valor (+20 / -30)
    amount = ctx.get("amount")
    if amount is not None and float(amount) > 0:
        if _match_amount(text, float(amount)):
            score += 20
            matched.append("valor")
            score_breakdown.append({"rule": "MATCH_AMOUNT", "delta": 20, "label": f"Valor ({amount} Kz) correspondente"})
        elif ocr_ok:
            score -= 30
            missing.append("valor")
            flags.append("AMOUNT_MISMATCH")
            reasons.append(f"Valor pedido ({amount} Kz) não corresponde ao montante do comprovativo.")
            score_breakdown.append({"rule": "MISMATCH_AMOUNT", "delta": -30, "label": "Valor divergente"})
        else:
            missing.append("valor")

    # 3. Beneficiário (+15 / -20)
    owner = str(ctx.get("ownerName") or "").strip()
    iban = str(ctx.get("iban") or "").strip()
    beneficiary_matched = False

    if owner and len(owner) > 2:
        first = owner.split(" ")[0]
        if (first and _search_token(text, first)) or _search_token(text, owner):
            beneficiary_matched = True
    if not beneficiary_matched and iban and len(iban) >= 8:
        iban_digits = _digits(iban)[-6:]
        if iban_digits and iban_digits in _digits(text):
            beneficiary_matched = True

    if beneficiary_matched:
        score += 15
        matched.append("beneficiario")
        score_breakdown.append({"rule": "MATCH_BENEFICIARY", "delta": 15, "label": "Titular/IBAN beneficiário confere"})
    elif (owner or iban) and ocr_ok:
        score -= 20
        missing.append("beneficiario")
        flags.append("BENEFICIARY_MISMATCH")
        reasons.append("Beneficiário ou IBAN da conta não corresponde aos dados do vendedor.")
        score_breakdown.append({"rule": "MISMATCH_BENEFICIARY", "delta": -20, "label": "Beneficiário não confere"})
    elif not (owner or iban):
        score_breakdown.append({"rule": "NO_BENEFICIARY_DATA", "delta": 0, "label": "Sem dados de beneficiário configurados"})

    # 4. Data dentro da janela (+10 / -30 / -20)
    order_created = ctx.get("orderCreatedAt")
    if order_created and ocr_ok:
        try:
            if isinstance(order_created, str):
                order_dt = dt.datetime.fromisoformat(order_created.replace("Z", "+00:00")).date()
            elif isinstance(order_created, (dt.datetime, dt.date)):
                order_dt = order_created.date() if isinstance(order_created, dt.datetime) else order_created
            else:
                order_dt = None

            if order_dt:
                dates = _extract_dates(text)
                if dates:
                    closest = min(dates, key=lambda d: abs((d - order_dt).days))
                    diff_days = (order_dt - closest).days
                    if diff_days > 2:
                        score -= 30
                        flags.append("DATE_MISMATCH")
                        reasons.append(
                            f"Data do comprovativo ({closest.strftime("%d/%m/%Y")}) é anterior à criação do pedido ({order_dt.strftime("%d/%m/%Y")}) — possível reutilização de comprovativo antigo."
                        )
                        score_breakdown.append({"rule": "PAST_DATE", "delta": -30, "label": "Comprovativo anterior ao pedido"})
                    elif (closest - order_dt).days > 1:
                        score -= 20
                        flags.append("DATE_MISMATCH")
                        reasons.append(
                            f"Data do comprovativo ({closest.strftime("%d/%m/%Y")}) é futura em relação ao pedido ({order_dt.strftime("%d/%m/%Y")})."
                        )
                        score_breakdown.append({"rule": "FUTURE_DATE", "delta": -20, "label": "Data do comprovativo futura"})
                    else:
                        score += 10
                        matched.append("data_janela")
                        score_breakdown.append({"rule": "MATCH_DATE", "delta": 10, "label": f"Data ({closest.strftime("%d/%m/%Y")}) dentro da janela"})
                else:
                    score_breakdown.append({"rule": "NO_DATE_FOUND", "delta": 0, "label": "Nenhuma data legível identificada"})
        except Exception:
            pass

    # 5. Número da transação novo (+10 / -40 se duplicado)
    is_duplicate = is_duplicate_file or is_duplicate_fingerprint
    if is_duplicate:
        score -= 40
        if is_duplicate_fingerprint and "DUPLICATE_FINGERPRINT" not in flags:
            flags.append("DUPLICATE_FINGERPRINT")
        if is_duplicate_file and "DUPLICATE_RECEIPT" not in flags:
            flags.append("DUPLICATE_RECEIPT")
        score_breakdown.append({"rule": "DUPLICATE_TRANSACTION", "delta": -40, "label": "Transação/Comprovativo já utilizado anteriormente"})
    elif tx.get("transactionId"):
        score += 10
        matched.append("numero_transacao_novo")
        score_breakdown.append({"rule": "NEW_TRANSACTION_ID", "delta": 10, "label": f"Novo ID de transação ({tx["transactionId"]})"})

    # 6. Documento reconhecido (+10)
    if ocr_ok and _is_recognized_receipt_format(text):
        score += 10
        matched.append("documento_reconhecido")
        score_breakdown.append({"rule": "RECOGNIZED_DOCUMENT", "delta": 10, "label": "Estrutura e layout bancário reconhecidos"})
    elif not ocr_ok:
        missing.append("documento_reconhecido")
        reasons.append("Não foi possível extrair texto legível do comprovativo — revisão humana mandatória.")

    # 7. Banco esperado (+05)
    expected_bank = str(ctx.get("bankName") or "").strip()
    detected_bank = _detect_bank(text)
    if expected_bank:
        if detected_bank and _clean(expected_bank) in _clean(detected_bank):
            score += 5
            matched.append("banco")
            score_breakdown.append({"rule": "MATCH_BANK", "delta": 5, "label": f"Banco esperado ({detected_bank}) confirmado"})
        elif _search_token(text, expected_bank):
            score += 5
            matched.append("banco")
            score_breakdown.append({"rule": "MATCH_BANK", "delta": 5, "label": f"Banco ({expected_bank}) encontrado"})
        else:
            missing.append("banco")
            score_breakdown.append({"rule": "BANK_MISSING", "delta": 0, "label": "Banco esperado não identificado explicitamente"})
    elif detected_bank:
        score += 5
        matched.append("banco")
        score_breakdown.append({"rule": "DETECTED_BANK", "delta": 5, "label": f"Banco angolano ({detected_bank}) identificado"})

    return {
        "score": score,
        "score_breakdown": score_breakdown,
        "matched": matched,
        "missing": missing,
        "flags": flags,
        "reasons": reasons,
        "transaction": tx,
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
        "iban": details.get("iban"),
        "bankAccount": details.get("bankAccount"),
        "confirmationCode": order.get("paymentCode") or details.get("confirmationCode"),
        "orderCreatedAt": order.get("createdAt"),
    }


_LLM_DELTA = {
    "PASS": 0,
    "REVIEW": -10,
    "FAIL": -30,
    "ERROR": 0,
}

_SUSPICIOUS_FORENSIC_FLAGS = {
    "EDITOR_METADATA",
    "EDITED_REGIONS",
    "MAGIC_MISMATCH",
}


def decide(
    cross: Dict[str, Any], forensic: Dict[str, Any], llm: Any, *, ocr_ok: bool = True
) -> Dict[str, Any]:
    """Combina os sinais forenses, OCR e IA devolvendo o veredicto (PROOF_ACCEPTED/MANUAL_REVIEW/PROOF_REJECTED)."""
    flags: List[str] = list(cross.get("flags", []))
    reasons: List[str] = []
    score = cross.get("score", 50)
    breakdown = list(cross.get("score_breakdown", []))

    # Incorpora flags forenses
    has_suspicious_doc = False
    for f in forensic.get("flags", []):
        if f not in flags:
            flags.append(f)
        if f in _SUSPICIOUS_FORENSIC_FLAGS:
            has_suspicious_doc = True
        if f == "DUPLICATE_RECEIPT" and f not in [b["rule"] for b in breakdown]:
            score -= 40
            breakdown.append({"rule": "DUPLICATE_RECEIPT", "delta": -40, "label": "Ficheiro duplicado (SHA-256)"})

    # Regra: -20 documento suspeito
    if has_suspicious_doc and "SUSPICIOUS_DOCUMENT" not in flags:
        flags.append("SUSPICIOUS_DOCUMENT")
        score -= 20
        breakdown.append({"rule": "SUSPICIOUS_DOCUMENT", "delta": -20, "label": "Documento suspeito (metadados de editor/regiões adulteradas)"})

    reasons.extend(forensic.get("reasons", []))
    reasons.extend(cross.get("reasons", []))

    # Ajuste por visão LLM
    if llm:
        for f in llm.get("flags", []):
            if f not in flags:
                flags.append(f)
        delta_llm = _LLM_DELTA.get(llm.get("verdict", "ERROR"), 0)
        score += delta_llm
        if delta_llm != 0:
            breakdown.append({"rule": f"LLM_{llm.get("verdict")}", "delta": delta_llm, "label": f"Ajuste por visão de IA ({llm.get("verdict")})"})
        if llm.get("verdict") == "FAIL":
            reasons.append(f"Visão LLM: {llm.get("rationale", "")}")
        elif llm.get("verdict") == "REVIEW":
            reasons.append(f"Visão LLM sinalizou revisão: {llm.get("rationale", "")}")

    score = max(0, min(100, score))

    # Escala do MVP:
    # 90-100 -> baixo risco (PROOF_ACCEPTED)
    # 70-89  -> revisão (MANUAL_REVIEW)
    # < 70   -> rejeitar (PROOF_REJECTED)
    if score >= 90:
        status = "PROOF_ACCEPTED"
    elif score >= 70:
        status = "MANUAL_REVIEW"
    else:
        status = "PROOF_REJECTED"

    # Regra absoluta: Comprovativo ou transação duplicada reprova imediatamente
    if "DUPLICATE_RECEIPT" in flags or "DUPLICATE_FINGERPRINT" in flags:
        status = "PROOF_REJECTED"
        score = min(score, 15)
        reasons.append("Reprovação automática: comprovativo ou transação bancária idêntica já utilizada noutro pedido.")

    # Regra absoluta: Múltiplas incongruências críticas (valor divergente E (código ou data))
    if "AMOUNT_MISMATCH" in flags and ("CODE_MISMATCH" in flags or "DATE_MISMATCH" in flags):
        status = "PROOF_REJECTED"
        reasons.append("Reprovação automática: múltiplos dados fundamentais (valor/código/data) não coincidem.")

    # Regra de segurança: PROOF_ACCEPTED bloqueado com qualquer indício de adulteração
    if status == "PROOF_ACCEPTED" and any(
        f in flags
        for f in (
            "EDITOR_METADATA",
            "EDITED_REGIONS",
            "MAGIC_MISMATCH",
            "SUSPICIOUS_DOCUMENT",
            "FORENSICS_UNAVAILABLE",
            "CODE_MISMATCH",
            "DATE_MISMATCH",
        )
    ):
        status = "MANUAL_REVIEW"
        reasons.append("Aceitação bloqueada: indícios de suspeita exigem revisão manual antes da liquidação.")

    # Sem texto extraído (OCR indisponível): não reprovar apenas por ausência de leitura
    if (
        not ocr_ok
        and status == "PROOF_REJECTED"
        and (llm or {}).get("verdict") != "FAIL"
        and not any(f in flags for f in ("EDITOR_METADATA", "EDITED_REGIONS", "MAGIC_MISMATCH", "DUPLICATE_RECEIPT", "DUPLICATE_FINGERPRINT"))
    ):
        status = "MANUAL_REVIEW"
        reasons.append(
            "Texto não extraído (OCR indisponível) — comprovativo pendente de revisão manual pelo operador."
        )

    return {
        "status": status,
        "score": score,
        "score_breakdown": breakdown,
        "flags": flags,
        "reasons": reasons,
    }
