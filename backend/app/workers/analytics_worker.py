"""Analytics consumer — mirrors every domain Kafka event into MongoDB events collection.

Subscribes to all domain topics and writes a copy of each event to the MongoDB
'events' collection, exactly like POST /events/ingest does. This satisfies the
requirement: events being sent to analytics/logging service via Kafka.

Consumer group: analytics-service-group (independent of domain workers so it
receives all events without interfering with their processing).
"""

from __future__ import annotations

import asyncio
import json
import logging
from datetime import datetime, timezone

from aiokafka import AIOKafkaConsumer

from app.config import settings
from app.idempotency import already_processed, mark_processed
from app.mongo_db import get_mongo_db

log = logging.getLogger(__name__)

TOPICS = [
    "job.events",
    "application.events",
    "member.events",
    "connection.events",
    "message.events",
]


async def run() -> None:
    consumer = AIOKafkaConsumer(
        *TOPICS,
        bootstrap_servers=settings.kafka_broker_list,
        group_id="analytics-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("analytics worker listening on %s", TOPICS)
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"analytics-worker:{idem}"):
                    continue

                mongo = get_mongo_db()
                await mongo["events"].insert_one({
                    "event_type": event.get("event_type"),
                    "trace_id": event.get("trace_id"),
                    "timestamp": event.get("timestamp"),
                    "actor_id": event.get("actor_id"),
                    "entity": event.get("entity"),
                    "payload": event.get("payload"),
                    "idempotency_key": idem,
                    "kafka_topic": msg.topic,
                    "kafka_partition": msg.partition,
                    "kafka_offset": msg.offset,
                    "ingested_at": datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ"),
                })

                if idem:
                    await mark_processed(f"analytics-worker:{idem}")
                log.info("analytics logged %s from %s", event.get("event_type"), msg.topic)

            except Exception as e:
                log.exception("analytics worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
