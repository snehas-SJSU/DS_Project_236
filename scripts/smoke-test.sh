#!/usr/bin/env bash
set -eu
# Note: no `pipefail` — curl may exit 23 when `head -c` closes early on large /members/get bodies.

BASE_URL="${BASE_URL:-http://localhost:4000/api}"
TEST_EMAIL="${TEST_EMAIL:-smoke_test_user_$(date +%s)@test.com}"
TEST_PASSWORD="${TEST_PASSWORD:-Valid@123}"
SMOKE_RECRUITER_ID="${SMOKE_RECRUITER_ID:-R-123}"
SMOKE_MEMBER_ID="${SMOKE_MEMBER_ID:-M-123}"
# Kafka workers persist jobs/applications async; increase if CI is slow.
SMOKE_ASYNC_WAIT_ATTEMPTS="${SMOKE_ASYNC_WAIT_ATTEMPTS:-80}"
SMOKE_ASYNC_SLEEP_SEC="${SMOKE_ASYNC_SLEEP_SEC:-0.35}"

echo "Running smoke tests against ${BASE_URL}"

post() {
  local path="$1"
  local body="$2"
  curl -sS --connect-timeout 5 --max-time 120 -X POST "${BASE_URL}${path}" -H "Content-Type: application/json" -d "${body}"
}

# Avoid bash capturing multi‑MB /members/get payloads (cover_photo base64); trim for checks only.
post_trim() {
  local path="$1"
  local body="$2"
  local max_bytes="${3:-65536}"
  curl -s --connect-timeout 5 --max-time 120 -X POST "${BASE_URL}${path}" -H "Content-Type: application/json" -d "${body}" | head -c "${max_bytes}"
}

http_post_code() {
  local path="$1"
  local body="$2"
  curl -sS -o /dev/null --connect-timeout 5 --max-time 120 -w "%{http_code}" -X POST "${BASE_URL}${path}" -H "Content-Type: application/json" -d "${body}"
}

assert_contains_any() {
  local text="$1"
  shift
  python3 - "$text" "$@" <<'PY'
import sys
payload = sys.argv[1]
needles = sys.argv[2:]
if not any(n in payload for n in needles):
    print("Assertion failed. Response did not contain any of:", ", ".join(needles))
    print(payload[:4000] if len(payload) > 4000 else payload)
    raise SystemExit(1)
PY
}

fatal_if_gateway_html() {
  local label=$1
  local payload=$2
  if [[ -z "${payload// }" ]]; then
    echo "ERROR [${label}]: empty response. Is the gateway up at ${BASE_URL}? (npm run start:all)"
    exit 1
  fi
  if echo "$payload" | grep -qi '<!DOCTYPE html\|<html'; then
    echo "ERROR [${label}]: got HTML (proxy/upstream missing?). Response snippet:"
    echo "$payload" | head -c 500
    echo ""
    echo "Hint: start api-gateway :4000 and all services (see package.json start:all)."
    exit 1
  fi
}

wait_until_job_in_db() {
  local job_id=$1
  local i=0
  local r=""
  while [[ $i -lt $SMOKE_ASYNC_WAIT_ATTEMPTS ]]; do
    r="$(post "/jobs/get" "{\"job_id\":\"${job_id}\"}")"
    if echo "$r" | grep -q '"error".*"NOT_FOUND"'; then
      sleep "$SMOKE_ASYNC_SLEEP_SEC"
      i=$((i + 1))
      continue
    fi
    if echo "$r" | grep -qF "${job_id}"; then
      return 0
    fi
    sleep "$SMOKE_ASYNC_SLEEP_SEC"
    i=$((i + 1))
  done
  echo "Timeout: job ${job_id} not visible via /jobs/get after worker processing."
  echo "Last response: ${r}"
  echo "Hint: ensure job-service worker is running and Kafka is up."
  exit 1
}

wait_until_application_for_job() {
  local job_id=$1
  local i=0
  local r=""
  while [[ $i -lt $SMOKE_ASYNC_WAIT_ATTEMPTS ]]; do
    r="$(post "/applications/byJob" "{\"job_id\":\"${job_id}\"}")"
    if echo "$r" | grep -qF "${job_id}"; then
      return 0
    fi
    sleep "$SMOKE_ASYNC_SLEEP_SEC"
    i=$((i + 1))
  done
  echo "Timeout: no application row for job ${job_id} (application worker lag?)."
  echo "Last: ${r}"
  exit 1
}

