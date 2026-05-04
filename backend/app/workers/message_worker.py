"""Consumer for message.events — writes UI notifications for message receivers."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

from aiokafka import AIOKafkaConsumer

from app import db as dbm
from app.config import settings
from app.idempotency import already_processed, mark_processed

log = logging.getLogger(__name__)


async def _write_notification(receiver_id: str, sender_id: str, msg_id: str) -> None:
    try:
        row = await dbm.fetch_one("SELECT name FROM members WHERE member_id = %s LIMIT 1", (sender_id,))
        sender_name = str((row or {}).get("name") or sender_id)
    except Exception:
        sender_name = sender_id
    notification_id = "N-" + uuid.uuid4().hex[:8]
    await dbm.execute(
        """INSERT INTO notifications
        (notification_id, member_id, source_key, category, title, body, route_path, is_read, priority)
        VALUES (%s,%s,%s,%s,%s,%s,%s,0,%s)
        ON DUPLICATE KEY UPDATE
          title=VALUES(title), body=VALUES(body), is_read=0""",
        (
            notification_id,
            receiver_id,
            f"message:{msg_id}",
            "mentions",
            "New message",
            f"{sender_name} sent you a message.",
            "/messaging",
            10,
        ),
    )


async def run() -> None:
    await dbm.get_pool()
    consumer = AIOKafkaConsumer(
        "message.events",
        bootstrap_servers=settings.kafka_broker_list,
        group_id="message-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("message worker listening on message.events")
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"msg-worker:{idem}"):
                    continue
                et = event.get("event_type")
                p = event.get("payload") or {}

                if et == "message.sent":
                    receiver_id = p.get("receiver_id")
                    sender_id = p.get("sender_id")
                    msg_id = p.get("message_id") or str(uuid.uuid4())
                    if receiver_id and sender_id:
                        await _write_notification(receiver_id, sender_id, msg_id)
                        log.info("message worker notified %s of message from %s", receiver_id, sender_id)

                if idem:
                    await mark_processed(f"msg-worker:{idem}")

            except Exception as e:
                log.exception("message worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
