"""Cliente OpenAI-compatível (apenas stdlib, sem dependências externas).

Fala com qualquer endpoint que implemente POST {base_url}/chat/completions,
enviando um objeto {"model", "messages", "temperature"} e devolvendo a
primeira escolha em choices[0].message.content.
"""
from __future__ import annotations

import json
import time
import urllib.error
import urllib.request
from typing import Optional

from . import config


class TranslationError(RuntimeError):
    pass


class LLMClient:
    def __init__(self, max_retries: int = 3, base_delay: float = 2.0) -> None:
        cfg = config.llm_config()
        if not cfg["api_key"]:
            raise TranslationError(
                "OPENAI_API_KEY não definida. Configure-a no ambiente ou no ficheiro .env "
                "para o agente de tradução funcionar."
            )
        self.api_key = cfg["api_key"]
        self.base_url = cfg["base_url"]
        self.model = cfg["model"]
        self.max_retries = max_retries
        self.base_delay = base_delay

    def chat(self, system: str, user: str, temperature: float = 0.0) -> str:
        payload = {
            "model": self.model,
            "temperature": temperature,
            "messages": [
                {"role": "system", "content": system},
                {"role": "user", "content": user},
            ],
        }
        last_error: Optional[Exception] = None
        for attempt in range(self.max_retries):
            try:
                return self._post(payload)
            except urllib.error.HTTPError as e:
                last_error = e
                if e.code == 401:
                    raise TranslationError(
                        "OPENAI_API_KEY invalida ou faltam permissões (HTTP 401)."
                    ) from e
                if e.code in (429, 500, 502, 503, 504):
                    delay = self.base_delay * (2**attempt)
                    time.sleep(delay)
                    continue
                raise TranslationError(f"HTTP {e.code} do LLM: {e.read().decode(errors='replace')[:300]}") from e
            except urllib.error.URLError as e:
                last_error = e
                delay = self.base_delay * (2**attempt)
                time.sleep(delay)
        raise TranslationError(
            f"Falhou a comunicar com o LLM após {self.max_retries} tentativas: {last_error}"
        )

    def _post(self, payload: dict) -> str:
        req = urllib.request.Request(
            f"{self.base_url}/chat/completions",
            data=json.dumps(payload).encode("utf-8"),
            headers={
                "Content-Type": "application/json",
                "Authorization": f"Bearer {self.api_key}",
            },
            method="POST",
        )
        with urllib.request.urlopen(req, timeout=120) as resp:
            body = resp.read().decode("utf-8")
        data = json.loads(body)
        try:
            return data["choices"][0]["message"]["content"].strip()
        except (KeyError, IndexError, TypeError) as e:
            raise TranslationError(f"Resposta inesperada do LLM: {body[:300]}") from e