wait_until_job_closed() {
  local job_id=$1
  local i=0
  local r=""
  while [[ $i -lt $SMOKE_ASYNC_WAIT_ATTEMPTS ]]; do
    r="$(post "/jobs/get" "{\"job_id\":\"${job_id}\"}")"
    if echo "$r" | grep -q '"status":"closed"'; then
      return 0
    fi
    sleep "$SMOKE_ASYNC_SLEEP_SEC"
    i=$((i + 1))
  done
  echo "Timeout: job ${job_id} not closed yet (job worker lag?)."
  echo "Last response: ${r}"
  exit 1
}

echo "[0] gateway / member reachability"
code0="$(http_post_code "/members/get" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
if [[ "${code0}" != "200" ]]; then
  echo "ERROR: GET member HTTP ${code0}. Is the gateway up at ${BASE_URL}? (npm run start:all)"
  exit 1
fi
r0="$(post_trim "/members/get" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" 8192)"
fatal_if_gateway_html "members/get" "$r0"

echo "[1] member get (HTTP only — skip full body; can be multi-MB with cover image)"
code1="$(http_post_code "/members/get" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
[[ "${code1}" == "200" ]] || { echo "member get failed HTTP ${code1}"; exit 1; }

echo "[2] jobs search"
r2="$(post "/jobs/search" '{}')"
fatal_if_gateway_html "jobs/search" "$r2"

echo "[3] applications by member"
post "/applications/byMember" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[4] threads by user"
post "/threads/byUser" "{\"user_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[5] connections list"
post "/connections/list" "{\"user_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[5b] connections requestsByUser"
r5b="$(post "/connections/requestsByUser" "{\"user_id\":\"${SMOKE_MEMBER_ID}\"}")"
fatal_if_gateway_html "connections/requestsByUser" "$r5b"
assert_contains_any "$r5b" "incoming" "sent"

echo "[6] analytics member dashboard"
post "/analytics/member/dashboard" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[6b] analytics jobs top"
post "/analytics/jobs/top" '{}' >/dev/null

echo "[7] duplicate signup should return DUPLICATE_EMAIL"
first_signup="$(post "/auth/signup" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")"
fatal_if_gateway_html "auth/signup" "$first_signup"
assert_contains_any "${first_signup}" "\"token\"" "Signup successful"
second_signup="$(post "/auth/signup" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")"
assert_contains_any "${second_signup}" "DUPLICATE_EMAIL"

echo "[8] create job, apply once, then duplicate apply check"
new_job="$(post "/jobs/create" "{\"title\":\"Smoke Duplicate Apply Job\",\"company\":\"Acme\",\"location\":\"San Jose, CA\",\"salary\":\"100k-120k\",\"type\":\"Full-time\",\"description\":\"Smoke duplicate apply check\",\"skills\":[\"Node.js\"],\"recruiter_id\":\"${SMOKE_RECRUITER_ID}\"}")"
fatal_if_gateway_html "jobs/create" "$new_job"
job_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("job_id",""))' "${new_job}")"
if [[ -z "${job_id}" ]]; then
  echo "Failed to parse job_id from jobs/create response"
  echo "${new_job}"
  exit 1
fi
wait_until_job_in_db "${job_id}"

