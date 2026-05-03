from __future__ import annotations

import uuid

import pymysql.err
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import db as dbm
from app.kafka_bus import send_kafka
from app.routers.members import _iso_z

router = APIRouter()


def _tid() -> str:
    return str(uuid.uuid4())


def conn_env(event_type: str, trace_id: str, actor_id: str, entity_id: str, payload: dict, idem: str) -> dict:
    return {
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": _iso_z(),
        "actor_id": actor_id,
        "entity": {"entity_type": "connection", "entity_id": entity_id},
        "payload": payload,
        "idempotency_key": idem,
    }


async def ensure_schema() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS connection_requests (
      request_id VARCHAR(50) PRIMARY KEY, requester_id VARCHAR(50), receiver_id VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending', created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pair (requester_id, receiver_id)
    )"""
    )
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS connections (
      user_a VARCHAR(50), user_b VARCHAR(50), connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_a, user_b)
    )"""
    )


def pair_key(u1: str, u2: str) -> tuple[str, str]:
    return (u1, u2) if u1 < u2 else (u2, u1)


def map_req_row(r: dict) -> dict:
    out = dict(r)
    out["connection_request_id"] = r.get("request_id")
    out["timestamp"] = r.get("created_at")
    return out


@router.post("/connections/request")
async def connections_request(body: dict):
    await ensure_schema()
    requester_id = body.get("requester_id")
    receiver_id = body.get("receiver_id")
    if not requester_id or not receiver_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "requester_id and receiver_id required", "trace_id": _tid()})
    rid = "CR-" + uuid.uuid4().hex[:8]
    try:
        await dbm.execute(
            "INSERT INTO connection_requests (request_id, requester_id, receiver_id, status) VALUES (%s,%s,%s,'pending')",
            (rid, requester_id, receiver_id),
        )
    except pymysql.err.IntegrityError:
        return JSONResponse(status_code=409, content={"error": "DUPLICATE_REQUEST", "message": "Request already exists", "trace_id": _tid()})
    trace_id = _tid()
    try:
        await send_kafka(
            "connection.events",
            rid,
            conn_env("connection.requested", trace_id, requester_id, rid, {"requester_id": requester_id, "receiver_id": receiver_id}, str(uuid.uuid4())),
        )
    except Exception:
        pass
    return JSONResponse(status_code=201, content={"request_id": rid, "connection_request_id": rid, "trace_id": trace_id})


@router.post("/connections/accept")
async def connections_accept(body: dict):
    await ensure_schema()
    request_id = body.get("request_id")
    if not request_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "request_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all(
        "SELECT * FROM connection_requests WHERE request_id = %s AND status = 'pending'", (request_id,)
    )
    if not rows:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Request not found", "trace_id": _tid()})
    row = rows[0]
    requester_id, receiver_id = row["requester_id"], row["receiver_id"]
    a, b = pair_key(requester_id, receiver_id)
    await dbm.execute("UPDATE connection_requests SET status = 'accepted' WHERE request_id = %s", (request_id,))
    await dbm.execute("INSERT IGNORE INTO connections (user_a, user_b) VALUES (%s,%s)", (a, b))
    trace_id = _tid()
    try:
        await send_kafka(
            "connection.events",
            request_id,
            conn_env("connection.accepted", trace_id, receiver_id, request_id, {"requester_id": requester_id, "receiver_id": receiver_id}, str(uuid.uuid4())),
        )
    except Exception:
        pass
    return {"message": "Connected", "requester_id": requester_id, "receiver_id": receiver_id, "trace_id": trace_id}


@router.post("/connections/reject")
async def connections_reject(body: dict):
    await ensure_schema()
    request_id = body.get("request_id")
    if not request_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "request_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all("SELECT * FROM connection_requests WHERE request_id = %s", (request_id,))
    if not rows:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Request not found", "trace_id": _tid()})
    row = rows[0]
    requester_id, receiver_id = row["requester_id"], row["receiver_id"]
    await dbm.execute("UPDATE connection_requests SET status = 'rejected' WHERE request_id = %s", (request_id,))
    trace_id = _tid()
    try:
        await send_kafka(
            "connection.events",
            request_id,
            conn_env("connection.rejected", trace_id, receiver_id, request_id, {"requester_id": requester_id, "receiver_id": receiver_id}, str(uuid.uuid4())),
        )
    except Exception:
        pass
    return {"message": "Rejected", "request_id": request_id, "trace_id": trace_id}


@router.post("/connections/list")
async def connections_list(body: dict):
    await ensure_schema()
    user_id = body.get("user_id")
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "user_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all(
        """SELECT CASE WHEN user_a = %s THEN user_b ELSE user_a END AS connection_id
        FROM connections WHERE user_a = %s OR user_b = %s""",
        (user_id, user_id, user_id),
    )
    return [r["connection_id"] for r in rows]


@router.post("/connections/requestsByUser")
async def connections_requests_by_user(body: dict):
    await ensure_schema()
    user_id = body.get("user_id")
    if not user_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "user_id required", "trace_id": _tid()})
    neighbor_rows = await dbm.fetch_all(
        """SELECT CASE WHEN user_a = %s THEN user_b ELSE user_a END AS cid
        FROM connections WHERE user_a = %s OR user_b = %s""",
        (user_id, user_id, user_id),
    )
    connected = {r["cid"] for r in neighbor_rows}
    incoming_raw = await dbm.fetch_all(
        "SELECT * FROM connection_requests WHERE receiver_id = %s AND status = 'pending' ORDER BY created_at DESC",
        (user_id,),
    )
    sent_raw = await dbm.fetch_all(
        "SELECT * FROM connection_requests WHERE requester_id = %s ORDER BY created_at DESC", (user_id,)
    )
    incoming = [map_req_row(dict(r)) for r in incoming_raw if r["requester_id"] not in connected]
    sent = [map_req_row(dict(r)) for r in sent_raw if r["receiver_id"] not in connected]
    return {"incoming": incoming, "sent": sent}


@router.post("/connections/mutual")
async def connections_mutual(body: dict):
    await ensure_schema()
    user_id = body.get("user_id")
    other_id = body.get("other_id")
    if not user_id or not other_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "user_id and other_id required", "trace_id": _tid()})
    a1 = await dbm.fetch_all(
        """SELECT CASE WHEN user_a = %s THEN user_b ELSE user_a END AS cid FROM connections WHERE user_a = %s OR user_b = %s""",
        (user_id, user_id, user_id),
    )
    a2 = await dbm.fetch_all(
        """SELECT CASE WHEN user_a = %s THEN user_b ELSE user_a END AS cid FROM connections WHERE user_a = %s OR user_b = %s""",
        (other_id, other_id, other_id),
    )
    s1 = {r["cid"] for r in a1}
    mutual = [r["cid"] for r in a2 if r["cid"] in s1 and r["cid"] not in (user_id, other_id)]
    return {"mutual": mutual}
