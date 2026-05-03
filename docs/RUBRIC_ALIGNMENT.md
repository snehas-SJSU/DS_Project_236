# Rubric alignment (Class LinkedIn + Agentic AI)

Map from **`Class_Project_Description_LinkedIn_AgenticAI.docx`** to this repository.

**Deferred (you are handling separately):** AWS/Kubernetes deploy evidence, JMeter runs + charts, and the written performance/analysis submission. Everything below still applies to **local** feature completeness and architecture.

## 3-tier + Kafka + data stores

| Requirement | Where it lives |
|-------------|----------------|
| Tier 1 — Client | `frontend/` (React + Vite) |
| Tier 2 — REST + Kafka | `backend/app` (FastAPI), `backend/app/workers` (consumers), `services/ai-service` (AI + Kafka `ai.requests` / `ai.results`) |
| Tier 3 — MySQL + MongoDB | MySQL via `backend/app/db.py`, Mongo via `backend/app/mongo_db.py` + Motor; AI traces in AI service |
| Redis SQL caching | e.g. `members/get`, `jobs/get` in `backend/app/routers/members.py`, `jobs.py`; idempotency `backend/app/idempotency.py` |

## Core APIs (Section 6)

Routers under `backend/app/routers/` implement the POST surfaces (members, jobs, applications, messaging, connections, analytics, posts). OpenAPI reference: `docs/swagger.yaml`.

## Kafka envelope

Shared JSON fields are produced by helpers such as `app_env` in `backend/app/routers/applications.py`. Automated shape check: `backend/tests/test_kafka_envelope.py`.

## Failure modes (class list)

| Case | Implementation |
|------|----------------|
| Duplicate email | `auth/signup`, `members/create` → `DUPLICATE_EMAIL` |
| Duplicate application | `applications/submit` → `DUPLICATE_APPLICATION` |
| Apply to closed job | `applications/submit` → `JOB_CLOSED` |
| Message retry | Messaging router / client behavior (see `messaging.py` + frontend) |
| Kafka idempotent consumers | `idempotency_key` + Redis guards in workers / ingest |

## Analytics (Section 8)

| Dashboard | UI | API |
|-----------|----|-----|
| Recruiter | `frontend/src/pages/RecruiterDashboard.tsx` | `analytics/jobs/top`, `geo`, `jobs/timeseries`, **`analytics/funnel`** |
| Member | `MemberAnalyticsPage.tsx`, `Profile.tsx` | `analytics/member/dashboard` |

## Agentic AI (Section 7)

| Requirement | Where |
|-------------|-------|
| FastAPI agent layer | `services/ai-service/main.py` |
| Kafka orchestration | Consumer on `ai.requests`, publishes `ai.results` (see service code) |
| Core API proxy | `backend/app/main.py` `/api/ai/...` and WebSocket proxy |
| Human-in-the-loop | AI service approval / shortlist flows |

## Distributed deployment (grading “Docker on AWS / K8s”)

| Artifact | Path |
|----------|------|
| Infra (local) | `docker-compose.yml` |
| App images + compose | `backend/Dockerfile`, `docker-compose.apps.yml`, `services/ai-service/Dockerfile` |
| EKS-style examples | `deploy/kubernetes/` |
| ECS walkthrough | `deploy/aws-ecs/README.md` |

Logical “services” (Profile, Job, Application, …) map to **routers** in one FastAPI process plus **Kafka consumers** and a **separate AI** process—document that decomposition in your write-up if the rubric asks for “distributed services.”

## Test class (automated)

| Command | Purpose |
|---------|---------|
| `npm run test:backend` | Unit tests (no running stack required for envelope test) |
| `npm run test:backend:integration` | Live tests: set `INTEGRATION_TEST=1`, stack on `:4000` |
| `npm run test:smoke` | Bash end-to-end smoke script |

## Datasets

Seed / loader scripts under `scripts/` (e.g. Kaggle-oriented seeds). Cite dataset URLs from the project PDF in your submission write-up.

## Still your submission (not in code)

- Short **write-up** (caching policy, DB write policy, lessons learned).  
- **Screenshots** / evidence of AWS or K8s deploy if required for full credit.  
- **JMeter** results and bar charts when you complete performance milestones.
