from __future__ import annotations

import aiomysql
from typing import Any, Optional

from app.config import settings

_pool: Optional[aiomysql.Pool] = None


async def get_pool() -> aiomysql.Pool:
    global _pool
    if _pool is None:
        _pool = await aiomysql.create_pool(
            host=settings.mysql_host,
            port=settings.mysql_port,
            user=settings.mysql_user,
            password=settings.mysql_password,
            db=settings.mysql_database,
            minsize=1,
            maxsize=10,
            autocommit=True,
            connect_timeout=15,
        )
    return _pool


async def fetch_all(sql: str, args: tuple | list | None = None) -> list[dict[str, Any]]:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor(aiomysql.DictCursor) as cur:
            await cur.execute(sql, args or ())
            rows = await cur.fetchall()
            return list(rows)


async def fetch_one(sql: str, args: tuple | list | None = None) -> Optional[dict[str, Any]]:
    rows = await fetch_all(sql, args)
    return rows[0] if rows else None


async def execute(sql: str, args: tuple | list | None = None) -> int:
    pool = await get_pool()
    async with pool.acquire() as conn:
        async with conn.cursor() as cur:
            await cur.execute(sql, args or ())
            return cur.rowcount


async def close_pool() -> None:
    global _pool
    if _pool is not None:
        _pool.close()
        await _pool.wait_closed()
        _pool = None
