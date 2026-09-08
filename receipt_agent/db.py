"""Acesso ao SQLite do Pambala para o agente de comprovativos.

O ciclo usa a fila `ReceiptQueue` (criada pela API no upload):
  PENDING -> (claim) PROCESSING -> (complete) DONE
                                -> (fail)    PENDING (retry) | FAILED

A API e o agente partilham o mesmo ficheiro SQLite: o upload cria uma linha
na fila e o agente consome-a, gravando o resultado na tabela `Order`
(`validationStatus`/`validationResult`) e anexando um evento
`AGENT_REVIEW` em `paymentHistory`.

Compatibilidade: comprovativos enviados antes da introdução da fila (sem
linha na `ReceiptQueue`) são descobertos por varredura da `Order` e
tratados como pendentes; ao concluir, é criada a respetiva linha na fila.
"""
from __future__ import annotations

import datetime as dt
import json
import sqlite3
from typing import Any, Dict, List, Optional

from . import config


def _iso_now() -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"


def _parse_json(raw: Optional[str], fallback: Any) -> Any:
    if not raw:
        return fallback
    try:
        return json.loads(raw)
    except (ValueError, TypeError):
        return fallback


def parse_payment_details(raw: Optional[str]) -> Dict[str, Any]:
    data = _parse_json(raw, {})
    return data if isinstance(data, dict) else {}


