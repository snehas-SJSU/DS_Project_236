from __future__ import annotations

import hashlib
import json
import uuid
from typing import Any

from fastapi import Request
from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import db as dbm
from app.kafka_bus import send_kafka
from app.redis_client import get_redis
from app.routers.members import _iso_z

router = APIRouter()


def _tid() -> str:
    return str(uuid.uuid4())


def app_env(event_type: str, trace_id: str, actor_id: str, app_id: str, payload: dict, idem: str) -> dict:
    return {
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": _iso_z(),
        "actor_id": actor_id,
        "entity": {"entity_type": "application", "entity_id": app_id},
        "payload": payload,
        "idempotency_key": idem,
    }


async def ensure_applications_table() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS applications (
      app_id VARCHAR(50) PRIMARY KEY, job_id VARCHAR(50), member_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'submitted', resume_url TEXT, resume_text TEXT, cover_letter TEXT,
      answers JSON, recruiter_note TEXT, applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_job_member (job_id, member_id), INDEX (job_id), INDEX (member_id)
    )"""
    )


def map_app_row(r: dict) -> dict:
    out = dict(r)
    out["application_id"] = r.get("app_id")
    out["application_datetime"] = r.get("applied_at")
    return out


async def _require_job_poster_for_job(job_id: str | None, recruiter_id: str | None) -> JSONResponse | None:
    """Return 400/403 JSONResponse if job_id missing, recruiter_id missing, job not found, or poster mismatch."""
    if not job_id or not str(job_id).strip():
        return JSONResponse(
            status_code=400,
            content={"error": "BAD_REQUEST", "message": "job_id required", "trace_id": _tid()},
        )
    rid = str(recruiter_id or "").strip()
    if not rid:
        return JSONResponse(
            status_code=400,
            content={"error": "BAD_REQUEST", "message": "recruiter_id required", "trace_id": _tid()},
        )
    row = await dbm.fetch_one("SELECT recruiter_id FROM jobs WHERE job_id = %s LIMIT 1", (str(job_id).strip(),))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Job not found", "trace_id": _tid()})
    if str(row.get("recruiter_id") or "").strip() != rid:
        return JSONResponse(
            status_code=403,
            content={"error": "FORBIDDEN", "message": "Only the job poster can review applicants for this job", "trace_id": _tid()},
        )
    return None


@router.post("/applications/submit")
@router.post("/applications/apply")
async def applications_submit(request: Request, body: dict):
    await ensure_applications_table()
    job_id = body.get("job_id")
    member_id = body.get("member_id")
    if not job_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id and member_id required", "trace_id": _tid()})
    jobs = await dbm.fetch_all("SELECT status FROM jobs WHERE job_id = %s", (job_id,))
    if not jobs:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Job not found", "trace_id": _tid()})
    if jobs[0].get("status") == "closed":
        return JSONResponse(status_code=422, content={"error": "JOB_CLOSED", "message": "Cannot apply to a closed job", "trace_id": _tid()})
    ex = await dbm.fetch_one(
        "SELECT app_id FROM applications WHERE job_id = %s AND member_id = %s",
        (job_id, member_id),
    )
    if ex:
        return JSONResponse(status_code=409, content={"error": "DUPLICATE_APPLICATION", "message": "Already applied to this job", "trace_id": _tid()})
    app_id = "APP-" + uuid.uuid4().hex[:8]
    trace_id = request.headers.get("x-trace-id") or _tid()
    idem = request.headers.get("idempotency-key") or hashlib.sha256(f"{job_id}-{member_id}-{trace_id}".encode()).hexdigest()
    resume_url = body.get("resume_url")
    resume_text = body.get("resume_text")
    cover_letter = body.get("cover_letter")
    answers = body.get("answers")
    await dbm.execute(
        """INSERT INTO applications (app_id, job_id, member_id, status, resume_url, resume_text, cover_letter, answers)
        VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
        (
            app_id,
            job_id,
            member_id,
            "submitted",
            resume_url,
            resume_text,
            cover_letter,
            json.dumps(answers) if answers is not None else None,
        ),
    )
    # Keep count in sync here: the Kafka worker also tries to INSERT and hits DUPLICATE, so it never reached UPDATE.
    await dbm.execute(
        "UPDATE jobs SET applicants_count = COALESCE(applicants_count, 0) + 1 WHERE job_id = %s",
        (job_id,),
    )
    try:
        r = get_redis()
        await r.delete(f"job:{job_id}")
    except Exception:
        pass
    ev = app_env(
        "application.submitted",
        trace_id,
        member_id,
        app_id,
        {
            "job_id": job_id,
            "member_id": member_id,
            "status": "submitted",
            "resume_url": resume_url,
            "resume_text": resume_text,
            "cover_letter": cover_letter,
            "answers": answers,
        },
        idem,
    )
    try:
        await send_kafka("application.events", app_id, ev)
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "KAFKA_UNAVAILABLE", "message": str(e), "trace_id": _tid()})
    return JSONResponse(status_code=201, content={"message": "Application submitted", "application_id": app_id, "trace_id": trace_id})


