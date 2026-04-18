#!/usr/bin/env bash
set -euo pipefail

BASE_URL="${BASE_URL:-http://localhost:4000/api}"
TEST_EMAIL="${TEST_EMAIL:-smoke_test_user_$(date +%s)@test.com}"
TEST_PASSWORD="${TEST_PASSWORD:-Valid@123}"
SMOKE_RECRUITER_ID="${SMOKE_RECRUITER_ID:-R-123}"
SMOKE_MEMBER_ID="${SMOKE_MEMBER_ID:-M-123}"

echo "Running smoke tests against ${BASE_URL}"

post() {
  local path="$1"
  local body="$2"
  curl -sS -X POST "${BASE_URL}${path}" -H "Content-Type: application/json" -d "${body}"
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
    print(payload)
    raise SystemExit(1)
PY
}

echo "[1] member get"
post "/members/get" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[2] jobs search"
post "/jobs/search" '{}' >/dev/null

echo "[3] applications by member"
post "/applications/byMember" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[4] threads by user"
post "/threads/byUser" "{\"user_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[5] connections list"
post "/connections/list" "{\"user_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[6] analytics member dashboard"
post "/analytics/member/dashboard" "{\"member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null

echo "[7] duplicate signup should return DUPLICATE_EMAIL"
first_signup="$(post "/auth/signup" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")"
assert_contains_any "${first_signup}" "\"token\"" "Signup successful"
second_signup="$(post "/auth/signup" "{\"email\":\"${TEST_EMAIL}\",\"password\":\"${TEST_PASSWORD}\"}")"
assert_contains_any "${second_signup}" "DUPLICATE_EMAIL"

echo "[8] create job, apply once, then duplicate apply check"
new_job="$(post "/jobs/create" "{\"title\":\"Smoke Duplicate Apply Job\",\"company\":\"Acme\",\"location\":\"San Jose, CA\",\"salary\":\"100k-120k\",\"type\":\"Full-time\",\"description\":\"Smoke duplicate apply check\",\"skills\":[\"Node.js\"],\"recruiter_id\":\"${SMOKE_RECRUITER_ID}\"}")"
job_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("job_id",""))' "${new_job}")"
if [[ -z "${job_id}" ]]; then
  echo "Failed to parse job_id from jobs/create response"
  echo "${new_job}"
  exit 1
fi
sleep 2
first_apply="$(post "/applications/submit" "{\"job_id\":\"${job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${first_apply}" "Application submitted" "application_id"
second_apply="$(post "/applications/submit" "{\"job_id\":\"${job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${second_apply}" "DUPLICATE_APPLICATION"

echo "[9] closed job apply should return JOB_CLOSED"
closed_job_create="$(post "/jobs/create" "{\"title\":\"Smoke Closed Job\",\"company\":\"Acme\",\"location\":\"San Jose, CA\",\"salary\":\"100k-120k\",\"type\":\"Full-time\",\"description\":\"Smoke closed job check\",\"skills\":[\"Node.js\"],\"recruiter_id\":\"${SMOKE_RECRUITER_ID}\"}")"
closed_job_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("job_id",""))' "${closed_job_create}")"
if [[ -z "${closed_job_id}" ]]; then
  echo "Failed to parse closed_job_id from jobs/create response"
  echo "${closed_job_create}"
  exit 1
fi
sleep 2
post "/jobs/close" "{\"job_id\":\"${closed_job_id}\"}" >/dev/null
sleep 1
closed_apply="$(post "/applications/submit" "{\"job_id\":\"${closed_job_id}\",\"member_id\":\"${SMOKE_MEMBER_ID}\"}")"
assert_contains_any "${closed_apply}" "JOB_CLOSED"

echo "[10] posts: create → list → like → comment → repost → send → unrepost → unlike"
create_post="$(post "/posts/create" "{\"member_id\":\"${SMOKE_MEMBER_ID}\",\"author_name\":\"Smoke\",\"body\":\"smoke post $(date +%s)\"}")"
post_id="$(python3 -c 'import json,sys; print(json.loads(sys.argv[1]).get("post_id",""))' "${create_post}")"
if [[ -z "${post_id}" ]]; then
  echo "posts/create failed or no post_id"
  echo "${create_post}"
  exit 1
fi
post "/posts/list" "{\"limit\":5,\"viewer_member_id\":\"${SMOKE_MEMBER_ID}\"}" >/dev/null
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

echo "Smoke tests passed (core + failure-mode checks + posts)."
