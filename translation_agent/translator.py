"""Núcleo de tradução: orquestra conteúdo do banco + ficheiros de mensagens.

Para cada texto, primeiro consulta a memória do glossário; se não existir,
pede ao LLM (com prompt que inclui o glossário) e aprende o resultado.
A saída é estruturada como JSON (muito robusto para validar/reutilizar).
"""
from __future__ import annotations

import json
import re
from typing import Dict, List, Optional

from . import config
from .glossary import Glossary
from .llm import LLMClient

SYSTEM_PROMPT = """És o agente de tradução profissional do Pambala, um marketplace de Angola.

Regras:
1. Língua de origem: português de Angola (pt). Simplicidade e tom neutro/marketing.
2. Traduz com naturalidade para a língua-alvo indicada, sem transliterar tudo.
3. GLOSSÁRIO: quando fornecido, usa SEMPRE exatamente essas traduções para esses termos
   (marcas, categorias, unidades de medida). Nunca inventes alternativas para termos do glossário.
4. Termos técnicos/marcas semelhantes (iPhone, USB-C, LED, Bluetooth) mantêm-se como estão,
   salvo indicação do glossário.
5. Números, preços (Kz / AKZ), URLs, placeholders entre chavetas (ex: {{nome}}, {{n}}),
   e nomes próprios não se alteram.
6. Não adiciones nem removas pontuação ou linhas.
7. A resposta DEVE ser apenas JSON válido no formato: {{"0": "...", "1": "..."}} usando
   exatamente as chaves pedidas. Sem markdown, sem texto extra.
"""

_PLACEHOLDER_RE = re.compile(r"\{[a-zA-Z0-9_.\-:]+\}")


def _escape_for_json(t: str) -> str:
    """Escapa uma string para ser embutida com segurança num JSON literal."""
    return json.dumps(t, ensure_ascii=False)


class Translator:
    def __init__(self, glossary: Optional[Glossary] = None, llm: Optional[LLMClient] = None) -> None:
        self.glossary = glossary or Glossary()
        self.llm = llm or LLMClient()

    def translate(
        self,
        text: str,
        locale: str,
        source: str = config.DEFAULT_LOCALE,
        learn: bool = True,
    ) -> str:
        """Traduz um único texto (usa memória quando existe)."""
        if not text or locale == source:
            return text
        cached = self.glossary.lookup(text, locale)
        if cached is not None:
            return cached

        result_map = self.translate_many([text], locale, source=source, learn=learn)
        return result_map.get(text, text)

    def translate_many(
        self,
        texts: List[str],
        locale: str,
        source: str = config.DEFAULT_LOCALE,
        learn: bool = True,
        batch_size: int = 40,
    ) -> Dict[str, str]:
        """Traduz uma lista de textos para `locale`, devolvendo {texto: tradução}."""
        if not texts:
            return {}

        unique = list(dict.fromkeys(texts))  # mantém ordem, remove duplicados
        result: Dict[str, str] = {}

        pending = []
        for t in unique:
            cached = self.glossary.lookup(t, locale)
            if cached is not None:
                result[t] = cached
            elif not t:
                result[t] = ""
            else:
                pending.append(t)

        for i in range(0, len(pending), batch_size):
            chunk = pending[i : i + batch_size]
            if not chunk:
                continue
            translated = self._remote(chunk, locale, source=source)
            for t, value in zip(chunk, translated):
                cleaned = self._normalize(value)
                result[t] = cleaned
                if learn and cleaned:
                    self.glossary.learn(t, {locale: cleaned})

        return result

    def _remote(self, texts: List[str], locale: str, source: str) -> List[str]:
        items = [(str(idx), t) for idx, t in enumerate(texts)]
        lines = []
        for idx, t in items:
            lines.append(f'  "{idx}": {_escape_for_json(t)}')
        user = (
            f"Língua-alvo: {locale} (código BCP-47).\n"
            f"Traduz o seguinte JSON de {source} -> {locale} e devolve apenas o JSON\n"
            f"com as mesmas chaves:\n{{\n" + ",\n".join(lines) + "\n}"
        )
        system = SYSTEM_PROMPT
        terms = self.glossary.terms_block([locale])
        if terms:
            system += "\n\n" + terms

        raw = self.llm.chat(system, user)
        parsed = self._parse_json_map(raw)
        if not parsed:
            raise RuntimeError(
                f"LLM devolveu JSON inválido para {len(texts)} textos. Falha crítica — "
                "nada é gravado. Resposta: " + raw[:300]
            )
        out = []
        for idx, t in items:
            out.append(parsed.get(str(idx)) or t)  # fallback: mantém original
        return out

    @staticmethod
    def _parse_json_map(raw: str) -> Optional[Dict[str, str]]:
        cleaned = raw.strip()
        cleaned = re.sub(r"^```(?:json)?\s*", "", cleaned)
        cleaned = re.sub(r"\s*```$", "", cleaned)
        try:
            data = json.loads(cleaned)
        except json.JSONDecodeError:
            return None
        if not isinstance(data, dict):
            return None
        return {str(k): (str(v) if v is not None else "") for k, v in data.items()}

    @staticmethod
    def _normalize(value: str) -> str:
        """Remove markdown/quotes acidentais do LLM, mantém placeholders."""
        value = value.strip()
        if len(value) >= 2 and value[0] == value[-1] and value[0] in "\"'`":
            value = value[1:-1].strip()
        return value

    # ---- mensagens (messages/*.json) ----
    def translate_messages_file(self, source_json: Dict, locale: str) -> Dict:
        """Traduz todas as strings-folha de um dicionário next-intl para `locale`."""
        texts: List[str] = []
        paths: List[str] = []

        def walk(obj, prefix=""):
            if isinstance(obj, dict):
                for k, v in obj.items():
                    walk(v, f"{prefix}{k}.")
            elif isinstance(obj, str):
                texts.append(obj)
                paths.append(prefix.rstrip("."))
            # números/booleanos ficam como estão

        walk(source_json)
        translated = self.translate_many(texts, locale)
        out: Dict = {}
        for path, value in zip(paths, texts):
            node = out
            parts = path.split(".")
            for part in parts[:-1]:
                node = node.setdefault(part, {})
            node[parts[-1]] = translated.get(value, value)
        return out