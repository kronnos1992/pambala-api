#!/usr/bin/env python3
"""CLI do agente de tradução do Pambala.

Comandos:
  check        estado da base e das mensagens (sem chamar o LLM)
  train        atualiza o glossário (memória de tradução) a partir dos messages
  db           traduz conteúdo em falta na base (Category/Product/Store)
  messages     sincroniza as mensagens de UI (chaves em falta vs pt.json)
  all          (omitir comando) check + train + db + messages

Opções comuns:
  --locale en,es,fr,zh,ar   locales alvo (default: todos menos pt)
  --dry-run                 apenas lista o que seria traduzido (não grava, não chama o LLM)
  --force                   (messages) re-traduz também chaves já preenchidas
  --entity category,product,store   (db) entidades a processar
  --limit N                 limita nº de itens traduzidos por entidade/locale
"""
from __future__ import annotations

import argparse
import json
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from translation_agent import config
from translation_agent.glossary import Glossary
from translation_agent.llm import LLMClient, TranslationError
from translation_agent.translator import Translator
from translation_agent import db as db_mod
from translation_agent import messages as messages_mod


def _parse_locales(raw) -> list:
    if not raw:
        return config.TARGET_LOCALES
    out = []
    for chunk in raw.split(","):
        loc = chunk.strip()
        if loc and loc in config.SUPPORTED_LOCALES and loc != config.DEFAULT_LOCALE:
            out.append(loc)
    invalid = [c for c in raw.split(",") if c.strip() and c.strip() not in config.SUPPORTED_LOCALES]
    if invalid:
        sys.exit(f"Locales inválidos: {', '.join(invalid)}. Válidos(pt base): {config.TARGET_LOCALES}")
    return out


def _parse_entities(raw) -> list:
    if not raw:
        return ["category", "product", "store"]
    out = []
    for chunk in raw.split(","):
        e = chunk.strip()
        if e in db_mod._ENTITIES:
            out.append(e)
        else:
            sys.exit(f"Entidade inválida: {e}. Válidas: {list(db_mod._ENTITIES)}")
    return out


def cmd_check(args) -> int:
    dbx = db_mod.DatabaseTranslator()
    base_counts = {}
    with db_mod.sqlite3.connect(dbx.db_path) as conn:
        for tbl in ["Category", "Product", "Store"]:
            base_counts[tbl] = conn.execute(f'SELECT COUNT(*) FROM "{tbl}"').fetchone()[0]
    t_counts = dbx.stats()
    print("== Base ==")
    for tbl, n in base_counts.items():
        print(f"  {tbl:10s} {n} registos | traduções: {t_counts.get(tbl.lower(), 0)}")
    print("\n== Em falta por locale ==")
    print("  locale     category   product     store")
    for loc in config.TARGET_LOCALES:
        row = "  "
        row += f" {loc:3s}      "
        for entity in ["category", "product", "store"]:
            missing = len(dbx.find_untranslated(entity, loc))
            row += f"{missing:10d}"
        print(row)
    print("\n== Mensagens ==")
    for loc in config.TARGET_LOCALES:
        src = messages_mod._flatten(json.loads(
            (config.MESSAGES_DIR / f"{config.DEFAULT_LOCALE}.json").read_text(encoding="utf-8")))
        dst_file = config.MESSAGES_DIR / f"{loc}.json"
        dst = messages_mod._flatten(json.loads(dst_file.read_text(encoding="utf-8"))) if dst_file.exists() else {}
        missing = sum(1 for k in src if k not in dst)
        identical = sum(1 for k, v in src.items() if dst.get(k) == v)
        print(f"  {loc:3s} chaves={len(src):4d} faltantes={missing:4d} iguais_ao_pt={identical:4d}")
    g = Glossary()
    g.train_from_messages()
    print("\n== Glossário ==")
    print(f"  termos={g.stats()['terms']} memória={g.stats()['memory']} (após re-treino a partir de messages)")
    return 0


def cmd_train(args) -> int:
    g = Glossary()
    added = g.train_from_messages()
    g.save()
    print(f"Glossário: +{added} novas memórias. {g.stats()}")
    return 0


