#!/bin/sh
set -e
if [ "${RUN_WORKERS:-0}" = "1" ]; then
  exec python -m app.workers.run_all
else
  exec uvicorn app.main:app --host 0.0.0.0 --port 4000
fi
