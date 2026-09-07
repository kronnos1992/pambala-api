"""Configuração do agente de verificação de comprovativos.

Lê variáveis de ambiente (ou o ficheiro .env do pambala-api):
  - DATABASE_URL          caminho SQLite (default file:./dev.db)
  - RECEIPTS_DIR          pasta onde ficam os comprovativos (default uploads/)
  - TESSDATA_DIR          pasta com por.traineddata (default langdata/)
  - OPENAI_API_KEY        chave da API (obrigatória para a visão LLM)
  - OPENAI_BASE_URL       url base OpenAI-compatível (default OpenRouter)
  - OPENAI_MODEL          modelo de texto/JSON (não usado pelo agente)
  - OPENAI_VISION_MODEL   modelo de visão para autenticidade (default gpt-4o-mini)
  - RECEIPT_AGENT_PASS    score mínimo para PASS (default 80)
  - RECEIPT_AGENT_FAIL    score máximo para FAIL (default 40)

Caminhos por omissão assumem que este package vive em:
  <repo>/pambala-api/receipt_agent/
"""
from __future__ import annotations

import os
from pathlib import Path

PACKAGE_DIR = Path(__file__).resolve().parent
API_REPO = PACKAGE_DIR.parent

AGENT_NAME = "receipt_agent"
AGENT_VERSION = "1.0.0"

DEFAULT_OCR_LANG = "por"
STORE_METHOD_PAYMENT_TYPES = ("TRANSFER", "MULTICAIXA", "MULTICAIXA_EXPRESS")

PASS_THRESHOLD = int(os.environ.get("RECEIPT_AGENT_PASS", "80"))
FAIL_THRESHOLD = int(os.environ.get("RECEIPT_AGENT_FAIL", "40"))

ELA_SUSPICIOUS_RATIO = float(os.environ.get("RECEIPT_ELA_RATIO", "0.02"))
ELA_BLOCK_THRESHOLD = int(os.environ.get("RECEIPT_ELA_THRESHOLD", "12"))
SCREENSHOT_UNIFORM_RATIO = float(os.environ.get("RECEIPT_SCREENSHOT_RATIO", "0.35"))
MIN_IMAGE_SIDE = int(os.environ.get("RECEIPT_MIN_SIDE", "600"))

EDITOR_SIGNATURES = (
    "photoshop",
    "gimp",
    "affinity",
    "pixlr",
    "paint.net",
    "paint3d",
    "snapseed",
    "canva",
    "illustrator",
    "corel",
    "lightroom classic",
)

# Valores-limite para o passo de visão LLM
LLM_IMAGE_MAX_BYTES = 12 * 1024 * 1024

_env_receipts = os.environ.get("RECEIPTS_DIR") or ""
RECEIPTS_DIR = Path(_env_receipts).resolve() if _env_receipts else (API_REPO / "uploads")
_env_tessdata = os.environ.get("TESSDATA_DIR") or ""
TESSDATA_DIR = Path(_env_tessdata).resolve() if _env_tessdata else (API_REPO / "langdata")


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
        f"Este agente suporta apenas SQLite (DATABASE_URL a começar por 'file:'). Obtido: {url}"
    )


def llm_config() -> dict:
    key = os.environ.get("OPENAI_API_KEY", "")
    return {
        "api_key": key,
        "base_url": os.environ.get("OPENAI_BASE_URL", "https://openrouter.ai/api/v1").rstrip("/"),
        "model": os.environ.get("OPENAI_VISION_MODEL", "openai/gpt-4o-mini"),
    }