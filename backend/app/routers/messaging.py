from __future__ import annotations

import asyncio
import uuid
from typing import Any

from fastapi import APIRouter, Request
from fastapi.responses import JSONResponse

from app import db as dbm
from app.kafka_bus import send_kafka
from app.mongo_db import get_mongo_db
from app.routers.members import _iso_z

router = APIRouter()


def _tid() -> str:
    return str(uuid.uuid4())


def msg_env(event_type: str, trace_id: str, actor_id: str, thread_id: str, payload: dict, idem: str) -> dict:
    return {
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": _iso_z(),
        "actor_id": actor_id,
        "entity": {"entity_type": "thread", "entity_id": thread_id},
        "payload": payload,
        "idempotency_key": idem,
    }


async def ensure_threads_table() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS message_threads (
      thread_id VARCHAR(50) PRIMARY KEY, participant_a VARCHAR(50), participant_b VARCHAR(50),
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_participant (participant_a, participant_b)
    )"""
    )


async def resolve_receiver(thread_id: str, sender_id: str) -> str | None:
    row = await dbm.fetch_one(
        "SELECT participant_a, participant_b FROM message_threads WHERE thread_id = %s", (thread_id,)
    )
    if not row:
        return None
    return row["participant_b"] if row["participant_a"] == sender_id else row["participant_a"]


async def send_kafka_retry(topic: str, key: str, value: dict, attempts: int = 3) -> None:
    last = None
    for i in range(attempts):
        try:
            await send_kafka(topic, key, value)
            return
        except Exception as e:
            last = e
            await asyncio.sleep(0.2 * (i + 1))
    raise last if last else RuntimeError("kafka send failed")


@router.post("/threads/open")
async def threads_open(body: dict):
    await ensure_threads_table()
    a = body.get("participant_a")
    b = body.get("participant_b")
    if not a or not b:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "participant_a and participant_b required", "trace_id": _tid()})
    if a == b:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "participants must be different", "trace_id": _tid()})
    ex = await dbm.fetch_one(
        """SELECT thread_id FROM message_threads
        WHERE (participant_a = %s AND participant_b = %s) OR (participant_a = %s AND participant_b = %s)
        ORDER BY last_activity DESC LIMIT 1""",
        (a, b, b, a),
    )
    if ex:
        return {"thread_id": ex["thread_id"], "reused": True}
    tid = "T-" + uuid.uuid4().hex[:8]
    await dbm.execute(
        "INSERT INTO message_threads (thread_id, participant_a, participant_b) VALUES (%s,%s,%s)",
        (tid, a, b),
    )
    return JSONResponse(status_code=201, content={"thread_id": tid})


@router.post("/threads/get")
async def threads_get(body: dict):
    await ensure_threads_table()
    tid = body.get("thread_id")
    row = await dbm.fetch_one("SELECT * FROM message_threads WHERE thread_id = %s", (tid,))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Thread not found", "trace_id": _tid()})
    return dict(row)


@router.post("/threads/byUser")
async def threads_by_user(body: dict):
    await ensure_threads_table()
    uid = body.get("user_id")
    if not uid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "user_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all(
        "SELECT * FROM message_threads WHERE participant_a = %s OR participant_b = %s ORDER BY last_activity DESC",
        (uid, uid),
    )
    return [dict(r) for r in rows]


@router.post("/messages/send")
async def messages_send(request: Request, body: dict):
    tid = body.get("thread_id")
    sender_id = body.get("sender_id")
    text = body.get("text")
    if not tid or not sender_id or not text:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "thread_id, sender_id, text required", "trace_id": _tid()})
    await ensure_threads_table()
    receiver_id = await resolve_receiver(tid, sender_id)
    if not receiver_id:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Thread not found", "trace_id": _tid()})
    msg_id = "MSG-" + uuid.uuid4().hex[:8]
    mongo = get_mongo_db()
    doc = {
        "message_id": msg_id,
        "thread_id": tid,
        "sender_id": sender_id,
        "receiver_id": receiver_id,
        "message_text": text,
        "timestamp": _iso_z(),
    }
    try:
        await mongo["messages"].insert_one(doc)
        await dbm.execute(
            "UPDATE message_threads SET last_activity = CURRENT_TIMESTAMP WHERE thread_id = %s", (tid,)
        )
        trace_id = request.headers.get("x-trace-id") or _tid()
        idem = str(uuid.uuid4())
        await send_kafka_retry(
            "message.events",
            tid,
            msg_env("message.sent", trace_id, sender_id, tid, {"thread_id": tid, "message_id": msg_id, "sender_id": sender_id, "receiver_id": receiver_id, "text": text}, idem),
        )
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "MESSAGE_SEND_FAILED", "message": str(e), "trace_id": _tid()})
    return JSONResponse(status_code=201, content={"message_id": msg_id, "thread_id": tid})


@router.post("/messages/list")
async def messages_list(body: dict):
    tid = body.get("thread_id")
    if not tid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "thread_id required", "trace_id": _tid()})
    limit = int(body.get("limit") or 50)
    mongo = get_mongo_db()
    cur = mongo["messages"].find({"thread_id": tid}).sort("timestamp", 1).limit(limit)
    rows = await cur.to_list(length=limit)
    out: list[dict[str, Any]] = []
    for row in rows:
        doc = dict(row)
        # Mongo ObjectId is not JSON-serializable for FastAPI responses.
        doc.pop("_id", None)
        out.append(doc)
    return out
