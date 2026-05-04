from __future__ import annotations

import hashlib
import json
import uuid
from datetime import datetime, timedelta, timezone
from typing import Annotated, Any, Optional

import jwt

from fastapi import Header, HTTPException

from app.config import settings
from app import db as dbm


def hash_password(password: str, salt_hex: str) -> str:
    return hashlib.pbkdf2_hmac(
        "sha512",
        password.encode("utf-8"),
        salt_hex.encode("utf-8"),
        100000,
        dklen=64,
    ).hex()


def create_jwt(payload: dict[str, Any]) -> str:
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.auth_token_ttl_hours)
    return jwt.encode({**payload, "exp": exp}, settings.jwt_secret, algorithm="HS256")


def verify_jwt(token: str) -> Optional[dict[str, Any]]:
    try:
        return jwt.decode(token, settings.jwt_secret, algorithms=["HS256"])
    except jwt.PyJWTError:
        return None


_SESSION_CACHE_PREFIX = "session:"
_SESSION_CACHE_TTL = 3600  # 1 hour; refresh on access


async def _session_cache_key(token: str) -> str:
    return _SESSION_CACHE_PREFIX + hashlib.sha256(token.encode()).hexdigest()[:32]


async def cache_session(token: str, user_id: str, email: str) -> None:
    """Write session to Redis so subsequent auth checks skip MySQL."""
    try:
        from app.redis_client import get_redis
        r = get_redis()
        k = await _session_cache_key(token)
        await r.setex(k, _SESSION_CACHE_TTL, json.dumps({"user_id": user_id, "email": email}))
    except Exception:
        pass


async def invalidate_session_cache(token: str) -> None:
    """Remove session from Redis on logout."""
    try:
        from app.redis_client import get_redis
        r = get_redis()
        await r.delete(await _session_cache_key(token))
    except Exception:
        pass


async def get_session(token: str) -> Optional[dict[str, Any]]:
    # Check Redis first — avoids MySQL round-trip on every auth check
    try:
        from app.redis_client import get_redis
        r = get_redis()
        k = await _session_cache_key(token)
        cached = await r.get(k)
        if cached:
            return json.loads(cached)
    except Exception:
        pass

    # Fall back to MySQL
    row = await dbm.fetch_one(
        "SELECT user_id, email, expires_at FROM auth_sessions WHERE token = %s LIMIT 1",
        (token,),
    )
    if not row:
        return None
    exp = row["expires_at"]
    if isinstance(exp, datetime) and exp.timestamp() < datetime.now(timezone.utc).timestamp():
        await dbm.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
        return None
    # Warm the cache for next time
    await cache_session(token, row["user_id"], row["email"])
    return row


async def require_admin_bearer(authorization: str | None) -> dict[str, Any]:
    if not authorization or not authorization.startswith("Bearer "):
        raise HTTPException(
            status_code=401,
            detail={"error": "UNAUTHORIZED", "message": "Admin login required", "trace_id": str(uuid.uuid4())},
        )
    token = authorization[7:]
    decoded = verify_jwt(token)
    if not decoded:
        raise HTTPException(
            status_code=401,
            detail={"error": "UNAUTHORIZED", "message": "Invalid token", "trace_id": str(uuid.uuid4())},
        )
    sess = await get_session(token)
    if not sess:
        raise HTTPException(
            status_code=401,
            detail={"error": "UNAUTHORIZED", "message": "Session expired", "trace_id": str(uuid.uuid4())},
        )
    user = await dbm.fetch_one(
        "SELECT user_id, email, name FROM auth_users WHERE user_id = %s LIMIT 1",
        (decoded["user_id"],),
    )
    if not user or str(user.get("email") or "").lower() != "admin@test.com":
        raise HTTPException(
            status_code=403,
            detail={"error": "FORBIDDEN", "message": "Admin access required", "trace_id": str(uuid.uuid4())},
        )
    return user


async def admin_header_dep(
    authorization: Annotated[str | None, Header()] = None,
) -> dict[str, Any]:
    return await require_admin_bearer(authorization)
