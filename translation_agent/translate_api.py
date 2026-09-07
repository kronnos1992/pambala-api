#!/usr/bin/env python3
"""API wrapper para o translation_agent - permite ser chamado via subprocess."""
import json
import sys
from pathlib import Path

# Add parent to path para importar translation_agent
sys.path.insert(0, str(Path(__file__).resolve().parent))

from translation_agent import config
from translation_agent.glossary import Glossary
from translation_agent.llm import LLMClient
from translation_agent.translator import Translator


def translate_texts(texts: list, locale: str, source: str = "pt") -> dict:
    """Traduz uma lista de textos e retorna um dicionário."""
    if not texts:
        return {}

    # Skip if same locale
    if locale == source:
        return {t: t for t in texts}

    # Initialize translator
    glossary = Glossary()
    glossary.train_from_messages()  # Auto-train from existing messages

    try:
        translator = Translator(glossary=glossary, llm=LLMClient())
    except Exception as e:
        # If LLM fails, try glossary only
        print(f"Warning: LLM initialization failed: {e}", file=sys.stderr)
        translator = Translator(glossary=glossary, llm=None)

    # Translate
    return translator.translate_many(texts, locale, source=source, learn=True)


if __name__ == "__main__":
    try:
        # Read JSON from stdin
        input_data = sys.stdin.read()
        data = json.loads(input_data)
        
        texts = data.get("texts", [])
        locale = data.get("locale", "")
        source = data.get("source", "pt")

        if not texts:
            print(json.dumps({}))
            sys.exit(0)

        result = translate_texts(texts, locale, source)
        print(json.dumps(result, ensure_ascii=False))
    except Exception as e:
        print(json.dumps({"error": str(e)}), file=sys.stderr)
        sys.exit(1)

