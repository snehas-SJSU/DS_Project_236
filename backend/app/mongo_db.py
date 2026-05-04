from __future__ import annotations

import logging
from typing import Optional

from motor.motor_asyncio import AsyncIOMotorClient, AsyncIOMotorDatabase

from app.config import settings

log = logging.getLogger(__name__)

_client: Optional[AsyncIOMotorClient] = None
_db: Optional[AsyncIOMotorDatabase] = None


def get_mongo_db() -> AsyncIOMotorDatabase:
    global _client, _db
    if _db is None:
        _client = AsyncIOMotorClient(settings.mongo_url)
        _db = _client[settings.mongo_db]
    return _db


async def ensure_mongo_indexes() -> None:
    """Create MongoDB indexes for key queries — idempotent, safe to call every startup."""
    try:
        db = get_mongo_db()

        # messages: queried by thread_id (list messages) and sender_id/receiver_id
        await db["messages"].create_index("thread_id")
        await db["messages"].create_index("sender_id")
        await db["messages"].create_index("receiver_id")
        await db["messages"].create_index("timestamp")

        # events: queried by event_type, actor_id, timestamp for analytics
        await db["events"].create_index("event_type")
        await db["events"].create_index("actor_id")
        await db["events"].create_index("timestamp")
        await db["events"].create_index("trace_id")
        await db["events"].create_index([("entity.entity_type", 1), ("entity.entity_id", 1)])

        log.info("MongoDB indexes ensured for messages and events collections")
    except Exception as e:
        log.warning("ensure_mongo_indexes: %s", e)


async def close_mongo() -> None:
    global _client, _db
    if _client is not None:
        _client.close()
        _client = None
        _db = None
