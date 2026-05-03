from __future__ import annotations

TTL_SEC = 86400


async def already_processed(idempotency_key: str | None, prefix: str = "") -> bool:
    if not idempotency_key:
        return False
    try:
        from app.redis_client import get_redis

        r = get_redis()
        k = f"idem:{prefix}{idempotency_key}"
        v = await r.get(k)
        return bool(v)
    except Exception:
        return False


async def mark_processed(idempotency_key: str | None, prefix: str = "") -> None:
    if not idempotency_key:
        return
    try:
        from app.redis_client import get_redis

        r = get_redis()
        await r.setex(f"idem:{prefix}{idempotency_key}", TTL_SEC, "1")
    except Exception:
        pass
