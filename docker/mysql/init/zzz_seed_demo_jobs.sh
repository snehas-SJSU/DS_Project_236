#!/bin/bash
set -euo pipefail
# Imports repo root scripts/seed-demo-jobs.sql (mounted at /seed-demo-jobs.sql in docker-compose.yml).
if [ ! -f /seed-demo-jobs.sql ]; then
  echo "[init] /seed-demo-jobs.sql not mounted; skip demo jobs import."
  exit 0
fi
echo "[init] Importing scripts/seed-demo-jobs.sql into linkedin_db..."
mysql -uroot -p"${MYSQL_ROOT_PASSWORD}" linkedin_db </seed-demo-jobs.sql
echo "[init] Demo jobs + company_logo_url seed complete."
