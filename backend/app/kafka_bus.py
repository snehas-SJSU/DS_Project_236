from __future__ import annotations

import json
from typing import Any, Optional

from aiokafka import AIOKafkaProducer

from app.config import settings

_producer: Optional[AIOKafkaProducer] = None


async def get_producer() -> AIOKafkaProducer:
    global _producer
    if _producer is None:
        _producer = AIOKafkaProducer(
            bootstrap_servers=settings.kafka_broker_list,
            client_id="linkedin-fastapi",
            retry_backoff_ms=100,
        )
        await _producer.start()
    return _producer


async def send_kafka(topic: str, key: str | None, value_obj: dict[str, Any]) -> None:
    prod = await get_producer()
    payload = json.dumps(value_obj).encode("utf-8")
    key_b = key.encode("utf-8") if key else None
    await prod.send_and_wait(topic, value=payload, key=key_b)


async def stop_producer() -> None:
    global _producer
    if _producer is not None:
        await _producer.stop()
        _producer = None
