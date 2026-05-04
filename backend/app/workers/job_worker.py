"""Consumer for job.events (MySQL projection)."""

from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from app import db as dbm
from app.config import settings
from app.idempotency import already_processed, mark_processed
from app.redis_client import get_redis

log = logging.getLogger(__name__)


async def run() -> None:
    await dbm.get_pool()
    consumer = AIOKafkaConsumer(
        "job.events",
        bootstrap_servers=settings.kafka_broker_list,
        group_id="job-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("job worker listening on job.events")
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"job-worker:{idem}"):
                    continue
                et = event.get("event_type")
                jid = event.get("entity", {}).get("entity_id")
                p = event.get("payload") or {}

                if et == "job.created" and jid:
                    skills = p.get("skills")
                    if not isinstance(skills, str):
                        skills = json.dumps(skills or [])
                    await dbm.execute(
                        """INSERT INTO jobs (
                        job_id, title, company_id, company, industry, location, remote_mode, seniority_level, employment_type,
                        salary, type, skills, description, recruiter_id, status
                        ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'open')
                        ON DUPLICATE KEY UPDATE title=VALUES(title), company_id=VALUES(company_id), company=VALUES(company), location=VALUES(location),
                        industry=VALUES(industry), remote_mode=VALUES(remote_mode), seniority_level=VALUES(seniority_level),
                        employment_type=VALUES(employment_type), salary=VALUES(salary), type=VALUES(type), skills=VALUES(skills),
                        description=VALUES(description), recruiter_id=VALUES(recruiter_id)""",
                        (
                            jid,
                            p.get("title"),
                            p.get("company_id"),
                            p.get("company"),
                            p.get("industry"),
                            p.get("location"),
                            p.get("remote_mode"),
                            p.get("seniority_level"),
                            p.get("employment_type") or p.get("type"),
                            p.get("salary"),
                            p.get("type") or p.get("employment_type"),
                            skills,
                            p.get("description"),
                            p.get("recruiter_id") or "R-default",
                        ),
                    )
                    if idem:
                        await mark_processed(f"job-worker:{idem}")
                    log.info("job worker saved %s", jid)

                elif et == "job.viewed" and jid:
                    await dbm.execute("UPDATE jobs SET views_count = views_count + 1 WHERE job_id = %s", (jid,))
                    if idem:
                        await mark_processed(f"job-worker:{idem}")

                elif et == "job.saved" and jid:
                    await dbm.execute(
                        "UPDATE jobs SET saves_count = COALESCE(saves_count, 0) + 1 WHERE job_id = %s", (jid,)
                    )
                    if idem:
                        await mark_processed(f"job-worker:{idem}")

                elif et == "job.closed" and jid:
                    await dbm.execute("UPDATE jobs SET status = 'closed' WHERE job_id = %s", (jid,))
                    if idem:
                        await mark_processed(f"job-worker:{idem}")

                elif et == "job.updated" and jid:
                    sets = []
                    vals = []
                    for k in (
                        "title",
                        "company_id",
                        "company",
                        "location",
                        "salary",
                        "type",
                        "description",
                        "industry",
                        "remote_mode",
                        "seniority_level",
                        "employment_type",
                        "recruiter_id",
                    ):
                        if k in p:
                            sets.append(f"`{k}` = %s")
                            vals.append(p[k])
                    if "skills" in p:
                        sets.append("skills = %s")
                        vals.append(json.dumps(p["skills"]) if not isinstance(p["skills"], str) else p["skills"])
                    if sets:
                        vals.append(jid)
                        await dbm.execute(f"UPDATE jobs SET {', '.join(sets)} WHERE job_id = %s", tuple(vals))
                        # /jobs/get is cached in Redis; clear the key after projection update.
                        try:
                            r = get_redis()
                            await r.delete(f"job:{jid}")
                        except Exception:
                            pass
                    if idem:
                        await mark_processed(f"job-worker:{idem}")

            except Exception as e:
                log.exception("job worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
