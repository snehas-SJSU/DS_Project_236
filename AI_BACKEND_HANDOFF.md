# AI Backend Handoff - Complete Summary

## Branch + Integration Context
- Working feature branch: `ai-feature-backend-orchestration`
- Integration branch: `ai-integration` (exists locally and on origin)
- Backend AI is implemented and live-tested end-to-end.

---

## What Was Implemented (Backend AI)

### 1) Core AI service + orchestration
- FastAPI AI backend supports:
  - task submit
  - task status retrieval
  - task approval lifecycle
  - websocket progress updates
  - metrics summary
- **Candidate sourcing on submit:** `candidate_source` can be `explicit` (caller-supplied IDs), `job_applicants` (load `member_id`s from applications for `job_id`), or `members_search` (load IDs from member search filters). Then the same parse → match → shortlist pipeline ranks that set.
- Multi-step supervisor pipeline (ranking):
  1. Resume parse
  2. Match score
  3. Shortlist generation (top **k** from `AI_SHORTLIST_TOP_K`, default **5**)
- After ranking, the task moves to **`shortlist_ready`**. The recruiter selects one or more ranked members, then calls **`POST /api/ai/tasks/{task_id}/outreach/generate`** to draft outreach only for those IDs. The task then enters **`awaiting_approval`** as before.
- **Reject** from the approval UI sets terminal state **`rejected`** (Kafka `ai.rejected`), not `failed`.
- Pipeline is Kafka-connected using:
  - `ai.requests` (task intake)
  - `ai.results` (progress/final outputs)

### 2) Human-in-the-loop review (required grading item)
- Approval endpoint supports:
  - `approve`
  - `edit` (with `edited_text`)
  - `reject`
- Recruiter-facing output is gated by review checkpoint (`awaiting_approval`) before completion.

### 3) Idempotency + failure handling
- Submit-level idempotency via `client_request_id` + `actor_id` reuse behavior.
- Kafka `idempotency_key` on each published event is a **stable SHA-256** of `(task_id, topic, event_type, payload)` so redelivered messages can be deduped by consumers.
- Optional **`AI_REQUIRE_LIVE_DATA=true`**: do not use bundled candidate/job fixtures; Member/Job HTTP APIs must return data. Skill routes return **503** with `LIVE_DATA_REQUIRED` if not; supervisor pipeline fails the step with the same semantics. Default is off (dev-friendly fallbacks). See `services/ai-service/.env.example`.
- Duplicate-processing protections in workflow steps.
- Structured failure paths and error envelopes.
- Approval flow wrapped with failure handling.

### 4) Persistence + observability
- Task traces persisted.
- Step-level outputs persisted.
- Status transitions/events persisted.
- MongoDB collections used for AI tasks/events (with indexes for task/trace/timestamps).
- Event stream endpoint available at task level.

### 5) AI skills separation
- Skill endpoints are exposed and callable as stateless REST contracts:
  - `/ai/resume/parse`
  - `/ai/match/score`
  - `/ai/shortlist`
  - `/ai/outreach/draft`
- `ai-skills-service` added (skills-facing microservice proxy layer) and integrated into startup scripts.

### 6) Outreach worker integration
- `outreach-send-worker.js` added in messaging service to consume AI-triggered send events and create messages through messaging API.
- Messaging service scripts updated to support outreach worker startup.


### 7) Eval harness
- `scripts/ai-eval-harness.py` added for repeated submit/poll/approve runs and metric evidence generation.

---

## API Contract Frontend Must Follow

### Submit AI task
`POST /api/ai/tasks/submit`

**A) Explicit candidate list** — you already know `member_id`s (any non-empty `candidate_ids` is treated as explicit, regardless of `candidate_source`):
```json
{
  "task_type": "candidate_shortlist",
  "job_id": "J-LIVE-1",
  "candidate_ids": ["M-102", "M-103"],
  "actor_id": "R-101",
  "candidate_source": "explicit",
  "trace_id": "demo-run-001"
}
```
**B) Applicants for that job (default when `candidate_ids` is empty)** — AI resolves candidates from Application Service (`POST /applications/byJob` via gateway). Omit `candidate_source` or set `job_applicants`:
```json
{
  "task_type": "candidate_shortlist",
  "job_id": "J-LIVE-1",
  "candidate_ids": [],
  "actor_id": "R-101",
  "candidate_source": "job_applicants"
}
```

