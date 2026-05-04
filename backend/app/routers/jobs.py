"""Jobs + recruiters REST surface."""

from __future__ import annotations

import hashlib
import json
import time
import uuid
from typing import Any, Optional

import pymysql.err
from fastapi import APIRouter, Depends, Request
from fastapi.responses import JSONResponse

from app import db as dbm
from app.auth_utils import admin_header_dep
from app.kafka_bus import send_kafka
from app.redis_client import get_redis
from app.routers.members import _iso_z

router = APIRouter()

# Known employers → domain for Google favicon (LinkedIn-style square logo in UI).
_COMPANY_DOMAINS: dict[str, str] = {
    "Stripe": "stripe.com",
    "Databricks": "databricks.com",
    "Confluent": "confluent.io",
    "NVIDIA": "nvidia.com",
    "Netflix": "netflix.com",
    "Okta": "okta.com",
    "Snowflake": "snowflake.com",
    "Apple": "apple.com",
    "Google": "google.com",
    "Adobe": "adobe.com",
    "Figma": "figma.com",
    "Uber": "uber.com",
    "Cisco": "cisco.com",
    "ServiceNow": "servicenow.com",
    "LinkedIn": "linkedin.com",
    "Microsoft": "microsoft.com",
    "Amazon": "amazon.com",
    "Meta": "meta.com",
    "Salesforce": "salesforce.com",
    "Acme": "",
}


def _resolved_company_logo_url(row: dict) -> Optional[str]:
    """Return a logo URL that loads reliably in `<img>` (Clearbit often 403s in browsers)."""
    raw = str(row.get("company_logo_url") or "").strip()
    if raw:
        if "logo.clearbit.com/" in raw:
            try:
                dom = raw.split("logo.clearbit.com/", 1)[1].split("?")[0].strip().rstrip("/")
                if dom:
                    return f"https://www.google.com/s2/favicons?domain={dom}&sz=128"
            except Exception:
                pass
        return raw
    company = str(row.get("company") or "").strip()
    dom = _COMPANY_DOMAINS.get(company)
    if not dom:
        return None
    return f"https://www.google.com/s2/favicons?domain={dom}&sz=128"


def _tid() -> str:
    return str(uuid.uuid4())


def job_env(event_type: str, trace_id: str, actor_id: str, entity_id: str, payload: dict, idem: str) -> dict:
    return {
        "event_type": event_type,
        "trace_id": trace_id,
        "timestamp": _iso_z(),
        "actor_id": actor_id or "system",
        "entity": {"entity_type": "job", "entity_id": entity_id},
        "payload": payload,
        "idempotency_key": idem,
    }


async def send_job_event(payload: dict) -> None:
    await send_kafka("job.events", payload["entity"]["entity_id"], payload)


async def ensure_saved_jobs_table() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS saved_jobs (
      job_id VARCHAR(50), member_id VARCHAR(50), saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (job_id, member_id), INDEX idx_saved_jobs_member_saved (member_id, saved_at)
    )"""
    )


async def ensure_job_tracker_tables() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS job_tracker_notes (
      member_id VARCHAR(50) NOT NULL, job_id VARCHAR(50) NOT NULL, note TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP, PRIMARY KEY (member_id, job_id)
    )"""
    )
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS job_tracker_archives (
      member_id VARCHAR(50) NOT NULL, job_id VARCHAR(50) NOT NULL, archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, job_id)
    )"""
    )


async def ensure_recruiters_table() -> None:
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS recruiters (
      recruiter_id VARCHAR(50) PRIMARY KEY, company_id VARCHAR(50), name VARCHAR(100), email VARCHAR(100),
      phone VARCHAR(30), company_name VARCHAR(150), company_industry VARCHAR(100), company_size VARCHAR(50),
      access_level VARCHAR(50) DEFAULT 'admin', status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, UNIQUE KEY uk_recruiter_email (email)
    )"""
    )


