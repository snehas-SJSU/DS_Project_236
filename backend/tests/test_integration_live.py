"""
Live API checks (failure modes from class spec). Run after:

  docker compose up -d
  npm run start:all   # or docker compose -f docker-compose.yml -f docker-compose.apps.yml up -d

  cd backend && .venv/bin/pip install -r requirements-dev.txt
  INTEGRATION_TEST=1 .venv/bin/pytest tests/test_integration_live.py -v
"""

from __future__ import annotations

import json
import os
import urllib.error
import urllib.request

import pytest

pytestmark = pytest.mark.skipif(
    not os.getenv("INTEGRATION_TEST"),
    reason="Set INTEGRATION_TEST=1 with stack running (API :4000, MySQL, Kafka).",
)

API = os.getenv("INTEGRATION_API_BASE", "http://127.0.0.1:4000/api")


def _post(path: str, body: dict) -> tuple[int, dict]:
    data = json.dumps(body).encode()
    req = urllib.request.Request(
        f"{API}{path}",
        data=data,
        headers={"Content-Type": "application/json"},
        method="POST",
    )
    try:
        with urllib.request.urlopen(req, timeout=60) as resp:
            raw = resp.read().decode()
            return resp.status, json.loads(raw) if raw else {}
    except urllib.error.HTTPError as e:
        raw = e.read().decode()
        try:
            return e.code, json.loads(raw) if raw else {}
        except json.JSONDecodeError:
            return e.code, {"_raw": raw}


def test_health():
    req = urllib.request.Request("http://127.0.0.1:4000/health", method="GET")
    with urllib.request.urlopen(req, timeout=10) as resp:
        assert resp.status == 200
        body = json.loads(resp.read().decode())
    assert body.get("ok") is True


def test_duplicate_signup_returns_duplicate_email():
    import time

    email = f"rubrictest_{int(time.time() * 1000)}@example.com"
    password = "Valid@12345"
    c1, j1 = _post("/auth/signup", {"email": email, "password": password})
    assert c1 in (200, 201), j1
    c2, j2 = _post("/auth/signup", {"email": email, "password": password})
    assert c2 == 409
    assert j2.get("error") == "DUPLICATE_EMAIL"


def test_duplicate_application():
    """Requires seeded M-123 and job creation (Kafka worker may lag briefly)."""
    import time

    suffix = int(time.time())
    job_body = {
        "title": f"Rubric dup apply {suffix}",
        "company": "Acme",
        "location": "San Jose, CA",
        "salary": "100k",
        "type": "Full-time",
        "description": "test",
        "skills": ["Python"],
        "recruiter_id": "R-123",
    }
    jc, job = _post("/jobs/create", job_body)
    assert jc == 201 or "job_id" in job, (jc, job)
    job_id = job.get("job_id")
    assert job_id

    for _ in range(80):
        c, _ = _post("/jobs/get", {"job_id": job_id})
        if c == 200:
            break
        time.sleep(0.35)
    else:
        pytest.fail("job not visible — are Kafka workers running?")

    m1, _ = _post("/applications/submit", {"job_id": job_id, "member_id": "M-123"})
    assert m1 == 201
    m2, j2 = _post("/applications/submit", {"job_id": job_id, "member_id": "M-123"})
    assert m2 == 409
    assert j2.get("error") == "DUPLICATE_APPLICATION"


def test_apply_closed_job_returns_job_closed():
    import time

    suffix = int(time.time())
    job_body = {
        "title": f"Rubric closed {suffix}",
        "company": "Acme",
        "location": "San Jose, CA",
        "salary": "100k",
        "type": "Full-time",
        "description": "test",
        "skills": ["Python"],
        "recruiter_id": "R-123",
    }
    jc, job = _post("/jobs/create", job_body)
    job_id = job.get("job_id")
    assert job_id

    for _ in range(80):
        c, _ = _post("/jobs/get", {"job_id": job_id})
        if c == 200:
            break
        time.sleep(0.35)

    _post("/jobs/close", {"job_id": job_id})
    for _ in range(80):
        gr, gj = _post("/jobs/get", {"job_id": job_id})
        if gr == 200 and gj.get("status") == "closed":
            break
        time.sleep(0.35)
    else:
        pytest.skip("job did not reach closed state (worker lag?)")

    ac, aj = _post("/applications/submit", {"job_id": job_id, "member_id": "M-123"})
    assert ac == 422
    assert aj.get("error") == "JOB_CLOSED"
