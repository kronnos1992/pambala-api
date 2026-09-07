"""Acesso à base SQLite do Pambala (apenas leitura do conteúdo-base + escrita
das tabelas *Translation).

Reutiliza o schema Prisma tal como vindo de `prisma db push`:
  - CategoryTranslation(categoryId, locale, name)
  - ProductTranslation(productId, locale, name, description)
  - StoreTranslation(storeId, locale, province, district)
Datas no mesmo formato ISO do Prisma (ex: 2026-09-06T15:36:41.439+00:00).
"""
from __future__ import annotations

import datetime as dt
import sqlite3
import uuid
from typing import Dict, List, Tuple

from . import config

# entity -> (tabela tradução, FK, campos traduzíveis, tabela base, coluna id, campos base)
_ENTITIES = {
    "category": (
        "CategoryTranslation",
        "categoryId",
        ["name"],
        "Category",
        "id",
        ["name"],
    ),
    "product": (
        "ProductTranslation",
        "productId",
        ["name", "description"],
        "Product",
        "id",
        ["name", "description"],
    ),
    "store": (
        "StoreTranslation",
        "storeId",
        ["province", "district"],
        "Store",
        "id",
        ["province", "district"],
    ),
}


def _iso_now() -> str:
    now = dt.datetime.now(dt.timezone.utc)
    return now.strftime("%Y-%m-%dT%H:%M:%S.%f")[:-3] + "+00:00"


class DatabaseTranslator:
    def __init__(self, db_path=None) -> None:
        self.db_path = db_path or config.database_path()

    def find_untranslated(self, entity: str, locale: str) -> List[Tuple[str, List[str]]]:
        """Devolve [(id, [campos base])] de conteúdo sem tradução em `locale`.

        Considera "sem tradução" a ausência de linha (id, locale). Se a linha já
        existe deixa-se tudo como está (não sobrescreve edições humanas).
        """
        table, fk, trans, base, id_col, base_cols = _ENTITIES[entity]
        select_cols = ", ".join(f"b.{c}" for c in base_cols)
        query = f"""
            SELECT b.{id_col}, {select_cols}
            FROM "{base}" b
            WHERE NOT EXISTS (
                SELECT 1 FROM "{table}" x
                WHERE x.{fk} = b.{id_col} AND x.locale = ?
            )
        """
        with sqlite3.connect(self.db_path) as conn:
            rows = conn.execute(query, (locale,)).fetchall()
        return [(row[0], list(row[1:])) for row in rows]

    def save_translations(
        self, entity: str, entity_id: str, locale: str, fields: Dict[str, str]
    ) -> None:
        """Insere/atualiza a linha de tradução para (entity_id, locale).

        `id` é gerado localmente (o cuid() do Prisma é cliente-side). O upsert
        usa o índice único (entityId, locale): se existir, atualiza os campos.
        """
        table, fk, trans, *_ = _ENTITIES[entity]
        cols = ["id", fk, "locale", *trans, "updatedAt"]
        now = _iso_now()
        new_id = "tr_" + uuid.uuid4().hex
        values = [new_id, entity_id, locale, *[fields.get(c, "") for c in trans], now]
        placeholders = ", ".join("?" for _ in cols)
        upsert = f"""
            INSERT INTO "{table}" ({", ".join(cols)})
            VALUES ({placeholders})
            ON CONFLICT({fk}, locale) DO UPDATE SET
                {"".join(f"{c} = excluded.{c}, " for c in trans)}updatedAt = excluded.updatedAt
        """
        with sqlite3.connect(self.db_path) as conn:
            conn.execute(upsert, values)

    def stats(self) -> Dict[str, int]:
        out = {}
        with sqlite3.connect(self.db_path) as conn:
            for entity, (table, *_rest) in _ENTITIES.items():
                out[entity] = conn.execute(f'SELECT COUNT(*) FROM "{table}"').fetchone()[0]
        return out