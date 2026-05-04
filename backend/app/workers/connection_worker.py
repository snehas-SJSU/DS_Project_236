"""Consumer for connection.events (MySQL projection)."""

from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from app import db as dbm
from app.config import settings
from app.idempotency import already_processed, mark_processed

log = logging.getLogger(__name__)


def _pair_key(u1: str, u2: str) -> tuple[str, str]:
    return (u1, u2) if u1 < u2 else (u2, u1)


async def run() -> None:
    await dbm.get_pool()
    consumer = AIOKafkaConsumer(
        "connection.events",
        bootstrap_servers=settings.kafka_broker_list,
        group_id="connection-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("connection worker listening on connection.events")
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"conn-worker:{idem}"):
                    continue
                et = event.get("event_type")
                p = event.get("payload") or {}
                entity_id = event.get("entity", {}).get("entity_id")

                if et == "connection.requested":
                    requester_id = p.get("requester_id")
                    receiver_id = p.get("receiver_id")
                    if entity_id and requester_id and receiver_id:
                        await dbm.execute(
                            """INSERT IGNORE INTO connection_requests
                            (request_id, requester_id, receiver_id, status)
                            VALUES (%s,%s,%s,'pending')""",
                            (entity_id, requester_id, receiver_id),
                        )
                        log.info("connection.requested projected %s", entity_id)

                elif et == "connection.accepted":
                    requester_id = p.get("requester_id")
                    receiver_id = p.get("receiver_id")
                    if entity_id:
                        await dbm.execute(
                            "UPDATE connection_requests SET status='accepted' WHERE request_id = %s AND status != 'accepted'",
                            (entity_id,),
                        )
                    if requester_id and receiver_id:
                        a, b = _pair_key(requester_id, receiver_id)
                        await dbm.execute(
                            "INSERT IGNORE INTO connections (user_a, user_b) VALUES (%s,%s)",
                            (a, b),
                        )
                        log.info("connection.accepted projected %s", entity_id)

                elif et == "connection.rejected":
                    if entity_id:
                        await dbm.execute(
                            "UPDATE connection_requests SET status='rejected' WHERE request_id = %s AND status = 'pending'",
                            (entity_id,),
                        )
                        log.info("connection.rejected projected %s", entity_id)

                if idem:
                    await mark_processed(f"conn-worker:{idem}")

            except Exception as e:
                log.exception("connection worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
