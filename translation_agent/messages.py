"""Gestão dos ficheiros next-intl (messages/*.json).

Garante que todos os locales têm todas as chaves existentes em pt.json.
Chaves em falta (ou vazias) são traduzidas pelo agente e gravadas de volta;
chaves existentes mantêm-se (respeita o trabalho humano prévio).
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Dict

from . import config
from .translator import Translator


def _flatten(obj, prefix="", out=None):
    if out is None:
        out = {}
    if isinstance(obj, dict):
        for k, v in obj.items():
            _flatten(v, f"{prefix}{k}.", out)
    elif isinstance(obj, str):
        out[prefix.rstrip(".")] = obj
    return out


def _unflatten(flat: Dict[str, str]) -> Dict:
    root: Dict = {}
    for path, value in flat.items():
        node = root
        parts = path.split(".")
        for part in parts[:-1]:
            node = node.setdefault(part, {})
        node[parts[-1]] = value
    return root


def sync_messages_locale(
    translator: Translator,
    locale: str,
    messages_dir: Path | None = None,
    force: bool = False,
) -> int:
    """Sincroniza `locale.json` face a pt.json; devolve nº de strings traduzidas."""
    messages_dir = messages_dir or config.MESSAGES_DIR
    src_file = messages_dir / f"{config.DEFAULT_LOCALE}.json"
    dst_file = messages_dir / f"{locale}.json"

    if not src_file.exists():
        raise FileNotFoundError(f"Fonte não encontrada: {src_file}")

    source = _flatten(json.loads(src_file.read_text(encoding="utf-8")))
    existing = _flatten(json.loads(dst_file.read_text(encoding="utf-8"))) if dst_file.exists() else {}

    to_translate = []
    for key, value in source.items():
        current = existing.get(key, "")
        if force or not current or current == value:
            to_translate.append((key, value))

    by_text: Dict[str, str] = {}
    for key, value in to_translate:
        by_text[key] = value

    unique_texts = list({v for v in by_text.values() if v})
    translated_map = translator.translate_many(unique_texts, locale)

    for key, value in by_text.items():
        translated = translated_map.get(value, value)
        existing[key] = translated

    merged = _unflatten(existing)
    # preserva tipos não-strings (ex: números) vindos do ficheiro original
    original = json.loads(dst_file.read_text(encoding="utf-8")) if dst_file.exists() else {}

    def deep_merge(target, source_node):
        for k, v in source_node.items():
            if isinstance(v, dict):
                target[k] = deep_merge(target.get(k, {}), v)
            elif not isinstance(target.get(k), str):
                target[k] = v
        return target

    deep_merge(merged, original)

    dst_file.write_text(
        json.dumps(merged, ensure_ascii=False, indent=2) + "\n", encoding="utf-8"
    )
    return len(to_translate)