@router.post("/applications/get")
async def applications_get(body: dict):
    await ensure_applications_table()
    aid = body.get("application_id")
    if not aid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "application_id required", "trace_id": _tid()})
    row = await dbm.fetch_one("SELECT * FROM applications WHERE app_id = %s", (aid,))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Application not found", "trace_id": _tid()})
    return map_app_row(dict(row))


@router.post("/applications/byJob")
async def applications_by_job(body: dict):
    await ensure_applications_table()
    job_id = body.get("job_id")
    banned = await _require_job_poster_for_job(job_id, body.get("recruiter_id"))
    if banned:
        return banned
    rows = await dbm.fetch_all(
        "SELECT * FROM applications WHERE job_id = %s ORDER BY applied_at DESC", (job_id,)
    )
    return [map_app_row(dict(r)) for r in rows]


@router.post("/applications/byMember")
async def applications_by_member(body: dict):
    await ensure_applications_table()
    member_id = body.get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all(
        """
        SELECT a.*, j.title AS job_title, j.company AS job_company, j.location AS job_location
        FROM applications a
        LEFT JOIN jobs j ON j.job_id = a.job_id
        WHERE a.member_id = %s
        ORDER BY a.applied_at DESC
        """,
        (member_id,),
    )
    return [map_app_row(dict(r)) for r in rows]


@router.post("/applications/updateStatus")
async def applications_update_status(body: dict):
    application_id = body.get("application_id")
    status = body.get("status")
    recruiter_note = body.get("recruiter_note")
    if not application_id or not status:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "application_id and status required", "trace_id": _tid()})
    await ensure_applications_table()
    prow = await dbm.fetch_one("SELECT job_id FROM applications WHERE app_id = %s LIMIT 1", (application_id,))
    if not prow:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Application not found", "trace_id": _tid()})
    banned = await _require_job_poster_for_job(str(prow.get("job_id")), body.get("recruiter_id"))
    if banned:
        return banned
    trace_id = _tid()
    idem = str(uuid.uuid4())
    ev = app_env(
        "application.status_updated",
        trace_id,
        "recruiter",
        application_id,
        {"application_id": application_id, "status": status, "recruiter_note": recruiter_note},
        idem,
    )
    try:
        await send_kafka("application.events", application_id, ev)
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "KAFKA_UNAVAILABLE", "message": str(e), "trace_id": _tid()})
    return {"message": "Status update queued", "trace_id": trace_id}


@router.post("/applications/addNote")
async def applications_add_note(body: dict):
    application_id = body.get("application_id")
    note = body.get("note")
    if not application_id or note is None:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "application_id and note required", "trace_id": _tid()})
    await ensure_applications_table()
    nrow = await dbm.fetch_one("SELECT job_id FROM applications WHERE app_id = %s LIMIT 1", (application_id,))
    if not nrow:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Application not found", "trace_id": _tid()})
    banned = await _require_job_poster_for_job(str(nrow.get("job_id")), body.get("recruiter_id"))
    if banned:
        return banned
    await dbm.execute("UPDATE applications SET recruiter_note = %s WHERE app_id = %s", (note, application_id))
    return {"message": "Note saved", "application_id": application_id}
