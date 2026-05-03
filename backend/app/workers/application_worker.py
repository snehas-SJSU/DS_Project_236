"""Consumer for application.events (MySQL projection)."""

from __future__ import annotations

import asyncio
import json
import logging

import pymysql.err
from aiokafka import AIOKafkaConsumer

from app import db as dbm
from app.config import settings
from app.idempotency import already_processed, mark_processed

log = logging.getLogger(__name__)


async def run() -> None:
    await dbm.get_pool()
    consumer = AIOKafkaConsumer(
        "application.events",
        bootstrap_servers=settings.kafka_broker_list,
        group_id="application-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("application worker listening on application.events")
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"app-worker:{idem}"):
                    continue
                et = event.get("event_type")
                p = event.get("payload") or {}

                if et == "application.submitted":
                    app_id = event.get("entity", {}).get("entity_id")
                    job_id = p.get("job_id")
                    member_id = p.get("member_id")
                    if not app_id or not job_id or not member_id:
                        continue
                    answers = p.get("answers")
                    ans_s = json.dumps(answers) if answers is not None else None
                    try:
                        await dbm.execute(
                            """INSERT INTO applications (app_id, job_id, member_id, status, resume_url, resume_text, cover_letter, answers)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,%s)""",
                            (
                                app_id,
                                job_id,
                                member_id,
                                p.get("status") or "submitted",
                                p.get("resume_url"),
                                p.get("resume_text"),
                                p.get("cover_letter"),
                                ans_s,
                            ),
                        )
                        await dbm.execute(
                            "UPDATE jobs SET applicants_count = COALESCE(applicants_count, 0) + 1 WHERE job_id = %s",
                            (job_id,),
                        )
                    except pymysql.err.IntegrityError:
                        log.info("duplicate application skipped")
                    if idem:
                        await mark_processed(f"app-worker:{idem}")
                    log.info("saved application %s", app_id)

                elif et == "application.status_updated":
                    aid = p.get("application_id")
                    status = p.get("status")
                    note = p.get("recruiter_note")
                    if aid and status:
                        await dbm.execute(
                            "UPDATE applications SET status = %s, recruiter_note = COALESCE(%s, recruiter_note) WHERE app_id = %s",
                            (status, note, aid),
                        )
                    if idem:
                        await mark_processed(f"app-worker:{idem}")

            except Exception as e:
                log.exception("application worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
