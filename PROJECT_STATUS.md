# Project Status (Single Source)

Last updated: Apr 2026 (connections, feed/share UX, smoke hardening, same-origin dev URLs, README sync).

## Scope status

- Completed: all required core application features from the project PDF except the excluded scope.
- Excluded scope (intentionally pending): AI workflow completion, JMeter benchmarking run/charts, AWS deployment.

## Completed work

- 3-tier architecture with API gateway, microservices, Kafka, MySQL, MongoDB, and Redis.
- Member module: create/get/update/delete/search + profile UI.
- Recruiter/admin module: recruiter CRUD/search APIs + recruiter admin UI.
- Job module: create/get/update/search/close/byRecruiter/save + jobs UI.
- Application module: submit/get/byJob/byMember/updateStatus/addNote + recruiter/member flows.
- Messaging module: threads/messages send/list/byUser + LinkedIn-style messaging UI.
- Connection module: request/accept/reject/list/mutual + LinkedIn-style network UI.
- Analytics module: ingest/jobs top/funnel/geo/member dashboard + day/week trend charts.
- Frontend routing/link wiring completed across major pages.
- UX consistency updates: toast-based feedback, functional Premium/Language/Job Post/Company pages, and notification read-state persistence.
- Profile UX updates: LinkedIn-style profile/public-profile routing, dynamic profile navigation from avatars/names, improved jobs link behavior, and section-level edit controls.
- Feed and posting updates: interactive post composer modal (start post, media attach, schedule/audience options, AI rewrite demo) with immediate in-app feed visibility.
- Notifications and messaging updates: API-driven in-app notifications + polling refresh, connection/request list auto-refresh, and messaging threads/messages auto-refresh.
- Permission hardening: profile language/public URL edit controls visible only on own profile; hidden for other profiles.
- Frontend runtime hardening: centralized API base URL adaptation via frontend fetch bootstrap (`VITE_API_BASE_URL` support); local dev uses **same-origin** `fetch('/api/...')` with Vite proxying **`/api`** and **`/docs`** to the gateway so demos can stick to **`http://localhost:3000`** (Swagger also at **`http://localhost:3000/docs`**).
- Reliability handling: duplicate email, duplicate application, closed-job apply checks, message retry, Kafka idempotency guards.
- Auth: email/password signup/login/logout implemented with JWT bearer tokens.
- Backend stabilization: job-service schema compatibility migration for legacy MySQL (`industry`, `remote_mode`, `seniority_level`, `employment_type`, counts columns) to keep workers healthy across fresh and old DB states.
- **Connections consistency:** `requestsByUser` hides pending sent/incoming when a `connections` row already exists for that member (avoids “pending” + “connected” mismatch after seed or manual DB drift). `seed-demo-connections` marks matching `connection_requests` as accepted when present.
- **Post service and feed sharing:** `post-service` with gateway `/api/posts` proxy; `POST /posts/get` for single-post fetches (e.g. message share previews). Feed share messages append a `[[post_share:…]]` marker; messaging renders a share card, linkifies `http(s)` URLs, and `/feed#P-…` scrolls to the post (`article id` + hash handler).
- **Demo seed:** `npm run seed:connections` upserts demo members and edges for `M-123` plus request cleanup (see `scripts/seed-demo-connections.js`).
- **Profile images:** `members` photo URL columns widened to **`LONGTEXT`** when legacy types were `TEXT`/`VARCHAR`/`MEDIUMTEXT`; member-service JSON limit raised; optional MySQL `max_allowed_packet` in `docker-compose.yml` — supports multi‑MB cover/profile uploads without silent failures.

## Latest verification snapshot

- Non-AI completion checklist (`NON_AI_COMPLETION_REPORT.pdf`, scope excluding AI / JMeter execution / AWS deploy) remains accurate: tiered architecture, entity coverage, required APIs, analytics graphs, and failure modes still reflected in codebase; excluded scope unchanged.
- Smoke test passes (`scripts/smoke-test.sh`): reachability without downloading multi‑MB `/members/get` bodies, **polls until Kafka workers persist jobs/applications** (avoids race flakes), `POST /posts/get`, `connections/requestsByUser`, analytics top, `events/ingest`, and **threads/messages** round-trip. **Restart `post-service` after pulling** so `/posts/get` exists (otherwise smoke fails with `Cannot POST /posts/get`).
- Frontend `npm run build` passes.
- Duplicate signup returns `DUPLICATE_EMAIL`.
- Duplicate apply returns `DUPLICATE_APPLICATION`.
- Apply-to-closed-job returns `JOB_CLOSED`.
- Premium navigation hardened with alias redirects to `/premium` (`/try-premium`, `/premium/free-trial`, `/premium/trial`).
- Manual profile smoke checks passed for `/profile` and `/profile/:memberId` route rendering plus connection-action API behavior.
- Dynamic flow checks passed for profile update persistence, job posting/search visibility, and connect→accept lifecycle validation.
- **`README.md`** is the operator-facing runbook: ports (**`:3000`** app, **`:4000`** gateway/Swagger direct), proxied Swagger on **`:3000/docs`**, smoke defaults to **`http://localhost:4000/api`**, and copy/paste startup commands.