**C) Member directory search** — AI resolves up to `AI_MEMBERS_SEARCH_MAX` members from `POST /members/search` (requires at least one filter). Use only when `candidate_ids` is empty and `candidate_source` is `members_search`:
```json
{
  "task_type": "candidate_shortlist",
  "job_id": "J-LIVE-1",
  "candidate_ids": [],
  "actor_id": "R-101",
  "candidate_source": "members_search",
  "member_search": { "keyword": "engineer", "location": "San Jose", "skill": "python" }
}
```

Important:
- `actor_id` is required.
- Supported `task_type` currently: `candidate_shortlist`.
- Env overrides for sourcing URLs: `AI_APPLICATIONS_BY_JOB_URL`, `AI_MEMBERS_SEARCH_URL`, `AI_MEMBERS_SEARCH_MAX` (see `services/ai-service/.env.example`).

### Generate outreach (after shortlist_ready)
`POST /api/ai/tasks/{task_id}/outreach/generate`

```json
{
  "candidate_ids": ["M-101"],
  "reviewer_id": "R-101"
}
```

### Approve/Edit/Reject task
`POST /api/ai/tasks/{task_id}/approve`

Approve:
```json
{
  "decision": "approve",
  "reviewer_id": "R-101"
}
```

Edit:
```json
{
  "decision": "edit",
  "reviewer_id": "R-101",
  "edited_text": "Updated outreach text..."
}
```

Reject:
```json
{
  "decision": "reject",
  "reviewer_id": "R-101"
}
```

### Read endpoints
- `GET /api/ai/tasks/{task_id}`
- `GET /api/ai/metrics/summary`
- `GET /api/ai/tasks/{task_id}/events` (works via gateway route; may not always appear in gateway Swagger listing)

### Realtime
- `ws://<host>/api/ai/ws/ai/tasks/{task_id}`

---

## Task State + UI Behavior

Expected lifecycle:
- `queued` → `processing` → **`shortlist_ready`** → (recruiter picks IDs) → **`awaiting_approval`** → `completed`
- Recruiter reject (approval decision): terminal **`rejected`**
- Unrecoverable pipeline errors: `failed`

Frontend integration flow:
1. Submit task (`job_id` + `actor_id`; empty `candidate_ids` uses job applicants by default)
2. Poll task state (or subscribe to WS)
3. On **`shortlist_ready`**, show ranked shortlist; recruiter selects one or more `member_id`s, then **`POST .../outreach/generate`**
4. On `awaiting_approval`, show review action UI for the drafted outreach
5. Send decision (`approve` / `edit` / `reject`)
6. Refresh task and metrics

Fields to render from task response:
- `state`
- `steps[]`
- `result.shortlist`
- `result.outreach_draft`
- `approval` block after decision

Metrics to render:
- `approval_counts`
- `approval_rate`
- `edit_rate`
- `rejection_rate`

---


## README/Docs Updates Completed
- Added minimal AI quickstart section (ports, start, health, submit, approve, checks).
- Added clean AI architecture diagram.
- Added clean AI workflow diagram with:
  - `ai.requests`/`ai.results`
  - human review checkpoint
  - shared `trace_id` + `idempotency_key` note

---


## Handoff/Repo Hygiene Notes
Recommended to commit:
- source code + scripts + docs updates

Recommended to exclude from commit:
- local venv (`.aienv311/`)
- generated results artifacts (`results/ai-eval-*.json`)
- large dataset/generated data folder (`data/`) unless team explicitly wants versioned sample data
- secret env files (`services/ai-service/.env`)

---

## Files Touched (AI-related)
- `services/ai-service/main.py`
- `services/ai-service/requirements.txt`
- `services/ai-service/.env.example`
- `services/ai-skills-service/*` (new service)
- `services/messaging-service/outreach-send-worker.js`
- `services/messaging-service/package.json`
- `api-gateway/index.js`
- `api-gateway/swagger.yaml`
- `package.json`
- `scripts/ai-eval-harness.py`
- `README.md`
- `PROJECT_STATUS.md`
---