@router.post("/jobs/create")
async def jobs_create(request: Request, body: dict):
    title = body.get("title")
    company = body.get("company")
    company_id = body.get("company_id")
    location = body.get("location")
    salary = body.get("salary")
    typ = body.get("type")
    skills = body.get("skills")
    description = body.get("description")
    recruiter_id = body.get("recruiter_id")
    industry = body.get("industry")
    seniority_level = body.get("seniority_level")
    employment_type = body.get("employment_type")
    remote_mode = body.get("remote_mode")
    job_id = "J-" + uuid.uuid4().hex[:8]
    trace_id = _tid()
    raw_idem = request.headers.get("idempotency-key")
    idem = raw_idem or hashlib.sha256(f"job.created-{job_id}-{int(time.time() * 1000)}".encode()).hexdigest()
    ev = job_env(
        "job.created",
        trace_id,
        recruiter_id or "recruiter",
        job_id,
        {
            "title": title,
            "company": company,
            "company_id": company_id,
            "location": location,
            "salary": salary,
            "type": typ or employment_type,
            "skills": skills,
            "description": description,
            "recruiter_id": recruiter_id or "R-default",
            "industry": industry,
            "seniority_level": seniority_level,
            "employment_type": employment_type or typ,
            "remote_mode": remote_mode,
        },
        idem,
    )
    try:
        await send_job_event(ev)
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "KAFKA_UNAVAILABLE", "message": str(e), "trace_id": _tid()})
    return JSONResponse(status_code=201, content={"message": "Job creation requested", "job_id": job_id, "trace_id": trace_id})


_SEARCH_CACHE_TTL = 60  # seconds — short TTL keeps results fresh while absorbing burst traffic


@router.post("/jobs/search")
async def jobs_search(body: dict):
    try:
        keyword = str(body.get("keyword") or "").strip().lower()
        typ = str(body.get("type") or "").strip()
        location = str(body.get("location") or "").strip()
        industry = str(body.get("industry") or "").strip()
        remote = str(body.get("remote") or "").strip()
        company = str(body.get("company") or "").strip()

        # Build a deterministic cache key from the filter params
        cache_fingerprint = json.dumps(
            {"keyword": keyword, "type": typ, "location": location,
             "industry": industry, "remote": remote, "company": company},
            sort_keys=True,
        )
        cache_key = "search:jobs:" + hashlib.sha256(cache_fingerprint.encode()).hexdigest()[:24]
        try:
            r = get_redis()
            cached = await r.get(cache_key)
            if cached:
                return json.loads(cached)
        except Exception:
            pass

        sql = "SELECT * FROM jobs WHERE status = 'open'"
        params: list[Any] = []
        if company:
            sql += " AND company = %s"
            params.append(company)
        if keyword:
            sql += " AND (LOWER(title) LIKE %s OR LOWER(description) LIKE %s OR LOWER(company) LIKE %s OR LOWER(location) LIKE %s OR LOWER(CAST(skills AS CHAR)) LIKE %s)"
            k = f"%{keyword}%"
            params.extend([k, k, k, k, k])
        if location:
            sql += " AND location LIKE %s"
            params.append(f"%{location}%")
        if typ:
            sql += " AND (type = %s OR employment_type = %s)"
            params.extend([typ, typ])
        if industry:
            sql += " AND industry LIKE %s"
            params.append(f"%{industry}%")
        if remote:
            sql += " AND remote_mode = %s"
            params.append(remote)
        sql += " ORDER BY created_at DESC LIMIT 50"
        rows = await dbm.fetch_all(sql, tuple(params))
        out = []
        for r in rows:
            sk = r.get("skills")
            if isinstance(sk, str):
                try:
                    sk = json.loads(sk or "[]")
                except json.JSONDecodeError:
                    sk = []
            rdict = dict(r)
            out.append({
                "id": r["job_id"],
                "job_id": r["job_id"],
                "company_id": r.get("company_id"),
                "title": r.get("title"),
                "company": r.get("company"),
                "company_logo_url": _resolved_company_logo_url(rdict),
                "location": r.get("location"),
                "salary": r.get("salary"),
                "type": r.get("type"),
                "posted_datetime": r.get("created_at"),
                "skills": sk,
                "description": r.get("description"),
                "status": r.get("status"),
                "recruiter_id": r.get("recruiter_id"),
                "industry": r.get("industry"),
                "remote_mode": r.get("remote_mode"),
                "seniority_level": r.get("seniority_level"),
                "employment_type": r.get("employment_type"),
                "applicants": r.get("applicants_count") or 0,
            })
        try:
            r = get_redis()
            await r.setex(cache_key, _SEARCH_CACHE_TTL, json.dumps(out, default=str))
        except Exception:
            pass
        return out
    except Exception:
        return []


