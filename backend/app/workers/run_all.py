"""Run all Kafka consumers in one process."""

from __future__ import annotations

import asyncio
import logging

from app.workers import analytics_worker, application_worker, connection_worker, job_worker, member_worker, message_worker

log = logging.getLogger(__name__)


async def main() -> None:
    logging.basicConfig(level=logging.INFO)
    await asyncio.gather(
        member_worker.run(),
        job_worker.run(),
        application_worker.run(),
        connection_worker.run(),
        message_worker.run(),
        analytics_worker.run(),
    )


if __name__ == "__main__":
    asyncio.run(main())
