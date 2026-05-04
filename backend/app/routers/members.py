"""Member profile + auth."""

from __future__ import annotations

import json
import re
import secrets
import uuid
from collections import defaultdict
from datetime import datetime, timedelta, timezone
from typing import Any, Optional

from fastapi import APIRouter, Header, Request
from fastapi.responses import JSONResponse

from app import db as dbm
from app.auth_utils import cache_session, create_jwt, get_session, hash_password, invalidate_session_cache, verify_jwt
from app.config import settings
from app.kafka_bus import send_kafka
from app.redis_client import get_redis

router = APIRouter()

CACHE_PREFIX = "member:"
CACHE_TTL = 600
DEFAULT_SETTINGS = {
    "profileVisibility": True,
    "openToWork": True,
    "allowMessages": True,
    "inAppNotificationsEnabled": True,
    "preferredLanguage": "English",
}


def _tid() -> str:
    return str(uuid.uuid4())


def _iso_z() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%S.") + f"{datetime.now(timezone.utc).microsecond // 1000:03d}Z"


def envelope_kafka(event_type: str, trace_id: str, actor_id: str, entity_type: str, entity_id: str, payload: dict, idem: str) -> dict:
    return {
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": _iso_z(),
        "actor_id": actor_id or "system",
        "entity": {"entity_type": entity_type, "entity_id": entity_id},
        "payload": payload,
        "idempotency_key": idem,
    }


def is_valid_email(email: str) -> bool:
    return bool(re.match(r"^[^\s@]+@[^\s@]+\.[^\s@]+$", str(email or "").strip()))


def is_strong_password(password: str) -> bool:
    val = str(password or "")
    return (
        len(val) >= 7
        and re.search(r"[A-Z]", val)
        and re.search(r"[a-z]", val)
        and re.search(r"\d", val)
        and re.search(r"[^A-Za-z0-9]", val)
    )


def normalize_member_payload(body: dict, partial: bool = False) -> dict:
    first_name = body.get("first_name") if "first_name" in body else body.get("firstName")
    last_name = body.get("last_name") if "last_name" in body else body.get("lastName")
    if first_name is None and not partial and body.get("name"):
        parts = str(body["name"]).split()
        first_name = parts[0] if parts else None
        last_name = " ".join(parts[1:]) if len(parts) > 1 else None
    headline = body.get("headline") if "headline" in body else body.get("title")
    city = body.get("city")
    state = body.get("state")
    country = body.get("country")
    if "location" in body:
        location = body.get("location")
    elif not partial:
        location = ", ".join([x for x in [city, state, country] if x]) or None
    else:
        location = None
    if "about" in body:
        about = body.get("about")
    elif "summary" in body:
        about = body.get("summary")
    else:
        about = None
    full_name = body.get("name") if "name" in body else None
    if full_name is None and not partial:
        full_name = " ".join([x for x in [first_name, last_name] if x]).strip() or None
    out: dict[str, Any] = {}
    if first_name is not None:
        out["first_name"] = first_name
    if last_name is not None:
        out["last_name"] = last_name
    if full_name is not None:
        out["name"] = full_name
    if "email" in body:
        out["email"] = body.get("email")
    if "phone" in body:
        out["phone"] = body.get("phone")
    if city is not None:
        out["city"] = city
    if state is not None:
        out["state"] = state
    if country is not None:
        out["country"] = country
    if location is not None:
        out["location"] = location
    if headline is not None:
        out["headline"] = headline
        out["title"] = headline
    if about is not None:
        out["about"] = about
        out["summary"] = about
    if "skills" in body:
        out["skills"] = body.get("skills")
    if "experience" in body:
        out["experience"] = body.get("experience")
    if "education" in body:
        out["education"] = body.get("education")
    if "profile_photo_url" in body:
        out["profile_photo_url"] = body.get("profile_photo_url")
    if "cover_photo_url" in body:
        out["cover_photo_url"] = body.get("cover_photo_url")
    if "cover_theme" in body:
        out["cover_theme"] = body.get("cover_theme")
    if "resume_url" in body:
        out["resume_url"] = body.get("resume_url")
    if "resume_text" in body:
        out["resume_text"] = body.get("resume_text")
    return out


async def ensure_member_settings_row(member_id: str) -> None:
    await dbm.execute(
        """INSERT IGNORE INTO member_settings
        (member_id, profile_visibility, open_to_work, allow_messages, in_app_notifications_enabled, preferred_language)
        VALUES (%s,1,1,1,1,'English')""",
        (member_id,),
    )


def normalize_bool(value: Any, fallback: bool) -> bool:
    if value is None:
        return fallback
    return value is True or value == 1 or value == "1" or value == "true"


@router.post("/auth/signup")
async def auth_signup(request: Request, body: dict):
    email = str(body.get("email") or "").strip().lower()
    password = body.get("password")
    name = body.get("name")
    if not is_valid_email(email):
        return JSONResponse(status_code=400, content={"error": "INVALID_EMAIL", "message": "Please enter a valid email address.", "trace_id": _tid()})
    if not is_strong_password(str(password or "")):
        return JSONResponse(status_code=400, content={
                "error": "WEAK_PASSWORD",
                "message": "Password must be at least 7 characters and include uppercase, lowercase, number, and special character.",
                "trace_id": _tid(),
            },
        )
    dup = await dbm.fetch_one("SELECT user_id FROM auth_users WHERE email = %s LIMIT 1", (email,))
    if dup:
        return JSONResponse(status_code=409, content={"error": "DUPLICATE_EMAIL", "message": "An account with this email already exists.", "trace_id": _tid()})
    user_id = "U-" + uuid.uuid4().hex[:8]
    salt = secrets.token_hex(16)
    ph = hash_password(str(password), salt)
    await dbm.execute(
        "INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (%s,%s,%s,%s,%s)",
        (user_id, email, ph, salt, name),
    )
    token = create_jwt({"user_id": user_id, "email": email})
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.auth_token_ttl_hours)
    await dbm.execute(
        "INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (%s,%s,%s,%s)",
        (token, user_id, email, exp),
    )
    await cache_session(token, user_id, email)
    return JSONResponse(status_code=201, content={"token": token, "user": {"user_id": user_id, "email": email, "name": name}, "message": "Signup successful"})