@router.post("/jobs/suggest")
async def jobs_suggest(body: dict):
    try:
        raw = str(body.get("keyword") or "").strip().lower()
        if len(raw) < 2:
            return []
        limit = min(max(int(body.get("limit") or 8), 1), 20)
        like = f"%{raw}%"
        rows = await dbm.fetch_all(
            """SELECT title, company, location FROM jobs WHERE status = 'open'
            AND (LOWER(title) LIKE %s OR LOWER(company) LIKE %s OR LOWER(location) LIKE %s OR LOWER(CAST(skills AS CHAR)) LIKE %s)
            ORDER BY created_at DESC LIMIT 100""",
            (like, like, like, like),
        )
        out = []
        seen = set()
        for row in rows:
            for key in ("title", "company", "location"):
                text = str(row.get(key) or "").strip()
                k = text.lower()
                if not text or k in seen:
                    continue
                seen.add(k)
                out.append({"value": text, "label": text})
                if len(out) >= limit:
                    return out
        return out
    except Exception:
        return []


@router.post("/jobs/get")
async def jobs_get(request: Request, body: dict):
    job_id = body.get("job_id")
    member_id = body.get("member_id")
    if not job_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id required", "trace_id": _tid()})
    job: Optional[dict] = None
    try:
        r = get_redis()
        cached = await r.get(f"job:{job_id}")
        if cached:
            job = json.loads(cached)
    except Exception:
        pass
    if job is None:
        row = await dbm.fetch_one("SELECT * FROM jobs WHERE job_id = %s", (job_id,))
        if not row:
            return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Job not found", "trace_id": _tid()})
        job = dict(row)
        sk = job.get("skills")
        if isinstance(sk, str):
            try:
                job["skills"] = json.loads(sk or "[]")
            except json.JSONDecodeError:
                job["skills"] = []
        job["company_logo_url"] = _resolved_company_logo_url(job)
        try:
            r = get_redis()
            await r.setex(f"job:{job_id}", 300, json.dumps(job, default=str))
        except Exception:
            pass
    else:
        job = dict(job)
        job["company_logo_url"] = _resolved_company_logo_url(job)
    trace_id = request.headers.get("x-trace-id") or _tid()
    idem = hashlib.sha256(f"view-{job_id}-{trace_id}".encode()).hexdigest()
    ev = job_env("job.viewed", trace_id, member_id or "anonymous", job_id, {"job_id": job_id, "viewer": member_id}, idem)
    try:
        await send_job_event(ev)
    except Exception:
        pass
    applied = False
    saved = False
    if member_id:
        try:
            a = await dbm.fetch_one(
                "SELECT 1 AS x FROM applications WHERE job_id = %s AND member_id = %s LIMIT 1",
                (job_id, member_id),
            )
            applied = bool(a)
            await ensure_saved_jobs_table()
            s = await dbm.fetch_one(
                "SELECT 1 AS x FROM saved_jobs WHERE job_id = %s AND member_id = %s LIMIT 1",
                (job_id, member_id),
            )
            saved = bool(s)
        except Exception:
            pass
    job_out = dict(job)
    job_out["company_logo_url"] = _resolved_company_logo_url(job_out)
    return {
        **job_out,
        "company_id": job_out.get("company_id"),
        "posted_datetime": job_out.get("created_at"),
        "applied": applied,
        "saved": saved,
    }


@router.post("/jobs/save")
async def jobs_save(body: dict):
    job_id = body.get("job_id")
    member_id = body.get("member_id")
    if not job_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id and member_id required", "trace_id": _tid()})
    await ensure_saved_jobs_table()
    try:
        n = await dbm.execute("INSERT IGNORE INTO saved_jobs (job_id, member_id) VALUES (%s,%s)", (job_id, member_id))
        if n > 0:
            await dbm.execute(
                "UPDATE jobs SET saves_count = COALESCE(saves_count,0) + 1 WHERE job_id = %s",
                (job_id,),
            )
    except Exception:
        pass
    trace_id = _tid()
    try:
        await send_job_event(job_env("job.saved", trace_id, member_id, job_id, {"job_id": job_id, "member_id": member_id}, str(uuid.uuid4())))
    except Exception:
        pass
    return {"message": "Saved", "job_id": job_id, "member_id": member_id, "trace_id": trace_id}