def _fresh_translator(dry_run: bool):
    """Devolve Translator auto-treinado (ou None em dry-run, sem chamar o LLM)."""
    g = Glossary()
    g.train_from_messages()  # auto-treino: memória derivada do corpus traduzido
    if dry_run:
        return None, g
    return Translator(glossary=g, llm=LLMClient()), g


def cmd_db(args) -> int:
    locales = _parse_locales(args.locale)
    entities = _parse_entities(args.entity)
    dry = args.dry_run

    dbx = db_mod.DatabaseTranslator()
    translator, g = _fresh_translator(dry)

    total = 0
    for entity in entities:
        for locale in locales:
            items = dbx.find_untranslated(entity, locale)
            if args.limit:
                items = items[: args.limit]
            if not items:
                continue
            # recolhe todos os valores de campo únicos a traduzir
            unique_values = []
            for _id, values in items:
                for v in values:
                    if v and v not in unique_values:
                        unique_values.append(v)
            print(f"[{entity} -> {locale}] {len(items)} itens, {len(unique_values)} textos únicos"
                  + (" (dry-run, nada gravado)" if dry else ""))
            if not unique_values:
                continue
            if dry:
                for _id, values in items[:3]:
                    print(f"  exemplo: {_id} {values}")
                continue
            translated_map = translator.translate_many(unique_values, locale)
            updated = 0
            for _id, values in items:
                fields = {}
                for c, v in zip(db_mod._ENTITIES[entity][5], values):
                    if v and v in translated_map:
                        fields[c] = translated_map[v]
                if fields:
                    dbx.save_translations(entity, _id, locale, fields)
                    updated += 1
            total += updated
            g.save()
            print(f"    gravadas {updated} traduções")
    print(f"\nTotal gravado: {total} linhas de tradução.")
    return 0


def cmd_messages(args) -> int:
    locales = _parse_locales(args.locale)
    dry = args.dry_run
    translator, _g = _fresh_translator(dry)

    for locale in locales:
        src = messages_mod._flatten(json.loads(
            (config.MESSAGES_DIR / f"{config.DEFAULT_LOCALE}.json").read_text(encoding="utf-8")))
        dst_file = config.MESSAGES_DIR / f"{locale}.json"
        dst = messages_mod._flatten(json.loads(dst_file.read_text(encoding="utf-8"))) if dst_file.exists() else {}
        need = [k for k, v in src.items()
                if args.force or not dst.get(k) or dst.get(k) == v]
        print(f"[messages -> {locale}] {len(need)} chaves"
              + (" (dry-run, nada escrito)" if dry else ""))
        if dry:
            for k in need[:5]:
                print(f"  exemplo: {k} = {src[k][:60]!r}")
            continue
        if not need:
            continue
        n = messages_mod.sync_messages_locale(translator, locale, force=args.force)
        print(f"    sincronizadas {n} chaves -> {dst_file.name}")
    return 0


def build_parser() -> argparse.ArgumentParser:
    common = argparse.ArgumentParser(add_help=False)
    common.add_argument("--locale", default="", help="locales alvo, ex: en,es,fr,zh,ar")
    common.add_argument("--entity", default="", help="entidades, ex: category,product,store")
    common.add_argument("--dry-run", action="store_true", help="não grava nem chama o LLM")
    common.add_argument("--force", action="store_true", help="(messages) re-traduz chaves já traduzidas")
    common.add_argument("--limit", type=int, default=0, help="(db) limite de itens por entidade/locale")

    p = argparse.ArgumentParser(
        description="Agente de tradução do Pambala.",
        parents=[common],
    )
    sub = p.add_subparsers(dest="command")
    for name in ("check", "train", "db", "messages"):
        sub.add_parser(name, parents=[common], help="")
    return p


def main(argv=None) -> int:
    args = build_parser().parse_args(argv)
    try:
        if args.command == "check":
            return cmd_check(args)
        if args.command == "train":
            return cmd_train(args)
        if args.command == "db":
            return cmd_db(args)
        if args.command == "messages":
            return cmd_messages(args)
        # sem comando = tudo
        cmd_check(args)
        print()
        cmd_train(args)
        print()
        cmd_db(args)
        print()
        cmd_messages(args)
        return 0
    except TranslationError as e:
        print(f"ERRO: {e}", file=sys.stderr)
        return 2


if __name__ == "__main__":
    raise SystemExit(main())