class ReceiptDatabase:
    def __init__(self, db_path=None) -> None:
        self.db_path = db_path or config.database_path()

    # -- leitura -----------------------------------------------------------

    def pending(self, limit: int = 0, only: Optional[str] = None) -> List[dict]:
        """Trabalhos na fila (`status='PENDING'`) com tentativas disponíveis.

        Fallback: pedidos com `receiptImage` mas sem linha na fila (uploads
        feitos antes da introdução da `ReceiptQueue`).
        """
        params: List[Any] = []
        if only:
            where = "(o.id = ? OR o.orderNumber = ?)"
            params = [only, only]
        else:
            where = "q.status = 'PENDING' AND q.attempts < q.maxAttempts"

        query = f"""
            SELECT o.id, o.orderNumber, o.total, o.paymentMethod,
                   o.paymentStatus, o.paymentDetails, o.paymentHistory,
                   o.validationStatus, o.validationResult, o.receiptImage,
                   q.id AS jobId, q.attempts, q.maxAttempts,
                   u.aiValidationConsent, o.paymentCode, o.createdAt
            FROM "Order" o
            JOIN "ReceiptQueue" q ON q.orderId = o.id
            JOIN "User" u ON u.id = o.userId
            WHERE {where}
            ORDER BY q.enqueuedAt ASC
        """
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, params).fetchall()

        out = [self._row_to_item(r) for r in rows]

        if not only:
            out += self._legacy_pending(limit)

        if limit and len(out) > limit:
            out = out[:limit]
        return out

    def _legacy_pending(self, limit: int = 0) -> List[dict]:
        query = """
            SELECT o.id, o.orderNumber, o.total, o.paymentMethod,
                   o.paymentStatus, o.paymentDetails, o.paymentHistory,
                   o.validationStatus, o.validationResult, o.receiptImage,
                   NULL AS jobId, 0 AS attempts, 3 AS maxAttempts,
                   0 AS aiValidationConsent, o.paymentCode, o.createdAt
            FROM "Order" o
            WHERE o.receiptImage IS NOT NULL AND o.receiptImage != ''
              AND o.paymentMethod != 'CASH_ON_DELIVERY'
              AND NOT EXISTS (
                  SELECT 1 FROM "ReceiptQueue" q2 WHERE q2.orderId = o.id
              )
              AND (o.validationResult IS NULL
                   OR json_extract(o.validationResult, '$.agentProcessedAt') IS NULL)
            ORDER BY o.updatedAt DESC
        """
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query).fetchall()
        out = [self._row_to_item(r) for r in rows]
        if limit and len(out) > limit:
            out = out[:limit]
        return out

    @staticmethod
    def _row_to_item(r) -> dict:
        return {
            "id": r[0],
            "orderNumber": r[1],
            "total": r[2],
            "paymentMethod": r[3],
            "paymentStatus": r[4],
            "paymentDetails": parse_payment_details(r[5]),
            "paymentHistory": r[6] or "[]",
            "validationStatus": r[7],
            "validationResult": _parse_json(r[8], {}),
            "receiptImage": r[9],
            "jobId": r[10],
            "attempts": r[11],
            "maxAttempts": r[12],
            "aiValidationConsent": bool(r[13]),
            "paymentCode": r[14] if len(r) > 14 else None,
            "createdAt": r[15] if len(r) > 15 else None,
        }

    def find_duplicate_receipt(self, order_id: str, file_hash: str) -> Optional[dict]:
        """Procura se outro pedido já utilizou o mesmo hash SHA-256 de comprovativo."""
        if not file_hash:
            return None
        query = """
            SELECT id, orderNumber, paymentStatus, validationStatus
            FROM "Order"
            WHERE id != ?
              AND (
                  json_extract(validationResult, '$.forensics.signals.hash') = ?
                  OR json_extract(validationResult, '$.forensics.hash') = ?
              )
            LIMIT 1
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(query, (order_id, file_hash, file_hash)).fetchone()
            if row:
                return {
                    "id": row[0],
                    "orderNumber": row[1],
                    "paymentStatus": row[2],
                    "validationStatus": row[3],
                }
        return None

    def find_duplicate_fingerprint(self, order_id: str, fingerprint: str) -> Optional[dict]:
        """Procura se outro pedido já utilizou a mesma fingerprint lógica de transação."""
        if not fingerprint:
            return None
        query = """
            SELECT id, orderNumber, paymentStatus, validationStatus
            FROM "Order"
            WHERE id != ?
              AND (
                  transactionFingerprint = ?
                  OR json_extract(validationResult, '$.transaction.fingerprint') = ?
              )
            LIMIT 1
        """
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(query, (order_id, fingerprint, fingerprint)).fetchone()
            if row:
                return {
                    "id": row[0],
                    "orderNumber": row[1],
                    "paymentStatus": row[2],
                    "validationStatus": row[3],
                }
        return None

    # -- claim / complete / fail -------------------------------------------

    def claim(self, order_id: str) -> None:
        """Marca PROCESSING e incrementa tentativas (retry)."""
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE \"ReceiptQueue\" SET status = 'PROCESSING',"
                " attempts = attempts + 1, startedAt = ?, updatedAt = ?"
                " WHERE orderId = ?",
                (_iso_now(), _iso_now(), order_id),
            )

    def complete(self, order_id: str, result: Dict[str, Any]) -> None:
        """Grava o resultado na `Order` e fecha o trabalho na fila como DONE."""
        history = self._read_payment_history(order_id)
        history.append(self._history_entry(result))
        payload = json.dumps(result, ensure_ascii=False, default=str)
        fingerprint = result.get("transaction", {}).get("fingerprint")
        now = _iso_now()
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                'UPDATE "Order" SET validationStatus = ?, validationResult = ?,'
                " paymentHistory = ?, transactionFingerprint = COALESCE(?, transactionFingerprint) WHERE id = ?",
                (result.get("status", "MANUAL_REVIEW"), payload, json.dumps(history), fingerprint, order_id),
            )
            # upsert da linha de fila (pode não existir em uploads legados)
            conn.execute(
                """
                INSERT INTO "ReceiptQueue" (id, orderId, status, attempts, result,
                                            enqueuedAt, completedAt, updatedAt)
                SELECT ?, ?, 'DONE', 1, ?, ?, ?, ?
                WHERE NOT EXISTS (SELECT 1 FROM "ReceiptQueue" WHERE orderId = ?)
                """,
                ("rq_legacy_" + order_id[:8], order_id, payload,
                 _iso_now(), now, now, order_id),
            )
            conn.execute(
                "UPDATE \"ReceiptQueue\" SET status = 'DONE', result = ?,"
                " completedAt = ?, updatedAt = ? WHERE orderId = ?",
                (payload, now, now, order_id),
            )

    def fail(self, order_id: str, error: str, attempts: int, max_attempts: int) -> None:
        """Requeue para PENDING se ainda houver tentativas; senão marca FAILED."""
        requeue = attempts < max_attempts
        status = "PENDING" if requeue else "FAILED"
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(
                "UPDATE \"ReceiptQueue\" SET status = ?, lastError = ?,"
                " updatedAt = ? WHERE orderId = ?",
                (status, error[:2000], _iso_now(), order_id),
            )

    def _read_payment_history(self, order_id: str) -> list:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT paymentHistory FROM \"Order\" WHERE id = ?", (order_id,)
            ).fetchone()
        if not row:
            return []
        history = _parse_json(row[0], [])
        return history if isinstance(history, list) else []

    @staticmethod
    def _history_entry(result: Dict[str, Any]) -> Dict[str, Any]:
        return {
            "at": _iso_now(),
            "by": config.AGENT_NAME,
            "role": "AGENT",
            "action": "AGENT_REVIEW",
            "status": "AWAITING_PAYMENT",
            "validationStatus": result.get("status", "REVIEW"),
            "score": result.get("score", 0),
            "flags": result.get("flags", []),
        }

    # -- consultas ---------------------------------------------------------

    def get_validation(self, identifier: str) -> Dict[str, Any]:
        with sqlite3.connect(self.db_path) as conn:
            row = conn.execute(
                "SELECT paymentHistory, validationStatus, validationResult,"
                " orderNumber FROM \"Order\" WHERE id = ? OR orderNumber = ?",
                (identifier, identifier),
            ).fetchone()
        if not row:
            return {}
        return {
            "paymentHistory": row[0] or "[]",
            "validationStatus": row[1],
            "validationResult": _parse_json(row[2], {}),
            "orderNumber": row[3],
        }

    def queue_stats(self) -> Dict[str, int]:
        out: Dict[str, int] = {}
        with sqlite3.connect(self.db_path) as conn:
            for s in ("PENDING", "PROCESSING", "DONE", "FAILED"):
                out[s.lower()] = conn.execute(
                    "SELECT COUNT(*) FROM \"ReceiptQueue\" WHERE status = ?", (s,)
                ).fetchone()[0]
        return out

    def stats(self) -> Dict[str, Any]:
        out: Dict[str, Any] = {}

        with sqlite3.connect(self.db_path) as conn:
            out["receipts_uploaded"] = conn.execute(
                'SELECT COUNT(*) FROM "Order"'
                " WHERE receiptImage IS NOT NULL AND receiptImage != ''"
            ).fetchone()[0]
            statuses = ["AQUEUE", "PROOF_ACCEPTED", "MANUAL_REVIEW", "PROOF_REJECTED", "PASS", "REVIEW", "FAIL"]
            for s in statuses:
                out[s.lower()] = conn.execute(
                    'SELECT COUNT(*) FROM "Order" WHERE validationStatus = ?',
                    (s,),
                ).fetchone()[0]
            n_agent = 0
            for r in conn.execute(
                'SELECT validationResult FROM "Order"'
                " WHERE validationResult IS NOT NULL"
            ).fetchall():
                v = _parse_json(r[0], {})
                if v.get("agentProcessedAt"):
                    n_agent += 1
            out["agent_reviewed"] = n_agent
            out["pending"] = conn.execute(
                "SELECT COUNT(*) FROM \"ReceiptQueue\""
                " WHERE status = 'PENDING' AND attempts < maxAttempts"
            ).fetchone()[0]
        return out