@router.post("/jobs/unsave")
async def jobs_unsave(body: dict):
    job_id = body.get("job_id")
    member_id = body.get("member_id")
    if not job_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id and member_id required", "trace_id": _tid()})
    await ensure_saved_jobs_table()
    await dbm.execute("DELETE FROM saved_jobs WHERE job_id = %s AND member_id = %s", (job_id, member_id))
    await dbm.execute(
        "UPDATE jobs SET saves_count = GREATEST(COALESCE(saves_count,0) - 1, 0) WHERE job_id = %s",
        (job_id,),
    )
    trace_id = _tid()
    try:
        await send_job_event(job_env("job.unsaved", trace_id, member_id, job_id, {"job_id": job_id, "member_id": member_id}, str(uuid.uuid4())))
    except Exception:
        pass
    return {"message": "Unsaved", "job_id": job_id, "member_id": member_id, "trace_id": trace_id}


@router.post("/jobs/saved")
async def jobs_saved(body: dict):
    member_id = (body or {}).get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await ensure_saved_jobs_table()
    limit = min(max(int((body or {}).get("limit") or 100), 1), 200)
    rows = await dbm.fetch_all(
        """SELECT s.job_id, s.member_id, s.saved_at, j.title, j.company, j.company_id, j.location, j.salary, j.type, j.skills,
        j.description, j.status, j.recruiter_id, j.industry, j.remote_mode, j.seniority_level, j.employment_type, j.applicants_count, j.created_at
        FROM saved_jobs s LEFT JOIN jobs j ON j.job_id = s.job_id WHERE s.member_id = %s ORDER BY s.saved_at DESC LIMIT %s""",
        (member_id, limit),
    )
    out = []
    for r in rows:
        sk = r.get("skills")
        if isinstance(sk, str):
            try:
                sk = json.loads(sk or "[]")
            except json.JSONDecodeError:
                sk = []
        out.append({
            "id": r["job_id"],
            "job_id": r["job_id"],
            "member_id": r["member_id"],
            "saved_at": r.get("saved_at"),
            "title": r.get("title") or "Untitled job",
            "company": r.get("company") or "Unknown company",
            "company_id": r.get("company_id"),
            "location": r.get("location") or "",
            "salary": r.get("salary") or "",
            "type": r.get("type") or r.get("employment_type") or "",
            "postedAt": r.get("created_at") or r.get("saved_at"),
            "skills": sk or [],
            "description": r.get("description") or "",
            "status": r.get("status") or "open",
            "recruiter_id": r.get("recruiter_id"),
            "industry": r.get("industry"),
            "remote_mode": r.get("remote_mode"),
            "seniority_level": r.get("seniority_level"),
            "employment_type": r.get("employment_type"),
            "applicants": r.get("applicants_count") or 0,
        })
    return out


@router.post("/jobs/tracker")
async def jobs_tracker(body: dict):
    member_id = (body or {}).get("member_id")
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required", "trace_id": _tid()})
    await ensure_saved_jobs_table()
    await ensure_job_tracker_tables()

    async def safe(sql: str, params: tuple = ()) -> list:
        try:
            return await dbm.fetch_all(sql, params)
        except Exception:
            return []

    saved_rows = await safe(
        "SELECT job_id, saved_at FROM saved_jobs WHERE member_id = %s ORDER BY saved_at DESC LIMIT 200", (member_id,)
    )
    app_rows = await safe(
        "SELECT app_id, job_id, status, applied_at, recruiter_note FROM applications WHERE member_id = %s ORDER BY applied_at DESC LIMIT 200",
        (member_id,),
    )
    note_rows = await safe("SELECT job_id, note, updated_at FROM job_tracker_notes WHERE member_id = %s", (member_id,))
    arch_rows = await safe("SELECT job_id, archived_at FROM job_tracker_archives WHERE member_id = %s", (member_id,))

    saved_map = {str(r["job_id"]): r for r in saved_rows}
    app_map = {str(r["job_id"]): r for r in app_rows}
    note_map = {str(r["job_id"]): r for r in note_rows}
    archived = {str(r["job_id"]) for r in arch_rows}
    job_ids = list({*saved_map.keys(), *app_map.keys()})
    if not job_ids:
        return []
    ph = ",".join(["%s"] * len(job_ids))
    jobs = await safe(
        f"SELECT job_id, title, company, company_id, location, salary, type, employment_type, status, recruiter_id, created_at FROM jobs WHERE job_id IN ({ph})",
        tuple(job_ids),
    )
    jmap = {str(r["job_id"]): r for r in jobs}
    rows = []
    for jid in job_ids:
        job = jmap.get(jid)
        if not job:
            continue
        sv = saved_map.get(jid)
        ap = app_map.get(jid)
        nt = note_map.get(jid)
        rows.append({
            "id": jid,
            "job_id": jid,
            "title": job.get("title"),
            "company": job.get("company"),
            "company_id": job.get("company_id"),
            "location": job.get("location") or "",
            "salary": job.get("salary") or "",
            "type": job.get("type") or job.get("employment_type") or "",
            "status": job.get("status") or "open",
            "recruiter_id": job.get("recruiter_id"),
            "created_at": job.get("created_at"),
            "saved_at": sv.get("saved_at") if sv else None,
            "applied_at": ap.get("applied_at") if ap else None,
            "application_id": ap.get("app_id") if ap else None,
            "stage": str(ap.get("status") or "saved").lower(),
            "note": nt.get("note") if nt else "",
            "note_updated_at": nt.get("updated_at") if nt else None,
            "archived": jid in archived,
            "source": "saved" if sv else "applied",
        })

    def sort_key(x: dict) -> float:
        for k in ("saved_at", "applied_at", "created_at"):
            v = x.get(k)
            if v:
                try:
                    return float(v.timestamp()) if hasattr(v, "timestamp") else 0.0
                except Exception:
                    pass
        return 0.0

    rows.sort(key=sort_key, reverse=True)
    return rows