## Pending note (auth)

- Google OAuth is not implemented yet. The `Continue with Google` button is currently UI-only and intentionally pending.

## Pending note (performance evidence)

- Redis SQL caching is implemented in backend code paths (lookup caching + invalidation) and included in current runtime.
- Pending item is benchmark evidence generation: run JMeter (or equivalent) and publish baseline vs Redis-enabled performance comparison (`B` vs `B+S`) with charts/tables.
- Ownership for this step can be assigned to the performance/JMeter assignee; this is a reporting/measurement phase, not a missing core Redis implementation.

## Pending note (AI section)

- Section 7 remains intentionally pending/in-progress for final grading scope.
- Current AI baseline exists: FastAPI service, gateway `/api/ai/*` proxy, task submit/status endpoints, approval endpoint, and WebSocket progress stub.
- Remaining AI items (Section 7 core functionality checklist):
  - **AI orchestrator/supervisor consume loop** — pending (`ai.requests` consumer not implemented end-to-end).
  - **`ai.results` topic publish flow** — pending (intermediate/final outputs not Kafka-published).
  - **Multi-step skill chaining by supervisor** — pending (resume parse -> match -> shortlist -> outreach not orchestrated via Kafka pipeline).
  - **Persistent AI task store** — pending (task state/trace/results currently in-memory, not DB-backed).
  - **Trace continuity across full AI chain** — pending (`trace_id` starts at submit, but full persisted lineage is incomplete).
  - **Human-in-loop approval wired into orchestrated lifecycle** — partial/pending (approval endpoint exists but not integrated with full supervisor/results lifecycle).
  - **Failure/retry/idempotency strategy for AI workflow** — pending (core services have idempotency; AI pipeline strategy not fully implemented/documented).
  - **AI evaluation metrics/report** — pending (matching quality + HITL approval-rate evidence not yet produced).
  - **AI deliverables package** — pending (workflow diagram, topic design, per-skill I/O spec, evaluation results, failure handling write-up, end-to-end demo evidence).

## Database requirements (Section 10)

- **MySQL transactional records — implemented:** jobs, applications, recruiters/admin entities, members/auth/session, connections, and thread metadata are persisted in MySQL.
- **MongoDB logs/events + message bodies — implemented:** analytics events are ingested into Mongo (`events` collection), and messaging body payloads are persisted in Mongo (`messages` collection).
- **DB split justification — implemented:** MySQL is used for OLTP relational state and indexed query paths; MongoDB is used for append-style logs/events and unstructured message documents.
- **Indexes for key queries — implemented and verified:**
  - `applications`: unique `(job_id, member_id)` and indexes on `job_id`, `member_id`.
  - `jobs`: `idx_jobs_status_created (status, created_at)`, `idx_jobs_recruiter_created (recruiter_id, created_at)`, plus filter-path indexes on `company`, `location`, `type`, `employment_type`, `industry`.
  - These indexes are applied via idempotent startup migrations in both `job-service/api.js` and `job-service/worker.js`.
- **Verification:** smoke test passes after async close-state stabilization (`scripts/smoke-test.sh` now waits for persisted `closed` status before asserting `JOB_CLOSED`).

## Runbook

1. `docker compose up -d`
2. `npm run start:all` (API gateway on **:4000** — used internally; demos can ignore this port.)
3. In another terminal: `cd frontend && npm run dev` — open **`http://localhost:3000`** only; the dev server proxies `/api` and `/docs` to the gateway.
4. Optional seed: `npm run seed:member`

For split-origin deploys, set `VITE_API_BASE_URL` to the public API origin (see `frontend/src/main.tsx`).

**Swagger:** canonical URL is **`http://localhost:4000/docs`** (gateway). With **`npm run dev`**, use **`http://localhost:3000/docs`** (proxy). **`npm run preview`** in `frontend/` uses the same proxy config.

## Final note

Non-AI implementation is complete and demo-ready. Remaining work is the intentionally excluded items (AI, JMeter, AWS), Google OAuth completion, and final submission packaging/screenshots/polish.
