"""Avaliação semântica do comprovativo por visão LLM.

Cliente OpenAI-compatível (apenas stdlib) que envia a imagem como data URL
(base64) e devolve um veredicto estruturado:
  - objetivo: detetar edição, crop/colagem, screenshots suspeitos,
    inconsistências internas e indícios de falsificação;
  - o modelo recebe também o contexto esperado (valor, referência, entidade)
    para avaliação cruzada genérica;
  - resposta JSON validada; em caso de JSON inválido devolve veredicto
    REVIEW (seguro) com motivo do erro.
"""
from __future__ import annotations

import base64
import io
import json
import re
import time
import urllib.error
import urllib.request
from pathlib import Path
from typing import Any, Dict, Optional

from . import config

try:
    from PIL import Image as PILImage

    _HAS_PIL = True
except Exception:  # pragma: no cover - ambiente sem pillow
    PILImage = None
    _HAS_PIL = False

SYSTEM_PROMPT = (
    "És um perito forense em autenticidade de comprovativos de pagamento bancários "
    "(transferências Multicaixa Express, referências multicaixa e transferências angolanas). "
    "Inspeta a imagem e responde APENAS com JSON válido, sem markdown, com esta forma:\n"
    '{"verdict": "PASS"|"REVIEW"|"FAIL", "confidence": 0..1,\n'
    ' "flags": ["edicao_suspeita"|"screenshot_suspeito"|"crop_colagem"|"inconsistencia_interna"|...],\n'
    ' "extracted": {"amount": "valor observado", "reference": "referência observada"},\n'
    ' "rationale": "explicação curta e factual"}.\n'
    "Regras: FAIL apenas com evidência clara de falsificação/edição. REVIEW para dúvidas. "
    "PASS apenas se parecer genuíno e internamente consistente."
)


class VisionError(RuntimeError):
    pass


