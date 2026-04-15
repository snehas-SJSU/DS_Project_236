#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000/api}"

echo "Running smoke tests against ${BASE_URL}"

post() {
  local path="$1"
  local body="$2"
  curl -sS -X POST "${BASE_URL}${path}" -H "Content-Type: application/json" -d "${body}"
}

echo "[1] member get"
post "/members/get" '{"member_id":"M-123"}' >/dev/null

echo "[2] jobs search"
post "/jobs/search" '{}' >/dev/null

echo "[3] applications by member"
post "/applications/byMember" '{"member_id":"M-123"}' >/dev/null

echo "[4] threads by user"
post "/threads/byUser" '{"user_id":"M-123"}' >/dev/null

echo "[5] connections list"
post "/connections/list" '{"user_id":"M-123"}' >/dev/null

echo "[6] analytics member dashboard"
post "/analytics/member/dashboard" '{"member_id":"M-123"}' >/dev/null

echo "Smoke tests passed."
