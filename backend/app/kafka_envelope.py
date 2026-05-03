import re
from typing import Any

ISO_8601_RE = re.compile(r"^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$")
ALLOWED_ENTITY_TYPES = frozenset({"job", "application", "thread", "connection", "member", "ai_task"})


def validate_kafka_envelope(msg: Any) -> tuple[bool, list[str]]:
    errors: list[str] = []
    if not isinstance(msg, dict):
        return False, ["body must be JSON object"]
    if not msg.get("event_type") or not isinstance(msg["event_type"], str):
        errors.append("event_type required")
    if not msg.get("trace_id") or not isinstance(msg["trace_id"], str):
        errors.append("trace_id required")
    ts = msg.get("timestamp")
    if not ts or not isinstance(ts, str) or not ISO_8601_RE.match(ts):
        errors.append("timestamp must be ISO-8601 string")
    if not msg.get("actor_id") or not isinstance(msg["actor_id"], str):
        errors.append("actor_id required")
    if not msg.get("idempotency_key") or not isinstance(msg["idempotency_key"], str):
        errors.append("idempotency_key required")
    entity = msg.get("entity")
    if not isinstance(entity, dict):
        errors.append("entity object required")
    else:
        if not entity.get("entity_type") or not isinstance(entity["entity_type"], str):
            errors.append("entity.entity_type required")
        if not entity.get("entity_id") or not isinstance(entity["entity_id"], str):
            errors.append("entity.entity_id required")
        et = entity.get("entity_type")
        if et and et not in ALLOWED_ENTITY_TYPES:
            errors.append(f"entity.entity_type invalid: {et}")
    if "payload" not in msg or not isinstance(msg.get("payload"), dict) or msg.get("payload") is None:
        errors.append("payload object required")
    return len(errors) == 0, errors