@router.post("/auth/login")
async def auth_login(body: dict):
    email = str(body.get("email") or "").strip().lower()
    password = body.get("password")
    if not is_valid_email(email) or not password:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "Valid email and password are required.", "trace_id": _tid()})
    row = await dbm.fetch_one(
        "SELECT user_id, email, password_hash, password_salt, name FROM auth_users WHERE email = %s LIMIT 1",
        (email,),
    )
    if not row:
        return JSONResponse(status_code=401, content={"error": "INVALID_CREDENTIALS", "message": "Invalid email or password.", "trace_id": _tid()})
    if hash_password(str(password), row["password_salt"]) != row["password_hash"]:
        return JSONResponse(status_code=401, content={"error": "INVALID_CREDENTIALS", "message": "Invalid email or password.", "trace_id": _tid()})
    token = create_jwt({"user_id": row["user_id"], "email": row["email"]})
    exp = datetime.now(timezone.utc) + timedelta(hours=settings.auth_token_ttl_hours)
    await dbm.execute(
        "INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (%s,%s,%s,%s)",
        (token, row["user_id"], row["email"], exp),
    )
    await cache_session(token, row["user_id"], row["email"])
    return JSONResponse(status_code=200, content={
            "token": token,
            "user": {"user_id": row["user_id"], "email": row["email"], "name": row.get("name")},
            "message": "Login successful",
        },
    )


