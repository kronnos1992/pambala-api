"""Transporte HTTP do agente de comprovativos para o bridge da API (D1).

Quando `config.api_url()` está definida, o agente consome e grava a fila e os
pedidos através dos endpoints `/api/agent/*` expostos pelo Worker — em vez de
ler/gravar o SQLite local. Isto liga o agente (corre na VPS/cron) à base de
dados real de produção (Cloudflare D1), que a API usa.

A interface espelha `ReceiptDatabase` (SQLite) para que o resto do agente
(agent.py) seja agnóstico ao transporte.
"""
from __future__ import annotations

import json
import urllib.parse
import urllib.request
from typing import Any, Dict, List, Optional

from . import config


def _request(url: str, *, method: str = "GET", body: Any = None,
             timeout: int = 90) -> Any:
    headers = {
        "Content-Type": "application/json",
        "User-Agent": "PambalaReceiptAgent/1.0",
    }
    key = config.api_key()
    if key:
        headers["X-Agent-Key"] = key

    data = None
    if body is not None:
        data = json.dumps(body).encode("utf-8")

    req = urllib.request.Request(
        url,
        data=data,
        headers=headers,
        method=method,
    )
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        if not raw:
            return None
        return json.loads(raw)


class ApiTransport:
    """Bridge HTTP: consome/grava pedidos e fila via API Worker (D1)."""

    def __init__(self, base_url: str) -> None:
        self.base_url = base_url.rstrip("/")
        self.db_path = f"{self.base_url} (bridge HTTP → D1)"

    # -- helpers -----------------------------------------------------------

    def _url(self, path: str, **params: Any) -> str:
        suffix = ""
        qs = {k: v for k, v in params.items() if v not in (None, "", False)}
        if qs:
            suffix = "?" + urllib.parse.urlencode(qs)
        return f"{self.base_url}{path}{suffix}"

    # -- leitura -----------------------------------------------------------

    def pending(self, limit: int = 0, only: Optional[str] = None) -> List[dict]:
        params = {}
        if only:
            params["only"] = only
        if limit:
            params["limit"] = limit
        return _request(self._url("/receipts/pending", **params), method="GET") or []

    def find_duplicate_receipt(self, order_id: str, file_hash: str) -> Optional[dict]:
        if not file_hash:
            return None
        return _request(
            self._url("/receipts/duplicates/hash", orderId=order_id, hash=file_hash),
            method="GET",
        )

    def find_duplicate_fingerprint(self, order_id: str, fingerprint: str) -> Optional[dict]:
        if not fingerprint:
            return None
        return _request(
            self._url(
                "/receipts/duplicates/fingerprint",
                orderId=order_id,
                fingerprint=fingerprint,
            ),
            method="GET",
        )

    # -- mutations ---------------------------------------------------------

    def claim(self, order_id: str) -> None:
        _request(self._url(f"/receipts/{order_id}/claim"), method="POST", body={})

    def complete(self, order_id: str, result: Dict[str, Any]) -> None:
        _request(
            self._url(f"/receipts/{order_id}/complete"),
            method="POST",
            body=result,
        )

    def fail(self, order_id: str, error: str, attempts: int, max_attempts: int) -> None:
        _request(
            self._url(f"/receipts/{order_id}/fail"),
            method="POST",
            body={"error": error},
        )

    # -- consultas ---------------------------------------------------------

    def get_validation(self, identifier: str) -> Dict[str, Any]:
        return _request(
            self._url(f"/receipts/{identifier}/validation"),
            method="GET",
        ) or {}

    def queue_stats(self) -> Dict[str, int]:
        stats = self.stats()
        return {
            "pending": stats.get("pending", 0),
            "processing": stats.get("processing", 0),
            "done": stats.get("done", 0),
            "failed": stats.get("failed", 0),
        }

    def stats(self) -> Dict[str, Any]:
        return _request(self._url("/stats"), method="GET") or {}


def connect() -> ApiTransport:
    """Devolve o transporte ativo conforme a configuração."""
    return ApiTransport(config.api_url())