class VisionClient:
    def __init__(self, max_retries: int = 3, base_delay: float = 2.0) -> None:
        cfg = config.llm_config()
        if not cfg["api_key"]:
            raise VisionError(
                "OPENAI_API_KEY não definida — configure-a no ambiente ou no ficheiro .env "
                "para o passo de visão LLM funcionar."
            )
        self.api_key = cfg["api_key"]
        self.base_url = cfg["base_url"]
        self.model = cfg["model"]
        self.max_retries = max_retries
        self.base_delay = base_delay

    def _sanitized(self, path: Path) -> bytes:
        """Devolve os bytes da imagem SEM metadados (EXIF/GPS/XMP).

        Minimização (Lei 22/11 / Lei 7/17): o processador externo (LLM) recebe
        apenas o conteúdo visual, nunca metadados do ficheiro original. Recusa
        enviar a imagem original caso não seja possível remover os metadados.
        """
        if not _HAS_PIL:
            raise VisionError(
                "Impossível remover metadados (EXIF/GPS) antes do envio ao LLM: "
                "Pillow não instalado. Instale `pip install pillow`."
            )
        try:
            with PILImage.open(path) as im:
                has_alpha = im.mode in ("RGBA", "LA", "PA") or (
                    im.mode == "P" and "transparency" in im.info
                )
                fmt = "PNG" if has_alpha else "JPEG"
                if not has_alpha and im.mode != "RGB":
                    im = im.convert("RGB")
                buf = io.BytesIO()
                im.save(buf, fmt, quality=95)
                return buf.getvalue()
        except VisionError:
            raise
        except Exception as e:  # pragma: no cover
            raise VisionError(f"Não foi possível sanitizar a imagem (remover EXIF): {e}") from e

    def _image_data_url(self, path: Path) -> str:
        if path.suffix.lower() == ".pdf":
            raise VisionError(
                "Visão LLM não suporta PDF diretamente — converta para imagem "
                "(ex.: pdftoppm -png) para análise visual ou confie no texto extraído."
            )
        suffix = path.suffix.lower().lstrip(".") or "jpeg"
        mime = {
            "jpg": "image/jpeg", "jpeg": "image/jpeg", "png": "image/png",
            "webp": "image/webp", "gif": "image/gif", "heic": "image/heic",
        }.get(suffix, "image/jpeg")
        size = path.stat().st_size
        if size > config.LLM_IMAGE_MAX_BYTES:
            raise VisionError(
                f"Imagem demasiado grande para a visão LLM ({size // 1024} KB)."
            )
        data = self._sanitized(path)
        b64 = base64.b64encode(data).decode("ascii")
        return f"data:{mime};base64,{b64}"

    def review(self, image_path: Path, ctx: Dict[str, Any]) -> Dict[str, Any]:
        data_url = self._image_data_url(image_path)
        user_prompt = (
            "Comprovativo de pagamento. Contexto esperado do pedido:\n"
            + json.dumps(
                {
                    "valor_esperado": ctx.get("amount"),
                    "entidade": ctx.get("entity"),
                    "referencia": ctx.get("reference"),
                    "banco": ctx.get("bankName"),
                    "titular": ctx.get("ownerName"),
                    "codigo_confirmacao": ctx.get("confirmationCode"),
                },
                ensure_ascii=False,
            )
            + "\n\n"
            "Analisa a imagem e devolve o JSON conforme as regras."
        )
        payload = {
            "model": self.model,
            "temperature": 0.0,
            "max_tokens": 700,
            "messages": [
                {"role": "system", "content": SYSTEM_PROMPT},
                {
                    "role": "user",
                    "content": [
                        {"type": "image_url", "image_url": {"url": data_url}},
                        {"type": "text", "text": user_prompt},
                    ],
                },
            ],
        }
        content = self._post(payload)
        parsed = self._parse_json(content)
        return self._normalize(parsed, content)

    def _post(self, payload: dict) -> str:
        last_error: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                req = urllib.request.Request(
                    f"{self.base_url}/chat/completions",
                    data=json.dumps(payload).encode("utf-8"),
                    headers={
                        "Content-Type": "application/json",
                        "Authorization": f"Bearer {self.api_key}",
                    },
                    method="POST",
                )
                with urllib.request.urlopen(req, timeout=180) as resp:
                    body = resp.read().decode("utf-8")
                data = json.loads(body)
                return data["choices"][0]["message"]["content"].strip()
            except urllib.error.HTTPError as e:
                last_error = e
                if e.code == 401:
                    raise VisionError("OPENAI_API_KEY inválida ou sem permissões (HTTP 401).") from e
                if e.code in (429, 500, 502, 503, 504):
                    time.sleep(self.base_delay * (2**attempt))
                    continue
                raise VisionError(f"HTTP {e.code} do LLM: {e.read().decode(errors='replace')[:300]}") from e
            except urllib.error.URLError as e:
                last_error = e
                time.sleep(self.base_delay * (2**attempt))
        raise VisionError(
            f"Falhou a comunicação com o LLM após {self.max_retries} tentativas: {last_error}"
        )

    @staticmethod
    def _parse_json(content: str) -> Optional[Dict[str, Any]]:
        try:
            return json.loads(content)
        except (ValueError, TypeError):
            match = re.search(r"\{.*\}", content, re.DOTALL)
            if not match:
                return None
            try:
                return json.loads(match.group(0))
            except (ValueError, TypeError):
                return None

    @staticmethod
    def _normalize(parsed: Optional[Dict[str, Any]], raw: str) -> Dict[str, Any]:
        if not parsed or not isinstance(parsed, dict):
            return {
                "verdict": "REVIEW",
                "confidence": 0.0,
                "flags": ["llm_parse_error"],
                "extracted": {},
                "rationale": "Resposta não-JSON do modelo de visão.",
                "raw": raw[:400],
            }
        verdict = str(parsed.get("verdict", "REVIEW")).upper()
        if verdict not in ("PASS", "REVIEW", "FAIL"):
            verdict = "REVIEW"
        flags = parsed.get("flags") or []
        if not isinstance(flags, list):
            flags = [str(flags)]
        flags = [str(f) for f in flags]
        try:
            confidence = max(0.0, min(1.0, float(parsed.get("confidence", 0.0))))
        except (TypeError, ValueError):
            confidence = 0.0
        extracted = parsed.get("extracted")
        if not isinstance(extracted, dict):
            extracted = {}
        return {
            "verdict": verdict,
            "confidence": confidence,
            "flags": flags,
            "extracted": extracted,
            "rationale": str(parsed.get("rationale", ""))[:500],
        }


def llm_status() -> Dict[str, Any]:
    cfg = config.llm_config()
    return {
        "api_key_set": bool(cfg["api_key"]),
        "base_url": cfg["base_url"],
        "model": cfg["model"],
    }