@router.get("/auth/me")
async def auth_me(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "", 1) if (authorization or "").startswith("Bearer ") else ""
    if not token:
        return JSONResponse(status_code=401, content={"error": "UNAUTHORIZED", "message": "Missing token", "trace_id": _tid()})
    decoded = verify_jwt(token)
    if not decoded:
        return JSONResponse(status_code=401, content={"error": "UNAUTHORIZED", "message": "Missing or expired JWT token", "trace_id": _tid()})
    sess = await get_session(token)
    if not sess:
        return JSONResponse(status_code=401, content={"error": "UNAUTHORIZED", "message": "Session expired or invalid", "trace_id": _tid()})
    user = await dbm.fetch_one("SELECT user_id, email, name FROM auth_users WHERE user_id = %s LIMIT 1", (decoded["user_id"],))
    if not user:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "User not found", "trace_id": _tid()})
    return {"user": user}


@router.post("/auth/logout")
async def auth_logout(authorization: Optional[str] = Header(None)):
    token = (authorization or "").replace("Bearer ", "", 1) if (authorization or "").startswith("Bearer ") else ""
    if token:
        await dbm.execute("DELETE FROM auth_sessions WHERE token = %s", (token,))
        await invalidate_session_cache(token)
    return {"message": "Logged out"}


@router.post("/members/create")
async def members_create(request: Request, body: dict):
    normalized = normalize_member_payload(body, partial=False)
    if not normalized.get("email"):
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "email required", "trace_id": _tid()})
    dup = await dbm.fetch_one(
        "SELECT member_id FROM members WHERE email = %s AND status != %s",
        (normalized["email"], "deleted"),
    )
    if dup:
        return JSONResponse(status_code=409, content={"error": "DUPLICATE_EMAIL", "message": "A member with this email already exists", "trace_id": _tid()})
    member_id = "M-" + uuid.uuid4().hex[:8]
    trace_id = _tid()
    idem = request.headers.get("idempotency-key") or str(uuid.uuid4())
    ev = envelope_kafka("member.created", trace_id, member_id, "member", member_id, dict(normalized), idem)
    try:
        await send_kafka("member.events", member_id, ev)
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "KAFKA_UNAVAILABLE", "message": str(e), "trace_id": _tid()})
    return JSONResponse(status_code=201, content={"message": "Member creation requested", "member_id": member_id, "trace_id": trace_id})


@router.post("/members/get")
async def members_get(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    redis_ok = False
    try:
        r = get_redis()
        cached = await r.get(CACHE_PREFIX + member_id)
        redis_ok = True
        if cached:
            return json.loads(cached)
    except Exception:
        pass
    row = await dbm.fetch_one("SELECT * FROM members WHERE member_id = %s AND status != %s", (member_id, "deleted"))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Member not found", "trace_id": _tid()})
    m = dict(row)
    for k in ("skills", "experience", "education"):
        v = m.get(k)
        if isinstance(v, str):
            try:
                m[k] = json.loads(v or "[]")
            except json.JSONDecodeError:
                m[k] = []
    m["profile_views_daily"] = m.get("profile_views")
    if redis_ok:
        try:
            r = get_redis()
            await r.setex(CACHE_PREFIX + member_id, CACHE_TTL, json.dumps(m, default=str))
        except Exception:
            pass
    return m


@router.post("/members/by-user")
async def members_by_user(body: dict):
    user_id = body.get("user_id")
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "user_id required"})
    row = await dbm.fetch_one(
        """SELECT m.member_id FROM members m
        INNER JOIN auth_users u ON u.email = m.email
        WHERE u.user_id = %s LIMIT 1""",
        (user_id,),
    )
    if not row:
        # Seeded admin (U-ADMIN01) shares the baseline demo profile M-123; legacy DBs may lack email alignment.
        uid = str(user_id or "").strip().upper()
        if uid == "U-ADMIN01":
            mrow = await dbm.fetch_one(
                "SELECT member_id FROM members WHERE member_id = %s AND COALESCE(status,'') != %s LIMIT 1",
                ("M-123", "deleted"),
            )
            if mrow:
                return {"member_id": mrow["member_id"]}
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "No member profile for this user"})
    return {"member_id": row["member_id"]}