@router.post("/jobs/tracker/note")
async def jobs_tracker_note(body: dict):
    await ensure_job_tracker_tables()
    member_id = body.get("member_id")
    job_id = body.get("job_id")
    note = body.get("note") or ""
    if not member_id or not job_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id and job_id required", "trace_id": _tid()})
    await dbm.execute(
        """INSERT INTO job_tracker_notes (member_id, job_id, note) VALUES (%s,%s,%s)
        ON DUPLICATE KEY UPDATE note = VALUES(note)""",
        (member_id, job_id, str(note)),
    )
    return {"message": "Note saved", "member_id": member_id, "job_id": job_id}


@router.post("/jobs/tracker/archive")
async def jobs_tracker_archive(body: dict):
    await ensure_job_tracker_tables()
    member_id = body.get("member_id")
    job_id = body.get("job_id")
    archived = body.get("archived")
    if not member_id or not job_id or not isinstance(archived, bool):
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id, job_id and archived required", "trace_id": _tid()})
    if archived:
        await dbm.execute("INSERT IGNORE INTO job_tracker_archives (member_id, job_id) VALUES (%s,%s)", (member_id, job_id))
    else:
        await dbm.execute("DELETE FROM job_tracker_archives WHERE member_id = %s AND job_id = %s", (member_id, job_id))
    return {"message": "Archived" if archived else "Restored", "member_id": member_id, "job_id": job_id, "archived": archived}


@router.post("/jobs/update")
async def jobs_update(body: dict):
    job_id = body.get("job_id")
    if not job_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id required", "trace_id": _tid()})
    fields = {k: v for k, v in body.items() if k != "job_id"}
    trace_id = _tid()
    try:
        await send_job_event(job_env("job.updated", trace_id, fields.get("recruiter_id") or "recruiter", job_id, fields, str(uuid.uuid4())))
    except Exception as e:
        return JSONResponse(status_code=503, content={"error": "KAFKA_UNAVAILABLE", "message": str(e), "trace_id": _tid()})
    try:
        r = get_redis()
        await r.delete(f"job:{job_id}")
    except Exception:
        pass
    return {"message": "Updated", "job_id": job_id, "trace_id": trace_id}


@router.post("/jobs/close")
async def jobs_close(body: dict):
    job_id = body.get("job_id")
    recruiter_id = body.get("recruiter_id")
    if not job_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "job_id required", "trace_id": _tid()})
    row = await dbm.fetch_one("SELECT recruiter_id, status FROM jobs WHERE job_id = %s LIMIT 1", (job_id,))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Job not found", "trace_id": _tid()})
    if recruiter_id is not None and str(row.get("recruiter_id") or "").strip() != str(recruiter_id).strip():
        return JSONResponse(
            status_code=403,
            content={"error": "FORBIDDEN", "message": "Only the job poster can close this listing", "trace_id": _tid()},
        )
    if row.get("status") == "closed":
        return {"message": "Already closed", "job_id": job_id, "trace_id": _tid()}
    trace_id = _tid()
    # Update DB synchronously so status is immediately visible
    await dbm.execute("UPDATE jobs SET status = 'closed' WHERE job_id = %s", (job_id,))
    # Invalidate cache
    try:
        r = get_redis()
        await r.delete(f"job:{job_id}")
    except Exception:
        pass
    # Also fire Kafka event for downstream consumers/analytics
    try:
        await send_job_event(job_env("job.closed", trace_id, "recruiter", job_id, {}, str(uuid.uuid4())))
    except Exception:
        pass
    return {"message": "Closed", "job_id": job_id, "trace_id": trace_id}



