"""Memória de tradução / glossário do agente (auto-treinamento).

Base de conhecimento persistente num ficheiro JSON com duas partes:

  * `terms`  - glossário termo-a-termo (termo pt -> traduções por locale),
               usado no prompt para forçar consistência (marcas, categorias).
  * `memory` - memória de frases completas já traduzidas (input -> {locale: out}),
               permite não re-traduzir conteúdo idêntico e evita custos.

Treino inicial: `train_from_messages()` extrai pares reconhecidos dos ficheiros
next-intl existentes (messages/*.json), que já vêm traduzidos por humanos.
Desta forma o agente arranca "treinado" e vai relembrando as correções ao longo
das execuções.
"""
from __future__ import annotations

import json
from pathlib import Path
from typing import Any, Dict, List, Optional

from . import config

# Termos de domínio do marketplace que devem manter-se consistentes.
SEED_TERMS: Dict[str, Dict[str, str]] = {
    "Angola": {"en": "Angola", "es": "Angola", "fr": "Angola", "zh": "安哥拉", "ar": "أنغولا"},
    "Luanda": {"en": "Luanda", "es": "Luanda", "fr": "Luanda", "zh": "罗安达", "ar": "لواندا"},
    "Multicaixa Express": {
        "en": "Multicaixa Express", "es": "Multicaixa Express",
        "fr": "Multicaixa Express", "zh": "Multicaixa Express", "ar": "ملتيكايكا إكسبريس",
    },
    "iPhone": {"en": "iPhone", "es": "iPhone", "fr": "iPhone", "zh": "iPhone", "ar": "آيفون"},
    "Samsung Galaxy": {
        "en": "Samsung Galaxy", "es": "Samsung Galaxy", "fr": "Samsung Galaxy",
        "zh": "三星Galaxy", "ar": "سامسونج جالاكسي",
    },
    "Xiaomi": {"en": "Xiaomi", "es": "Xiaomi", "fr": "Xiaomi", "zh": "小米", "ar": "شاومي"},
    "Nike": {"en": "Nike", "es": "Nike", "fr": "Nike", "zh": "耐克", "ar": "نايكي"},
    "Adidas": {"en": "Adidas", "es": "Adidas", "fr": "Adidas", "zh": "阿迪达斯", "ar": "أديداس"},
    "Samsung": {"en": "Samsung", "es": "Samsung", "fr": "Samsung", "zh": "三星", "ar": "سامسونج"},
    "Apple": {"en": "Apple", "es": "Apple", "fr": "Apple", "zh": "苹果", "ar": "آبل"},
    "Android": {"en": "Android", "es": "Android", "fr": "Android", "zh": "安卓", "ar": "أندرويد"},
    "iOS": {"en": "iOS", "es": "iOS", "fr": "iOS", "zh": "iOS", "ar": "آي أو إس"},
}


class Glossary:
    """Persistente: carrega/guarda o glossário e memória de tradução."""

    def __init__(self, path: Optional[Path] = None) -> None:
        self.path = path or config.GLOSSARY_FILE
        self.terms: Dict[str, Dict[str, str]] = dict(SEED_TERMS)
        self.memory: Dict[str, Dict[str, str]] = {}
        self._load()

    def _load(self) -> None:
        if not self.path.exists():
            return
        try:
            data = json.loads(self.path.read_text(encoding="utf-8"))
        except (json.JSONDecodeError, OSError):
            return
        if isinstance(data, dict):
            terms = data.get("terms")
            if isinstance(terms, dict):
                self.terms.update(terms)
            memory = data.get("memory")
            if isinstance(memory, dict):
                self.memory = {str(k): v for k, v in memory.items()}

    def save(self) -> None:
        data = {"terms": self.terms, "memory": self.memory}
        self.path.parent.mkdir(parents=True, exist_ok=True)
        self.path.write_text(
            json.dumps(data, ensure_ascii=False, indent=2), encoding="utf-8"
        )

    # ---- components do prompt ----
    def terms_block(self, locales: Optional[List[str]] = None) -> str:
        """Reconhece termos que devem ser usados nas traduções."""
        locales = locales or config.TARGET_LOCALES
        lines = []
        for term, trans in sorted(self.terms.items()):
            mapped = {loc: trans.get(loc, "") for loc in locales}
            if any(mapped.values()):
                lines.append(f"- \"{term}\" -> {mapped}")
        if not lines:
            return ""
        return "GLOSSÁRIO OBRIGATÓRIO (usa SEMPRE estas traduções para estes termos):\n" + "\n".join(lines)

    # ---- auto-treinamento ----
    def train_from_messages(self, messages_dir: Optional[Path] = None) -> int:
        """Extrai pares fonte->tradução dos ficheiros next-intl como treino.

        Só adiciona quando o valor-fonte é uma frase/token curto e útil
        (não contém placeholders nem é demasiado longa).
        """
        messages_dir = messages_dir or config.MESSAGES_DIR
        src_file = messages_dir / f"{config.DEFAULT_LOCALE}.json"
        if not src_file.exists():
            return 0

        def flatten(obj: Any, prefix: str = "") -> Dict[str, str]:
            pairs: Dict[str, str] = {}
            if isinstance(obj, dict):
                for k, v in obj.items():
                    pairs.update(flatten(v, f"{prefix}{k}."))
            elif isinstance(obj, str):
                pairs[prefix.rstrip(".")] = obj
            return pairs

        try:
            source = flatten(json.loads(src_file.read_text(encoding="utf-8")))
        except (json.JSONDecodeError, OSError):
            return 0

        added = 0
        for locale in config.TARGET_LOCALES:
            loc_file = messages_dir / f"{locale}.json"
            if not loc_file.exists():
                continue
            try:
                target = flatten(json.loads(loc_file.read_text(encoding="utf-8")))
            except (json.JSONDecodeError, OSError):
                continue
            for key, value in source.items():
                existing = value
                translated = target.get(key, "")
                if not translated or translated == existing:
                    continue
                if "{" in existing and "}" in existing:
                    continue  # com placeholders do next-intl; não dá para fixar
                if len(translated) > 200:
                    continue
                if self.memory.get(existing, {}).get(locale) != translated:
                    self._learn(existing, locale, translated)
                    added += 1
        return added

    def _learn(self, source: str, locale: str, translated: str) -> None:
        if not source or not translated:
            return
        self.memory.setdefault(source, {})[locale] = translated

    def learn(self, source: str, translations: Dict[str, str]) -> None:
        for locale, value in translations.items():
            if value:
                self._learn(source, locale, value)

    def lookup(self, source: str, locale: str) -> Optional[str]:
        entry = self.memory.get(source)
        if entry:
            return entry.get(locale)
        return None

    def stats(self) -> Dict[str, int]:
        return {"terms": len(self.terms), "memory": len(self.memory)}