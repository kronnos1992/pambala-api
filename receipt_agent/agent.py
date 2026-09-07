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

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from receipt_agent import config
from receipt_agent import db as db_mod
from receipt_agent import forensics
from receipt_agent import llm as llm_mod
from receipt_agent import ocr as ocr_mod
from receipt_agent import verifier


def build_result(
    order: dict,
    text: str,
    ocr_engine: str,
    fore: dict,
    llm: dict | None,
    skipped_llm: bool,
) -> dict:
    ctx = verifier.build_context(order)
    cross = verifier.cross_check(text, ctx)
    decision = verifier.decide(cross, fore, llm)

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
        "flags": decision["flags"],
        "checks": {
            "score": cross["score"],
            "matched": cross["matched"],
            "missing": cross["missing"],
        },
        "context": {
            "expectedAmount": ctx.get("amount"),
            "entity": ctx.get("entity"),
            "reference": ctx.get("reference"),
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
    filename = order["receiptImage"].split("/")[-1]
    path = config.RECEIPTS_DIR / filename

    if not path.exists():
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
            "reasons": [f"Ficheiro {filename} não encontrado em {config.RECEIPTS_DIR}."],
        }
    else:
        fore = forensics.analyze(path, filename)

        text = ""
        ocr_engine = "unavailable"
        try:
            text, ocr_engine = ocr_mod.run_ocr(path)
        except ocr_mod.OcrError as e:
            fore["flags"].append("OCR_UNAVAILABLE")
            fore["reasons"].append(str(e))

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
                    llm_out = vision.review(path, verifier.build_context(order))
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
        result = build_result(order, text, ocr_engine, fore, llm_out, skipped)

    if dry:
        return result

    dbx.complete(order["id"], result)
    return result


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
    print(f"  pedidos: AQUEUE={stats['aqueue']} PASS={stats['pass']} "
          f"REVIEW={stats['review']} FAIL={stats['fail']}")

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

    counts = {"PASS": 0, "REVIEW": 0, "FAIL": 0}
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
            counts["REVIEW"] += 1
            continue
        counts[result["status"]] = counts.get(result["status"], 0) + 1
        flags = ",".join(result["flags"]) or "-"
        print(
            f"  {order['orderNumber']}  {result['status']:6s} score={result['score']:3d} "
            f"flags=[{flags}]"
        )
        if result["reasons"]:
            for r in result["reasons"][:2]:
                print(f"      - {r}")

    print(f"\nResumo: PASS={counts['PASS']} REVIEW={counts['REVIEW']} FAIL={counts['FAIL']} (total {len(pending)})")
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