first_apply="$(post "/applications/submit" "{\"job_id\":\"${job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
fatal_if_gateway_html "applications/submit (1)" "$first_apply"
assert_contains_any "${first_apply}" "Application submitted" "application_id"
wait_until_application_for_job "${job_id}"

second_apply="$(post "/applications/submit" "{\"job_id\":\"${job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
fatal_if_gateway_html "applications/submit (2)" "$second_apply"
assert_contains_any "${second_apply}" "DUPLICATE_APPLICATION"

echo "[9] closed job apply should return JOB_CLOSED"
closed_job_create="$(post "/jobs/create" "{\"title\":\"Smoke Closed Job\",\"company\":\"Acme\",\"location\":\"San Jose, CA\",\"salary\":\"100k-120k\",\"type\":\"Full-time\",\"description\":\"Smoke closed job check\",\"skills\":[\"Node.js\"],\"recruiter_id\":\"${SMOKE_RECRUITER_ID}\"}")"
fatal_if_gateway_html "jobs/create (closed)" "$closed_job_create"
closed_job_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("job_id",""))' "${closed_job_create}")"
if [[ -z "${closed_job_id}" ]]; then
  echo "Failed to parse closed_job_id from jobs/create response"
  echo "${closed_job_create}"
  exit 1
fi
wait_until_job_in_db "${closed_job_id}"
post "/jobs/close" "{\"job_id\":\"${closed_job_id}\"}" >/dev/null
wait_until_job_closed "${closed_job_id}"
closed_apply="$(post "/applications/submit" "{\"job_id\":\"${closed_job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
fatal_if_gateway_html "applications/submit (closed)" "$closed_apply"
assert_contains_any "${closed_apply}" "JOB_CLOSED"

echo "[10] posts: create → list → get → like → comment → repost → send → unrepost → unlike"
create_post="$(post "/posts/create" "{\"member_id\":\"${SMOKE_MEMBER_ID}\",\"author_name\":\"Smoke\",\"body\":\"smoke post $(date +%s)\"}")"
fatal_if_gateway_html "posts/create" "$create_post"
post_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("post_id",""))' "${create_post}")"
if [[ -z "${post_id}" ]]; then
  echo "posts/create failed or no post_id"
  echo "${create_post}"
  exit 1
fi
post "/posts/list" "{\"limit\":5,\"viewer_member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null
get_post="$(post "/posts/get" "{\"post_id\":\"${post_id}\",\"viewer_member_id\":\"${SMOKE_MEMBER_ID}\"}")"
fatal_if_gateway_html "posts/get" "$get_post"
if echo "$get_post" | grep -q 'Cannot POST'; then
  echo "posts/get failed — restart post-service on :4007 with latest code (POST /posts/get)."
  echo "$get_post"
  exit 1
fi
assert_contains_any "${get_post}" "\"post_id\"" "${post_id}"

like_resp="$(post "/posts/like" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${like_resp}" "like_count"
comment_resp="$(post "/posts/comment" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\",\"author_name\":\"Smoke\",\"body\":\"smoke comment\"}")"
assert_contains_any "${comment_resp}" "comment_id" "comment_count"
repost_resp="$(post "/posts/repost" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${repost_resp}" "repost_count" "reposted"
send_resp="$(post "/posts/send" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${send_resp}" "send_count" "send_id"
post "/posts/unrepost" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null
post "/posts/unlike" "{\"post_id\":\"${post_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[11] members search + recruiters search + events ingest"
post "/members/search" '{"keyword":""}' >/dev/null
post "/recruiters/search" '{}' >/dev/null
post "/events/ingest" "{\"event_type\":\"smoke.test\",\"trace_id\":\"SMOKE-$(date +%s)\",\"timestamp\":\"$(date -u +%Y-%m-%dT%H:%M:%SZ)\",\"actor_id\":\"${SMOKE_MEMBER_ID}\",\"entity\":{\"entity_type\":\"member\",\"entity_id\":\"${SMOKE_MEMBER_ID}\"},\"payload\":{\"source\":\"smoke\"},\"idempotency_key\":\"idem-smoke-$(date +%s)\"}" >/dev/null

echo "[12] messaging: open thread + send + list"
peer_demo="${SMOKE_MSG_PEER:-M-DEMO-01}"
thread_open="$(post "/threads/open" "{\"participant_a\":\"${SMOKE_MEMBER_ID}\",\"participant_b\":\"${peer_demo}\"}")"
fatal_if_gateway_html "threads/open" "$thread_open"
thread_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("thread_id",""))' "${thread_open}")"
if [[ -z "${thread_id}" ]]; then
  echo "threads/open missing thread_id: ${thread_open}"
  exit 1
fi
send_msg="$(post "/messages/send" "{\"thread_id\":\"${thread_id}\",\"sender_id\":\"${SMOKE_MEMBER_ID}\",\"text\":\"smoke $(date +%s)\"}")"
fatal_if_gateway_html "messages/send" "$send_msg"
assert_contains_any "${send_msg}" "message_id" "thread_id"
post "/messages/list" "{\"thread_id\":\"${thread_id}\",\"limit\":20}" >/dev/null

echo "Smoke tests passed (gateway + async workers + posts/get + messaging + analytics/events)."
