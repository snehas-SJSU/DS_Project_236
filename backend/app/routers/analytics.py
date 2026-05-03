from __future__ import annotations

import uuid
from datetime import datetime, timedelta, timezone

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import db as dbm
from app.idempotency import already_processed, mark_processed
from app.kafka_envelope import validate_kafka_envelope
from app.mongo_db import get_mongo_db

router = APIRouter()


def _tid() -> str:
    return str(uuid.uuid4())


async def ensure_applications_table() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS applications (
      app_id VARCHAR(50) PRIMARY KEY, job_id VARCHAR(50), member_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'submitted', cover_letter TEXT, recruiter_note TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_job_member (job_id, member_id), INDEX (job_id), INDEX (member_id)
    )"""
    )


@router.post("/events/ingest")
async def events_ingest(body: dict):
    ok, errs = validate_kafka_envelope(body)
    if not ok:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "Invalid Kafka envelope", "details": errs, "trace_id": _tid()})
    idem = body["idempotency_key"]
    if await already_processed(f"analytics-ingest:{idem}"):
        return {"accepted": True, "deduplicated": True, "trace_id": body.get("trace_id")}
    mongo = get_mongo_db()
    from datetime import datetime as dt

    await mongo["events"].insert_one({
        "event_type": body["event_type"],
        "trace_id": body["trace_id"],
        "timestamp": body["timestamp"],
        "actor_id": body["actor_id"],
        "entity": body["entity"],
        "payload": body["payload"],
        "idempotency_key": idem,
        "ingested_at": dt.now(timezone.utc).isoformat(),
    })
    await mark_processed(f"analytics-ingest:{idem}")
    return JSONResponse(status_code=202, content={"accepted": True, "trace_id": body.get("trace_id")})


@router.post("/analytics/jobs/top")
async def analytics_jobs_top(body: dict):
    try:
        metric = (body or {}).get("metric") or "applications"
        window_days = int((body or {}).get("window_days") or 30)
        mongo = get_mongo_db()
        since = datetime.now(timezone.utc) - timedelta(days=window_days)

        if metric in ("applications", "low_applications"):
            await ensure_applications_table()
            order = "ASC" if metric == "low_applications" else "DESC"
            rows = await dbm.fetch_all(
                f"""SELECT j.job_id, COALESCE(COUNT(a.app_id), 0) AS c, MAX(j.title) AS title FROM jobs j
                LEFT JOIN applications a ON j.job_id = a.job_id
                WHERE applied_at >= DATE_SUB(NOW(), INTERVAL %s DAY) OR a.app_id IS NULL
                GROUP BY j.job_id ORDER BY c {order} LIMIT 10""",
                (window_days,),
            )
            return {"metric": metric, "window_days": window_days, "jobs": rows}

        if metric in ("clicks", "saves"):
            col = "views_count" if metric == "clicks" else "saves_count"
            rows = await dbm.fetch_all(
                f"SELECT job_id, title, {col} AS c FROM jobs ORDER BY c DESC LIMIT 10"
            )
            return {"metric": metric, "window_days": window_days, "jobs": rows}

        agg = await mongo["events"].aggregate([
            {"$match": {"event_type": "job.viewed", "timestamp": {"$gte": since.isoformat()}}},
            {"$group": {"_id": "$payload.job_id", "views": {"$sum": 1}}},
            {"$sort": {"views": -1}},
            {"$limit": 10},
        ]).to_list(10)
        return {"metric": metric, "window_days": window_days, "jobs": agg}
    except Exception as e:
        return {"metric": (body or {}).get("metric"), "jobs": [], "error": str(e)}


@router.post("/analytics/funnel")
async def analytics_funnel(body: dict):
    try:
        await ensure_applications_table()
        job_id = body.get("job_id")
        if not job_id:
            return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id required", "trace_id": _tid()})
        window_days = int(body.get("window_days") or 30)
        mongo = get_mongo_db()
        since = datetime.now(timezone.utc) - timedelta(days=window_days)
        events = await mongo["events"].find({
            "payload.job_id": job_id,
            "timestamp": {"$gte": since.isoformat()},
        }).to_list(5000)
        counts = {"view": 0, "save": 0, "apply_start": 0, "submit": 0}
        for e in events:
            t = e.get("event_type")
            if t == "job.viewed":
                counts["view"] += 1
            if t == "job.saved":
                counts["save"] += 1
            if t == "apply.start":
                counts["apply_start"] += 1
            if t == "application.submitted":
                counts["submit"] += 1
        app_count = await dbm.fetch_one(
            "SELECT COUNT(*) AS c FROM applications WHERE job_id = %s AND applied_at >= DATE_SUB(NOW(), INTERVAL %s DAY)",
            (job_id, window_days),
        )
        counts["submit"] = int(app_count["c"]) if app_count else counts["submit"]
        return {"job_id": job_id, "window_days": window_days, "funnel": counts}
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "INTERNAL_ERROR", "message": str(e), "trace_id": _tid()})


@router.post("/analytics/geo")
async def analytics_geo(body: dict):
    try:
        await ensure_applications_table()
        job_id = body.get("job_id")
        window_days = int((body or {}).get("window_days") or 30)
        rows = await dbm.fetch_all(
            """SELECT COALESCE(m.location, 'unknown') AS location, COUNT(*) AS applicants
            FROM applications a LEFT JOIN members m ON a.member_id = m.member_id
            WHERE a.job_id = %s AND a.applied_at >= DATE_SUB(NOW(), INTERVAL %s DAY) GROUP BY m.location""",
            (job_id, window_days),
        )
        return {"job_id": job_id, "window_days": window_days, "distribution": rows}
    except Exception:
        return {"job_id": (body or {}).get("job_id"), "distribution": []}


@router.post("/analytics/member/dashboard")
async def analytics_member_dashboard(body: dict):
    try:
        await ensure_applications_table()
        member_id = body.get("member_id")
        if not member_id:
            return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
        mongo = get_mongo_db()
        since = datetime.now(timezone.utc) - timedelta(days=30)
        views = await mongo["events"].count_documents({
            "event_type": "profile.viewed",
            "payload.member_id": member_id,
            "timestamp": {"$gte": since.isoformat()},
        })
        status_rows = await dbm.fetch_all(
            "SELECT status, COUNT(*) AS c FROM applications WHERE member_id = %s GROUP BY status",
            (member_id,),
        )
        return {"member_id": member_id, "profile_views_30d": views, "applications_by_status": status_rows}
    except Exception as e:
        return JSONResponse(status_code=500, content={"error": "INTERNAL_ERROR", "message": str(e), "trace_id": _tid()})


@router.post("/analytics/jobs/timeseries")
async def analytics_jobs_timeseries(body: dict):
    try:
        event_type = (body or {}).get("event_type") or "job.saved"
        granularity = (body or {}).get("granularity") or "day"
        window_days = int((body or {}).get("window_days") or 30)
        mongo = get_mongo_db()
        since = datetime.now(timezone.utc) - timedelta(days=window_days)
        events = await mongo["events"].find({
            "event_type": event_type,
            "timestamp": {"$gte": since.isoformat()},
        }).to_list(10000)
        bucket: dict[str, int] = {}
        for e in events:
            iso = str(e.get("timestamp") or "")[:10]
            if not iso:
                continue
            if granularity == "week":
                d = datetime.fromisoformat(iso + "T00:00:00+00:00")
                day = d.weekday() or 7
                from datetime import timedelta as td

                d = d - td(days=day - 1)
                key = d.date().isoformat()
            else:
                key = iso
            bucket[key] = bucket.get(key, 0) + 1
        series = [{"period": k, "count": v} for k, v in sorted(bucket.items())]
        return {"event_type": event_type, "granularity": granularity, "window_days": window_days, "series": series}
    except Exception as e:
        return {"event_type": (body or {}).get("event_type"), "granularity": (body or {}).get("granularity"), "series": [], "error": str(e)}