@router.post("/members/update")
async def members_update(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    fields = {k: v for k, v in body.items() if k != "member_id"}
    mapped = normalize_member_payload(fields, partial=True)
    merged = {**fields, **mapped}
    allowed = [
        "name", "first_name", "last_name", "title", "headline", "location",
        "city", "state", "country", "email", "phone", "about", "summary",
        "skills", "experience", "education", "profile_photo_url", "cover_photo_url", "cover_theme", "resume_url", "resume_text",
    ]
    updates = []
    vals = []
    for k in allowed:
        if k in merged and merged[k] is not None:
            updates.append(f"`{k}` = %s")
            v = merged[k]
            if k in ("skills", "experience", "education"):
                v = json.dumps(v) if not isinstance(v, str) else v
            vals.append(v)
    if not updates:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "No fields to update", "trace_id": _tid()})
    if merged.get("email"):
        e = await dbm.fetch_one(
            "SELECT member_id FROM members WHERE email = %s AND member_id != %s",
            (merged["email"], member_id),
        )
        if e:
            return JSONResponse(status_code=409, content={"error": "DUPLICATE_EMAIL", "message": "Email already in use", "trace_id": _tid()})
    vals.append(member_id)
    await dbm.execute(f"UPDATE members SET {', '.join(updates)} WHERE member_id = %s", tuple(vals))
    try:
        r = get_redis()
        await r.delete(CACHE_PREFIX + member_id)
    except Exception:
        pass
    return {"message": "Updated", "member_id": member_id}


