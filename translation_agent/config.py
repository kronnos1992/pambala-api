"""Configuração do agente de tradução.

Lê variáveis de ambiente (ou um ficheiro .env) para:
  - OPENAI_API_KEY      chave da API (obrigatória)
  - OPENAI_BASE_URL     url base OpenAI-compatível (default https://api.openai.com/v1)
  - OPENAI_MODEL        modelo (default "gpt-4o-mini")
  - DATABASE_URL        caminho para a base SQLite (default file:./dev.db)

Caminhos por omissão assumem que este package vive em:
  <repo>/pambala-api/translation-agent/
"""
from __future__ import annotations

import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
API_REPO = PACKAGE_DIR.parent
UI_REPO = API_REPO.parent / "pambala-ui"

DEFAULT_LOCALE = "pt"
SUPPORTED_LOCALES = ["pt", "en", "es", "fr", "zh", "ar"]
TARGET_LOCALES = [loc for loc in SUPPORTED_LOCALES if loc != DEFAULT_LOCALE]

_env_messages = os.environ.get("PAMBALA_MESSAGES_DIR") or ""
MESSAGES_DIR = Path(_env_messages).resolve() if _env_messages else (UI_REPO / "src" / "messages")
_env_glossary = os.environ.get("PAMBALA_GLOSSARY_FILE") or ""
GLOSSARY_FILE = Path(_env_glossary).resolve() if _env_glossary else (PACKAGE_DIR / "glossary.json")


def _load_dotenv(path: Path) -> None:
    if not path.exists():
        return
    for line in path.read_text(encoding="utf-8").splitlines():
        line = line.strip()
        if not line or line.startswith("#") or "=" not in line:
            continue
        key, _, value = line.partition("=")
        key = key.strip()
        value = value.strip().strip('"').strip("'")
        if key and key not in os.environ:
            os.environ[key] = value


_load_dotenv(API_REPO / ".env")


def database_path() -> Path:
    url = os.environ.get("DATABASE_URL", "file:./dev.db")
    if url.startswith("file:"):
        p = url[len("file:") :]
        path = Path(p)
        if not path.is_absolute():
            path = API_REPO / path
        return path
    raise RuntimeError(
        f"Este agente suporta apenas SQLite (DATABASE_URL começando por 'file:'). Obtido: {url}"
    )


def llm_config() -> dict:
    key = os.environ.get("OPENAI_API_KEY", "")
    return {
        "api_key": key,
        "base_url": os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/"),
        "model": os.environ.get("OPENAI_MODEL", "openai/gpt-4.1-nano"),
    }