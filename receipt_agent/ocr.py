"""OCR do comprovativo com Tesseract (português).

Tenta, por ordem:
  1. biblioteca `pytesseract` (se instalada);
  2. binário `tesseract` via subprocess;
  3. binário indicado em `TESSERACT_CMD`.

Usa `--tessdata-dir` apontando para `langdata/` do projeto
(onde vive `por.traineddata`, o mesmo usado pelo tesseract.js da API).
"""
from __future__ import annotations

import shutil
import subprocess
from pathlib import Path
from typing import Any, Dict, Optional, Tuple

from . import config


class OcrError(RuntimeError):
    pass


def _usable_tessdata_dir() -> Optional[Path]:
    """Diretório tessdata do projeto, apenas se contiver `por.traineddata`
    pronto a usar. O `langdata/` guarda `por.traineddata.gz` (usado pelo
    tesseract.js da API), que o binário tesseract 5.5 não consegue ler —
    nesses casos usa-se o tessdata do sistema."""
    if not config.TESSDATA_DIR.exists():
        return None
    if (config.TESSDATA_DIR / f"{config.DEFAULT_OCR_LANG}.traineddata").is_file():
        return config.TESSDATA_DIR
    return None


def _tessdata_args() -> list:
    d = _usable_tessdata_dir()
    return ["--tessdata-dir", str(d)] if d else []


def tesseract_binary() -> Optional[str]:
    import os

    cmd = os.environ.get("TESSERACT_CMD", "")
    if cmd and Path(cmd).exists():
        return cmd
    return shutil.which("tesseract")


def _via_pytesseract(path: Path) -> Optional[Tuple[str, str]]:
    try:
        import pytesseract  # type: ignore
    except Exception:
        return None
    try:
        kwargs: Dict[str, Any] = {"lang": config.DEFAULT_OCR_LANG}
        td = _usable_tessdata_dir()
        if td:
            kwargs["config"] = f"--tessdata-dir {td}"
        text = pytesseract.image_to_string(str(path), **kwargs)
        return text or "", "pytesseract"
    except Exception:
        return None


def _via_cli(path: Path) -> Optional[Tuple[str, str]]:
    binary = tesseract_binary()
    if not binary:
        return None
    try:
        proc = subprocess.run(
            [binary, str(path), "stdout", "-l", config.DEFAULT_OCR_LANG,
             *_tessdata_args(), "--psm", "6"],
            capture_output=True,
            text=True,
            timeout=120,
        )
        if proc.returncode != 0:
            return None
        return proc.stdout or "", "tesseract-cli"
    except Exception:
        return None


def run_ocr(path: Path) -> Tuple[str, str]:
    """Devolve (texto, motor). Levanta OcrError se nenhum motor estiver disponível."""
    for loader in (_via_pytesseract, _via_cli):
        result = loader(path)
        if result is not None:
            return result
    raise OcrError(
        "OCR indisponível: instale o Tesseract (apt install tesseract-ocr por) "
        "e/ou `pip install pytesseract pillow`."
    )


def ocr_status() -> Dict[str, Any]:
    cli = tesseract_binary()
    pyt = None
    try:
        import pytesseract  # type: ignore

        pyt = True
    except Exception:
        pyt = False
    return {
        "binary": cli or None,
        "pytesseract": bool(pyt),
        "tessdata": str(config.TESSDATA_DIR) if config.TESSDATA_DIR.exists() else None,
        "available": bool(cli) or bool(pyt),
    }