@router.post("/jobs/byRecruiter")
async def jobs_by_recruiter(body: dict):
    rid = body.get("recruiter_id")
    if not rid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "recruiter_id required", "trace_id": _tid()})
    rows = await dbm.fetch_all(
        "SELECT * FROM jobs WHERE recruiter_id = %s ORDER BY created_at DESC LIMIT 100", (rid,)
    )
    return [{**dict(r), "company_id": r.get("company_id"), "posted_datetime": r.get("created_at")} for r in rows]


@router.post("/recruiters/create")
async def recruiters_create(body: dict, _admin=Depends(admin_header_dep)):
    await ensure_recruiters_table()
    recruiter_id = body.get("recruiter_id") or ("R-" + uuid.uuid4().hex[:8])
    email = body.get("email")
    name = body.get("name")
    if not email or not name:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "name and email required", "trace_id": _tid()})
    try:
        await dbm.execute(
            """INSERT INTO recruiters (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, access_level)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s)""",
            (
                recruiter_id,
                body.get("company_id"),
                name,
                email,
                body.get("phone"),
                body.get("company_name"),
                body.get("company_industry"),
                body.get("company_size"),
                body.get("access_level") or "admin",
            ),
        )
        return JSONResponse(status_code=201, content={"recruiter_id": recruiter_id, "message": "Recruiter created"})
    except pymysql.err.IntegrityError:
        return JSONResponse(status_code=409, content={"error": "DUPLICATE_EMAIL", "message": "Recruiter email already exists", "trace_id": _tid()})


@router.post("/recruiters/get")
async def recruiters_get(body: dict):
    await ensure_recruiters_table()
    rid = body.get("recruiter_id")
    if not rid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "recruiter_id required", "trace_id": _tid()})
    row = await dbm.fetch_one(
        "SELECT * FROM recruiters WHERE recruiter_id = %s AND status != %s", (rid, "deleted")
    )
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Recruiter not found", "trace_id": _tid()})
    return dict(row)


@router.post("/recruiters/update")
async def recruiters_update(body: dict, _admin=Depends(admin_header_dep)):
    await ensure_recruiters_table()
    rid = body.get("recruiter_id")
    if not rid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "recruiter_id required", "trace_id": _tid()})
    fields = {k: v for k, v in body.items() if k != "recruiter_id"}
    allowed = ["company_id", "name", "email", "phone", "company_name", "company_industry", "company_size", "access_level", "status"]
    updates = []
    vals = []
    for k in allowed:
        if k in fields:
            updates.append(f"`{k}` = %s")
            vals.append(fields[k])
    if not updates:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "No fields to update", "trace_id": _tid()})
    vals.append(rid)
    await dbm.execute(f"UPDATE recruiters SET {', '.join(updates)} WHERE recruiter_id = %s", tuple(vals))
    return {"recruiter_id": rid, "message": "Recruiter updated"}


@router.post("/recruiters/delete")
async def recruiters_delete(body: dict, _admin=Depends(admin_header_dep)):
    await ensure_recruiters_table()
    rid = body.get("recruiter_id")
    if not rid:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "recruiter_id required", "trace_id": _tid()})
    await dbm.execute("UPDATE recruiters SET status = %s WHERE recruiter_id = %s", ("deleted", rid))
    return {"recruiter_id": rid, "message": "Recruiter deleted"}


@router.post("/recruiters/search")
async def recruiters_search(body: dict):
    await ensure_recruiters_table()
    keyword = body.get("keyword")
    sql = "SELECT * FROM recruiters WHERE status != %s"
    params: list[Any] = ["deleted"]
    if keyword:
        sql += " AND (name LIKE %s OR company_name LIKE %s OR company_industry LIKE %s)"
        k = f"%{keyword}%"
        params.extend([k, k, k])
    sql += " ORDER BY created_at DESC LIMIT 100"
    rows = await dbm.fetch_all(sql, tuple(params))
    return [dict(r) for r in rows]