@router.post("/members/delete")
async def members_delete(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await dbm.execute("UPDATE members SET status = %s WHERE member_id = %s", ("deleted", member_id))
    try:
        r = get_redis()
        await r.delete(CACHE_PREFIX + member_id)
    except Exception:
        pass
    return {"message": "Soft-deleted", "member_id": member_id}


@router.post("/members/search")
async def members_search(body: dict):
    try:
        keyword = str(body.get("keyword") or "").strip().lower()
        location = str(body.get("location") or "").strip().lower()
        skill = str(body.get("skill") or "").strip().lower()
        sql = "SELECT * FROM members WHERE status != %s"
        params: list[Any] = ["deleted"]
        if keyword:
            sql += " AND (LOWER(name) LIKE %s OR LOWER(about) LIKE %s OR LOWER(title) LIKE %s OR LOWER(headline) LIKE %s)"
            kw = f"%{keyword}%"
            params.extend([kw, kw, kw, kw])
        if location:
            sql += " AND LOWER(location) LIKE %s"
            params.append(f"%{location}%")
        if skill:
            sql += " AND LOWER(CAST(skills AS CHAR)) LIKE %s"
            params.append(f"%{skill}%")
        sql += " LIMIT 50"
        rows = await dbm.fetch_all(sql, tuple(params))
        out = []
        for m in rows:
            mm = dict(m)
            if isinstance(mm.get("skills"), str):
                try:
                    mm["skills"] = json.loads(mm["skills"] or "[]")
                except json.JSONDecodeError:
                    mm["skills"] = []
            mm["profile_views_daily"] = mm.get("profile_views")
            out.append(mm)
        return out
    except Exception:
        return []


@router.post("/members/suggest")
async def members_suggest(body: dict):
    try:
        keyword = str(body.get("keyword") or "").strip().lower()
        skill = str(body.get("skill") or "").strip().lower()
        location = str(body.get("location") or "").strip().lower()
        limit = min(max(int(body.get("limit") or 8), 1), 20)
        if not keyword and not skill and not location:
            return []
        sql = "SELECT member_id, name, headline, title, location FROM members WHERE status != %s"
        params: list[Any] = ["deleted"]
        if keyword:
            sql += " AND (LOWER(name) LIKE %s OR LOWER(headline) LIKE %s OR LOWER(title) LIKE %s)"
            kw = f"%{keyword}%"
            params.extend([kw, kw, kw])
        if location:
            sql += " AND LOWER(location) LIKE %s"
            params.append(f"%{location}%")
        if skill:
            sql += " AND LOWER(CAST(skills AS CHAR)) LIKE %s"
            params.append(f"%{skill}%")
        sql += " ORDER BY created_at DESC LIMIT %s"
        params.append(limit)
        rows = await dbm.fetch_all(sql, tuple(params))
        return [
            {
                "type": "member",
                "member_id": r["member_id"],
                "value": r.get("name") or r["member_id"],
                "label": r.get("name") or r["member_id"],
                "subtitle": r.get("headline") or r.get("title") or r.get("location") or "Member",
            }
            for r in rows
        ]
    except Exception:
        return []


@router.post("/members/peopleYouMayKnow")
async def members_people_you_may_know(body: dict):
    """Personalized suggestions: not self, not already connected; includes mutual connection count."""
    member_id = str((body or {}).get("member_id") or "").strip()
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    limit = min(max(int((body or {}).get("limit") or 6), 1), 12)
    try:
        all_con = await dbm.fetch_all("SELECT user_a, user_b FROM connections")
    except Exception:
        all_con = []
    adj: dict[str, set[str]] = defaultdict(set)
    for r in all_con or []:
        a, b = str(r.get("user_a") or ""), str(r.get("user_b") or "")
        if a and b:
            adj[a].add(b)
            adj[b].add(a)
    viewer_conn = adj.get(member_id, set())
    exclude = viewer_conn | {member_id}
    placeholders = ",".join(["%s"] * len(exclude))
    try:
        candidates = await dbm.fetch_all(
            f"""SELECT member_id, name, headline, title, location, profile_photo_url
                FROM members WHERE status != 'deleted' AND member_id NOT IN ({placeholders})
                ORDER BY created_at DESC LIMIT 80""",
            tuple(exclude),
        )
    except Exception:
        return []
    scored: list[dict[str, Any]] = []
    for c in candidates or []:
        cid = str(c.get("member_id") or "").strip()
        if not cid:
            continue
        cand_conn = adj.get(cid, set())
        mutual = len(viewer_conn & cand_conn)
        scored.append(
            {
                "member_id": cid,
                "name": c.get("name") or cid,
                "headline": str(c.get("headline") or c.get("title") or "").strip(),
                "location": str(c.get("location") or "").strip(),
                "profile_photo_url": c.get("profile_photo_url"),
                "mutual_connections": mutual,
            }
        )
    scored.sort(key=lambda x: (-int(x.get("mutual_connections") or 0), x.get("name") or ""))
    return scored[:limit]


@router.post("/members/settings/get")
async def members_settings_get(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await ensure_member_settings_row(member_id)
    row = await dbm.fetch_one("SELECT * FROM member_settings WHERE member_id = %s LIMIT 1", (member_id,))
    row = row or {}
    return {
        "member_id": member_id,
        "profileVisibility": normalize_bool(row.get("profile_visibility"), True),
        "openToWork": normalize_bool(row.get("open_to_work"), True),
        "allowMessages": normalize_bool(row.get("allow_messages"), True),
        "inAppNotificationsEnabled": normalize_bool(row.get("in_app_notifications_enabled"), True),
        "preferredLanguage": row.get("preferred_language") or "English",
    }


@router.post("/members/settings/update")
async def members_settings_update(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await ensure_member_settings_row(member_id)
    row = await dbm.fetch_one("SELECT * FROM member_settings WHERE member_id = %s LIMIT 1", (member_id,))
    row = row or {}
    cur = {
        "profileVisibility": normalize_bool(row.get("profile_visibility"), True),
        "openToWork": normalize_bool(row.get("open_to_work"), True),
        "allowMessages": normalize_bool(row.get("allow_messages"), True),
        "inAppNotificationsEnabled": normalize_bool(row.get("in_app_notifications_enabled"), True),
        "preferredLanguage": row.get("preferred_language") or "English",
    }
    next_s = {
        "profileVisibility": normalize_bool(body.get("profileVisibility"), cur["profileVisibility"]),
        "openToWork": normalize_bool(body.get("openToWork"), cur["openToWork"]),
        "allowMessages": normalize_bool(body.get("allowMessages"), cur["allowMessages"]),
        "inAppNotificationsEnabled": normalize_bool(
            body.get("inAppNotificationsEnabled"), cur["inAppNotificationsEnabled"]
        ),
        "preferredLanguage": str(body.get("preferredLanguage") or cur["preferredLanguage"] or "English").strip() or "English",
    }
    await dbm.execute(
        """INSERT INTO member_settings
        (member_id, profile_visibility, open_to_work, allow_messages, in_app_notifications_enabled, preferred_language)
        VALUES (%s,%s,%s,%s,%s,%s)
        ON DUPLICATE KEY UPDATE
        profile_visibility=VALUES(profile_visibility), open_to_work=VALUES(open_to_work),
        allow_messages=VALUES(allow_messages), in_app_notifications_enabled=VALUES(in_app_notifications_enabled),
        preferred_language=VALUES(preferred_language)""",
        (
            member_id,
            1 if next_s["profileVisibility"] else 0,
            1 if next_s["openToWork"] else 0,
            1 if next_s["allowMessages"] else 0,
            1 if next_s["inAppNotificationsEnabled"] else 0,
            next_s["preferredLanguage"],
        ),
    )
    return {"message": "Settings saved", "settings": {"member_id": member_id, **next_s}}


@router.post("/members/premium/status")
async def members_premium_status(body: dict):
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    row = await dbm.fetch_one(
        "SELECT member_id, plan_name, status, started_at, expires_at FROM premium_memberships WHERE member_id = %s LIMIT 1",
        (member_id,),
    )
    if not row:
        return {"member_id": member_id, "status": "inactive", "is_active": False, "plan_name": None}
    exp = row.get("expires_at")
    exp_ok = True
    if exp and isinstance(exp, datetime):
        exp_ok = exp.timestamp() > datetime.now(timezone.utc).timestamp()
    is_active = row["status"] == "active" and exp_ok
    return {
        "member_id": member_id,
        "plan_name": row.get("plan_name"),
        "status": "active" if is_active else row.get("status"),
        "is_active": is_active,
        "started_at": row.get("started_at"),
        "expires_at": row.get("expires_at"),
    }


@router.post("/members/premium/activate")
async def members_premium_activate(body: dict):
    member_id = body.get("member_id")
    plan_name = body.get("plan_name") or "Career"
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await dbm.execute(
        """INSERT INTO premium_memberships (member_id, plan_name, status, started_at, expires_at)
        VALUES (%s,%s,'active',NOW(),DATE_ADD(NOW(), INTERVAL 30 DAY))
        ON DUPLICATE KEY UPDATE plan_name=VALUES(plan_name), status='active', started_at=NOW(), expires_at=DATE_ADD(NOW(), INTERVAL 30 DAY)""",
        (member_id, str(plan_name)),
    )
    return {"member_id": member_id, "status": "active", "is_active": True, "plan_name": str(plan_name)}


@router.post("/members/network/catalog")
async def members_network_catalog(body: dict):
    member_id = body.get("member_id")
    typ = body.get("type")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    sql = """
    SELECT e.*, r.relation_status, r.joined_at FROM network_entities e
    LEFT JOIN member_network_relations r ON r.entity_id = e.entity_id AND r.member_id = %s
    """
    params: list[Any] = [member_id]
    if typ:
        sql += " WHERE e.entity_type = %s"
        params.append(str(typ))
    sql += " ORDER BY e.sort_order ASC, e.title ASC"
    rows = await dbm.fetch_all(sql, tuple(params))
    out = []
    for row in rows:
        et = row["entity_type"]
        rs = row.get("relation_status")
        out.append({
            "entity_id": row["entity_id"],
            "entity_type": et,
            "title": row["title"],
            "subtitle": row["subtitle"],
            "description": row["description"],
            "route_path": row["route_path"],
            "badge": row["badge"],
            "members_count": int(row.get("members_count") or 0),
            "is_active": rs == "active",
            "action_label": (
                ("Leave" if rs == "active" else "Join")
                if et in ("groups", "events")
                else ("Following" if rs == "active" else "Follow")
            ),
            "joined_at": row.get("joined_at"),
        })
    return out


@router.post("/members/network/update")
async def members_network_update(body: dict):
    member_id = body.get("member_id")
    entity_id = body.get("entity_id")
    is_active = body.get("is_active")
    if not member_id or not entity_id or not isinstance(is_active, bool):
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id, entity_id and is_active required", "trace_id": _tid()})
    ent = await dbm.fetch_one("SELECT entity_id FROM network_entities WHERE entity_id = %s LIMIT 1", (entity_id,))
    if not ent:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Network item not found", "trace_id": _tid()})
    status = "active" if is_active else "inactive"
    await dbm.execute(
        """INSERT INTO member_network_relations (member_id, entity_id, relation_status, joined_at)
        VALUES (%s,%s,%s,NOW())
        ON DUPLICATE KEY UPDATE relation_status=VALUES(relation_status),
        joined_at=CASE WHEN VALUES(relation_status)='active' THEN NOW() ELSE joined_at END""",
        (member_id, entity_id, status),
    )
    delta = 1 if is_active else -1
    await dbm.execute(
        "UPDATE network_entities SET members_count = GREATEST(COALESCE(members_count,0) + %s, 0) WHERE entity_id = %s",
        (delta, entity_id),
    )
    return {"member_id": member_id, "entity_id": entity_id, "is_active": is_active}


@router.post("/members/notifications/list")
async def members_notifications_list(body: dict):
    member_id = body.get("member_id")
    category = body.get("category") or "all"
    limit = min(max(int(body.get("limit") or 50), 1), 100)
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await ensure_member_settings_row(member_id)
    sql = "SELECT notification_id, category, title, body, route_path, is_read, created_at, priority FROM notifications WHERE member_id = %s"
    params: list[Any] = [member_id]
    if category != "all":
        sql += " AND category = %s"
        params.append(str(category))
    sql += " ORDER BY is_read ASC, priority DESC, created_at DESC LIMIT %s"
    params.append(limit)
    return await dbm.fetch_all(sql, tuple(params))


@router.post("/members/notifications/markRead")
async def members_notifications_mark_read(body: dict):
    member_id = body.get("member_id")
    ids = body.get("notification_ids")
    if not member_id or not isinstance(ids, list) or not ids:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id and notification_ids required", "trace_id": _tid()})
    ph = ",".join(["%s"] * len(ids))
    await dbm.execute(
        f"UPDATE notifications SET is_read = 1 WHERE member_id = %s AND notification_id IN ({ph})",
        tuple([member_id, *ids]),
    )
    return {"message": "Notifications marked as read"}


@router.post("/members/notifications/markAllRead")
async def members_notifications_mark_all_read(body: dict):
    member_id = body.get("member_id")
    category = body.get("category") or "all"
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    if category != "all":
        await dbm.execute("UPDATE notifications SET is_read = 1 WHERE member_id = %s AND category = %s", (member_id, str(category)))
    else:
        await dbm.execute("UPDATE notifications SET is_read = 1 WHERE member_id = %s", (member_id,))
    return {"message": "Notifications marked as read"}
