"""Consumer for application.events (MySQL projection)."""

from __future__ import annotations

import asyncio
import json
import logging
import uuid

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
                    # Always write notification — router already wrote the app to DB before
                    # firing Kafka, so IntegrityError above is expected; the notification
                    # must be idempotent (ON DUPLICATE KEY UPDATE) and always attempted.
                    try:
                        job_row = await dbm.fetch_one(
                            "SELECT title, company FROM jobs WHERE job_id = %s LIMIT 1", (job_id,)
                        )
                        job_title = (job_row or {}).get("title") or job_id
                        company = (job_row or {}).get("company") or ""
                        notif_body = f"Your application for {job_title}"
                        if company:
                            notif_body += f" at {company}"
                        notif_body += " has been received."
                        notification_id = "N-" + uuid.uuid4().hex[:8]
                        await dbm.execute(
                            """INSERT INTO notifications
                            (notification_id, member_id, source_key, category, title, body, route_path, is_read, priority)
                            VALUES (%s,%s,%s,%s,%s,%s,%s,0,%s)
                            ON DUPLICATE KEY UPDATE title=VALUES(title), body=VALUES(body), is_read=0""",
                            (
                                notification_id,
                                member_id,
                                f"application:{app_id}",
                                "mentions",
                                "Application received",
                                notif_body,
                                "/jobs/tracker",
                                5,
                            ),
                        )
                    except Exception as notif_err:
                        log.warning("failed to write application notification: %s", notif_err)
                    if idem:
                        await mark_processed(f"app-worker:{idem}")
                    log.info("processed application event %s", app_id)

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
