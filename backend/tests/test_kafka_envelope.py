"""Required Kafka JSON envelope (class spec): keys and shape used by producers."""

from app.routers.applications import app_env


def test_application_submitted_envelope_has_required_keys():
    e = app_env(
        "application.submitted",
        "550e8400-e29b-41d4-a716-446655440000",
        "M-1",
        "APP-abc",
        {"job_id": "J-1", "member_id": "M-1", "status": "submitted"},
        "idem-key-1",
    )
    assert e["event_type"] == "application.submitted"
    assert e["trace_id"] == "550e8400-e29b-41d4-a716-446655440000"
    assert e["actor_id"] == "M-1"
    assert e["idempotency_key"] == "idem-key-1"
    assert e["entity"] == {"entity_type": "application", "entity_id": "APP-abc"}
    assert isinstance(e["timestamp"], str) and len(e["timestamp"]) >= 10
    assert e["payload"]["job_id"] == "J-1"
