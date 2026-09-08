#!/usr/bin/env python3
"""CLI do agente de verificação de comprovativos de pagamento do Pambala.

Comandos:
  check        estado do agente (via OCR, forense, LLM e fila) — sem processar
  process      processa comprovativos pendentes (forense + OCR + cruza + LLM)
  report <id>  mostra o relatório de um pedido (por id ou orderNumber)

Opções comuns:
  --limit N        limita o nº de comprovativos processados
  --order ID       processa apenas um pedido (id ou orderNumber)
  --skip-llm       não chama o modelo de visão (mais barato/rápido)
  --dry-run        apenas simula: não grava e não chama o LLM

Exemplos:
  python3 -m receipt_agent.agent check
  python3 -m receipt_agent.agent process --limit 20
  python3 -m receipt_agent.agent process --order pedido_123
  python3 -m receipt_agent.agent process --skip-llm
  python3 -m receipt_agent.agent report pedido_123
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

import os
import re
import tempfile
import urllib.request

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from receipt_agent import config
from receipt_agent import db as db_mod
from receipt_agent import forensics
from receipt_agent import llm as llm_mod
from receipt_agent import ocr as ocr_mod
from receipt_agent import verifier


def _download_remote_receipt(url: str) -> tuple[Path, bool]:
    """Descarrega comprovativo de URL remoto (ex.: Cloudinary) para ficheiro temporário."""
    urls_to_try = [url]
    if "res.cloudinary.com" in url and url.lower().endswith(".pdf"):
        urls_to_try.append(re.sub(r"\.pdf$", ".jpg", url, flags=re.IGNORECASE))

    last_error = None
    for target_url in urls_to_try:
        try:
            req = urllib.request.Request(
                target_url,
                headers={"User-Agent": "PambalaReceiptAgent/1.0 Mozilla/5.0"}
            )
            with urllib.request.urlopen(req, timeout=30) as resp:
                ext = Path(target_url.split("?")[0].split("#")[0]).suffix or ".tmp"
                data = resp.read(15 * 1024 * 1024)
                fd, tmp_path_str = tempfile.mkstemp(prefix="receipt_", suffix=ext)
                with os.fdopen(fd, "wb") as f:
                    f.write(data)
                return Path(tmp_path_str), True
        except Exception as e:
            last_error = e

    raise RuntimeError(f"Falha ao descarregar comprovativo remoto de {url}: {last_error}")


def resolve_receipt_file(receipt_uri: str) -> tuple[Path, bool, str]:
    """Resolve URI de comprovativo para caminho local. Devolve (caminho, is_temp, nome_original)."""
    clean_uri = (receipt_uri or "").strip()
    if clean_uri.startswith("http://") or clean_uri.startswith("https://"):
        fname = clean_uri.split("?")[0].split("#")[0].split("/")[-1]
        local_cand = config.RECEIPTS_DIR / fname
        if local_cand.exists():
            return local_cand, False, fname
        tmp_path, is_temp = _download_remote_receipt(clean_uri)
        actual_fname = fname
        if tmp_path.suffix.lower() == ".jpg" and fname.lower().endswith(".pdf"):
            actual_fname = re.sub(r"\.pdf$", ".jpg", fname, flags=re.IGNORECASE)
        return tmp_path, is_temp, actual_fname

    fname = clean_uri.split("/")[-1]
    return config.RECEIPTS_DIR / fname, False, fname


def build_result(
    order: dict,
    text: str,
    ocr_engine: str,
    fore: dict,
    llm: dict | None,
    skipped_llm: bool,
    ocr_ok: bool = True,
    is_duplicate_file: bool = False,
    is_duplicate_fingerprint: bool = False,
    tx: dict | None = None,
) -> dict:
    ctx = verifier.build_context(order)
    if tx is None:
        tx = verifier.extract_transaction(text, ctx)
    cross = verifier.cross_check(
        text,
        ctx,
        tx=tx,
        ocr_ok=ocr_ok,
        is_duplicate_file=is_duplicate_file,
        is_duplicate_fingerprint=is_duplicate_fingerprint,
    )
    decision = verifier.decide(cross, fore, llm, ocr_ok=ocr_ok)

    reasons = decision["reasons"]

    return {
        "agentProcessedAt": db_mod._iso_now(),
        "agentVersion": config.AGENT_VERSION,
        "engine": {
            "ocr": ocr_engine,
            "vision": (llm and llm.get("model_used")) or ("skipped" if skipped_llm else None),
            "forensics": fore.get("signals", {}).get("forensics_available", False),
        },
        "status": decision["status"],
        "score": decision["score"],
        "score_breakdown": decision.get("score_breakdown", []),
        "flags": decision["flags"],
        "transaction": tx,
        "checks": {
            "score": cross["score"],
            "matched": cross["matched"],
            "missing": cross["missing"],
        },
        "context": {
            "expectedAmount": ctx.get("amount"),
            "entity": ctx.get("entity"),
            "reference": ctx.get("reference"),
            "confirmationCode": ctx.get("confirmationCode"),
        },
        "ocr": {
            "chars": len(text),
            "excerpt": text[:300],
        },
        "forensics": {
            k: v for k, v in fore.get("signals", {}).items() if k != "magic"
        },
        "llm": llm,
        "reasons": reasons,
    }


def _new_vision_client(force: bool):
    if not force:
        status = llm_mod.llm_status()
        if not status["api_key_set"]:
            return None
    return llm_mod.VisionClient()


def process_one(
    dbx: db_mod.ReceiptDatabase, order: dict, args, vision, dry: bool
) -> dict:
    receipt_uri = order.get("receiptImage") or ""
    path = None
    is_temp = False
    filename = ""
    download_err = None

    try:
        path, is_temp, filename = resolve_receipt_file(receipt_uri)
    except Exception as e:
        download_err = str(e)

    try:
        if download_err or not path or not path.exists():
            reason = download_err or f"Ficheiro {filename} não encontrado em {config.RECEIPTS_DIR}."
            result = {
                "agentProcessedAt": db_mod._iso_now(),
                "agentVersion": config.AGENT_VERSION,
                "engine": {},
                "status": "REVIEW",
                "score": 0,
                "flags": ["FILE_NOT_FOUND"],
                "checks": {"score": 0, "matched": [], "missing": []},
                "context": {},
                "ocr": {},
                "forensics": {},
                "llm": None,
                "reasons": [reason],
            }
        else:
            fore = forensics.analyze(path, filename)

            # Deteção de Replay / Comprovativo duplicado (físico por hash SHA-256)
            is_dup_file = False
            file_hash = fore.get("signals", {}).get("hash")
            if file_hash:
                dup = dbx.find_duplicate_receipt(order["id"], file_hash)
                if dup:
                    is_dup_file = True
                    fore["flags"].append("DUPLICATE_RECEIPT")
                    fore["reasons"].append(
                        f"Comprovativo idêntico (mesmo hash SHA-256) já foi utilizado no pedido {dup['orderNumber']} — suspeita de fraude por reutilização de comprovativo."
                    )
                    fore["duplicate_of"] = dup

            text = ""
            ocr_engine = "unavailable"
            ocr_ok = False
            try:
                text, ocr_engine = ocr_mod.run_ocr(path)
                ocr_ok = bool(text.strip())
            except ocr_mod.OcrError as e:
                fore["flags"].append("OCR_UNAVAILABLE")
                fore["reasons"].append(str(e))

            # Extração canónica de transação e geração de Transaction Fingerprint
            ctx = verifier.build_context(order)
            tx = verifier.extract_transaction(text, ctx)
            fingerprint, canonical = verifier.generate_transaction_fingerprint(tx, ctx)
            tx["fingerprint"] = fingerprint
            tx["canonical"] = canonical

            # Deteção de Replay lógico por Transaction Fingerprint
            is_dup_fp = False
            if fingerprint:
                dup_fp = dbx.find_duplicate_fingerprint(order["id"], fingerprint)
                if dup_fp:
                    is_dup_fp = True
                    fore["flags"].append("DUPLICATE_FINGERPRINT")
                    fore["reasons"].append(
                        f"Transação bancária idêntica (fingerprint {fingerprint[:12]}...) já foi utilizada no pedido {dup_fp['orderNumber']} — suspeita de fraude por reutilização de dados bancários."
                    )
                    fore["duplicate_fingerprint_of"] = dup_fp

            llm_out = None
            skipped = args.skip_llm
            if not args.skip_llm and not dry and vision is not None:
                if not order.get("aiValidationConsent"):
                    skipped = True
                    fore["flags"].append("NO_CONSENT_LLM")
                    fore["reasons"].append(
                        "Sem consentimento do titular para análise por IA com processador "
                        "externo — efetuada apenas a verificação local (forense/OCR)."
                    )
                else:
                    try:
                        llm_out = vision.review(path, ctx)
                        llm_out["model_used"] = vision.model
                    except llm_mod.VisionError as e:
                        llm_out = {
                            "verdict": "REVIEW",
                            "confidence": 0.0,
                            "flags": ["llm_error"],
                            "extracted": {},
                            "rationale": str(e),
                            "model_used": vision.model,
                        }
            result = build_result(
                order,
                text,
                ocr_engine,
                fore,
                llm_out,
                skipped,
                ocr_ok=ocr_ok,
                is_duplicate_file=is_dup_file,
                is_duplicate_fingerprint=is_dup_fp,
                tx=tx,
            )

        if dry:
            return result

        dbx.complete(order["id"], result)
        return result
    finally:
        if is_temp and path and path.exists():
            try:
                path.unlink()
            except Exception:
                pass


def cmd_check(args) -> int:
    dbx = db_mod.ReceiptDatabase()
    stats = dbx.stats()
    print("== Base ==")
    print(f"  sqlite: {dbx.db_path}")
    print(f"  comprovativos submetidos: {stats['receipts_uploaded']}")
    print(f"  já revistos pelo agente:  {stats['agent_reviewed']}")
    q = dbx.queue_stats()
    print(f"  fila: PENDING={q['pending']} PROCESSING={q['processing']} "
          f"DONE={q['done']} FAILED={q['failed']}")
    n_accepted = stats.get("proof_accepted", 0) + stats.get("pass", 0)
    n_review = stats.get("manual_review", 0) + stats.get("review", 0)
    n_rejected = stats.get("proof_rejected", 0) + stats.get("fail", 0)
    print(f"  pedidos: AQUEUE={stats.get('aqueue', 0)} "
          f"ACEITE={n_accepted} REVISÃO={n_review} REJEITADO={n_rejected}")

    print("\n== OCR (Tesseract) ==")
    ocr = ocr_mod.ocr_status()
    print(f"  binário:    {ocr['binary'] or 'não encontrado'}")
    print(f"  pytesseract:{'sim' if ocr['pytesseract'] else 'não'}")
    print(f"  tessdata:   {ocr['tessdata'] or 'não encontrado'}")
    print(f"  disponível: {'SIM' if ocr['available'] else 'NÃO'}")

    print("\n== Forense (Pillow) ==")
    try:
        import PIL  # noqa: F401

        print("  pillow: instalado")
    except Exception:
        print("  pillow: NÃO instalado (forense limitada; recomendo `pip install pillow`)")

    print("\n== Visão LLM ==")
    status = llm_mod.llm_status()
    print(f"  api key:     {'configurada' if status['api_key_set'] else 'NÃO configurada'}")
    print(f"  base_url:    {status['base_url']}")
    print(f"  model:       {status['model']}")
    print("\nDica: o processo de verificação acontece em `process` (ver --help).")
    return 0


def cmd_process(args) -> int:
    dbx = db_mod.ReceiptDatabase()
    only = getattr(args, "order", None)
    pending = dbx.pending(limit=args.limit, only=only)
    if not pending:
        print("Sem comprovativos pendentes para processar.")
        return 0

    vision = None
    if not args.skip_llm and not args.dry_run:
        try:
            vision = _new_vision_client(force=False)
        except llm_mod.VisionError as e:
            print(f"AVISO: {e} (a correr sem visão LLM)")

    mode = "dry-run (nada gravado)" if args.dry_run else "grava na BD"
    print(f"Processando {len(pending)} comprovativo(s) — {mode}\n")

    counts: dict[str, int] = {}
    for order in pending:
        claimed = False
        if order.get("jobId") and not args.dry_run:
            dbx.claim(order["id"])
            claimed = True
        try:
            result = process_one(dbx, order, args, vision, args.dry_run)
        except Exception as e:  # pragma: no cover
            if claimed:
                dbx.fail(order["id"], str(e), order["attempts"] + 1, order["maxAttempts"])
            print(f"ERRO pedido {order['orderNumber']}: {e}")
            counts["MANUAL_REVIEW"] = counts.get("MANUAL_REVIEW", 0) + 1
            continue
        counts[result["status"]] = counts.get(result["status"], 0) + 1
        flags = ",".join(result["flags"]) or "-"
        print(
            f"  {order['orderNumber']}  {result['status']:14s} score={result['score']:3d} "
            f"flags=[{flags}]"
        )
        if result["reasons"]:
            for r in result["reasons"][:2]:
                print(f"      - {r}")

    acc = counts.get("PROOF_ACCEPTED", 0) + counts.get("PASS", 0)
    rev = counts.get("MANUAL_REVIEW", 0) + counts.get("REVIEW", 0)
    rej = counts.get("PROOF_REJECTED", 0) + counts.get("FAIL", 0)
    print(f"\nResumo: ACEITE={acc} REVISÃO={rev} REJEITADO={rej} (total {len(pending)})")
    return 0


def cmd_report(args) -> int:
    dbx = db_mod.ReceiptDatabase()
    identifier = getattr(args, "id", "") or args.order
    validation = dbx.get_validation(identifier)
    if not validation:
        print(f"Pedido {args.order} não encontrado.")
        return 1
    print(f"== {validation['orderNumber']} == status={validation['validationStatus']}")
    print(json.dumps(validation["validationResult"], indent=2, ensure_ascii=False))
    return 0


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--limit", type=int, default=0, help="limite de comprovativos (process)")
    common.add_argument("--order", default="", help="id ou orderNumber (process/report)")
    common.add_argument("--skip-llm", action="store_true", help="não chama a visão LLM")
    common.add_argument("--dry-run", action="store_true", help="não grava nem chama o LLM")

    p = argparse.ArgumentParser(
        description="Agente de verificação de comprovativos do Pambala.",
        parents=[common],
    )
    sub = p.add_subparsers(dest="command")
    for name in ("check", "process"):
        sub.add_parser(name, parents=[common], help="")
    rep = sub.add_parser("report", parents=[common], help="mostra o relatório de um pedido")
    rep.add_argument("id", nargs="?", default="", help="id ou orderNumber do pedido")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "check":
            return cmd_check(args)
        if args.command == "process":
            return cmd_process(args)
        if args.command == "report":
            return cmd_report(args)
        print(build_parser().format_help())
        return 0
    except (llm_mod.VisionError, ocr_mod.OcrError, RuntimeError) as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())