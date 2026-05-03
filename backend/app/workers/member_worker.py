"""Consumer for member.events (MySQL projection)."""

from __future__ import annotations

import asyncio
import json
import logging

from aiokafka import AIOKafkaConsumer

from app import db as dbm
from app.config import settings
from app.idempotency import already_processed, mark_processed

log = logging.getLogger(__name__)


async def run() -> None:
    await dbm.get_pool()
    consumer = AIOKafkaConsumer(
        "member.events",
        bootstrap_servers=settings.kafka_broker_list,
        group_id="member-service-group",
        enable_auto_commit=True,
        auto_offset_reset="latest",
    )
    await consumer.start()
    log.info("member worker listening on member.events")
    try:
        async for msg in consumer:
            try:
                event = json.loads(msg.value.decode("utf-8"))
                idem = event.get("idempotency_key")
                if idem and await already_processed(f"member-worker:{idem}"):
                    continue
                et = event.get("event_type")
                if et not in ("member.created", "member.updated"):
                    continue
                p = event.get("payload") or {}
                member_id = event.get("entity", {}).get("entity_id")
                if not member_id:
                    continue
                skills = json.dumps(p.get("skills") or [])
                exp = json.dumps(p.get("experience") or [])
                edu = json.dumps(p.get("education") or [])
                await dbm.execute(
                    """INSERT INTO members (
                    member_id, name, first_name, last_name, title, headline, location, city, state, country,
                    email, phone, about, summary, skills, experience, education, profile_photo_url, cover_photo_url, cover_theme, resume_url, resume_text, status
                    ) VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active')
                    ON DUPLICATE KEY UPDATE
                    name=VALUES(name), first_name=VALUES(first_name), last_name=VALUES(last_name), title=VALUES(title),
                    headline=VALUES(headline), location=VALUES(location), city=VALUES(city), state=VALUES(state), country=VALUES(country),
                    email=VALUES(email), phone=VALUES(phone), about=VALUES(about), summary=VALUES(summary), skills=VALUES(skills),
                    experience=VALUES(experience), education=VALUES(education), profile_photo_url=VALUES(profile_photo_url),
                    cover_photo_url=VALUES(cover_photo_url), cover_theme=VALUES(cover_theme),
                    resume_url=VALUES(resume_url), resume_text=VALUES(resume_text)""",
                    (
                        member_id,
                        p.get("name"),
                        p.get("first_name"),
                        p.get("last_name"),
                        p.get("title"),
                        p.get("headline"),
                        p.get("location"),
                        p.get("city"),
                        p.get("state"),
                        p.get("country"),
                        p.get("email"),
                        p.get("phone"),
                        p.get("about"),
                        p.get("summary"),
                        skills,
                        exp,
                        edu,
                        p.get("profile_photo_url"),
                        p.get("cover_photo_url"),
                        p.get("cover_theme") or "blue",
                        p.get("resume_url"),
                        p.get("resume_text"),
                    ),
                )
                if idem:
                    await mark_processed(f"member-worker:{idem}")
                log.info("saved member %s", member_id)
            except Exception as e:
                log.exception("member worker error: %s", e)
    finally:
        await consumer.stop()


if __name__ == "__main__":
    logging.basicConfig(level=logging.INFO)
    asyncio.run(run())
