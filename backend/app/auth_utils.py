from __future__ import annotations

import hashlib
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


async def get_session(token: str) -> Optional[dict[str, Any]]:
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
