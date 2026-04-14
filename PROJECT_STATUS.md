# LinkedIn Simulation: Status at a Glance

_Last updated: implementation pass — API surfaces aligned with Group API doc where noted below._

## Architecture (course perspective)

**3-tier:** React → API Gateway (`:4000`) → Node microservices + FastAPI (`:8001`) → **MySQL** (transactional), **MongoDB** (events + message bodies), **Redis** (cache + idempotency keys), **Kafka** (async + workers).

---

### Implemented end-to-end

| Layer | Topic | Notes |
| :--- | :--- | :--- |
| **Infrastructure** | Docker Compose | Kafka, Zookeeper, MySQL, MongoDB, Redis |
| **Gateway** | Routing + CORS + Swagger `/docs` | Includes **connections** → `:4006`, **AI** → `:8001` |
| **Member** | CRUD + search + duplicate email (409) | Redis cache on **get**; Kafka → worker for **create** |
| **Job** | Create, search, get, **update**, **close**, **byRecruiter** | Redis on get; **job.viewed** event; worker applies creates/updates/views |
| **Application** | **`/submit`** + **`/apply`** alias | **422** closed job, **409** duplicate; **get**, **byJob**, **byMember**, **updateStatus**, **addNote** |
| **Messaging** | Threads (MySQL) + messages (MongoDB) + `message.sent` Kafka | Port **4004** |
| **Analytics** | **`/events/ingest`**, **jobs/top**, **funnel**, **geo**, **member/dashboard** | Mongo **events** collection + MySQL joins |
| **Connections** | request / accept / reject / list / mutual | Port **4006**, Kafka **connection.events** |
| **AI (FastAPI)** | Tasks, resume/match/shortlist/outreach/coach, **WebSocket** progress stub, **`ai.requests`** publish | Extend with real models + supervisor consumer as needed |
| **Shared** | `idempotency.js` (Redis), `mongo.js` | Consumers skip duplicate `idempotency_key` |

---

### Still for course / demo polish (typical next steps)

| Item | Notes |
| :--- | :--- |
| **JMeter + B / B+S / B+S+K charts** | Seed 10k+ rows, run scenarios, capture bar charts |
| **AWS (ECS/K8s)** | Container deploy + screenshot / diagram |
| **CI** | GitHub Actions: lint, test, build |
| **AI supervisor** | Consumer on **`ai.requests`** → skills → **`ai.results`** (beyond stub) |
| **JWT auth** | Replace open endpoints if required by rubric |

**Run locally:** `docker compose up -d`, then `npm run start:all` from repo root (starts **gateway, member, job, app, msg, analytics, connection** APIs + workers — **start FastAPI** separately: `cd services/ai-service && uvicorn main:app --port 8001`).

---

### Recent operational updates (reproducible demos)

| Topic | Notes |
| :--- | :--- |
| **Local networking** | Defaults use **`127.0.0.1`** for MySQL, Redis, Kafka, Mongo, and gateway upstreams to avoid macOS IPv6 / Docker edge cases. |
| **Gateway** | Longer proxy timeouts; JSON **502** when an upstream is down; AI WebSocket path documented in Swagger. |
| **MySQL on macOS** | If **`ER_ACCESS_DENIED`** for `linkedin_user` while Docker MySQL is up, check **`lsof -i :3306`**: stop **Homebrew** MySQL (`brew services stop mysql`) so only Docker owns the port. Stale credentials after compose changes: **`docker compose down -v`** (wipes DB volumes) then bring stack up again. |
| **Empty DB after volume wipe** | Run **`npm run seed:member`** for profile **M-123**; create at least one job (**`curl`** or Swagger **`POST /api/jobs/create`**) so **Jobs / Easy Apply** has data. |
| **Home UI** | **`/`** is a **placeholder** feed (no API yet); profile and jobs are the live demo surfaces. |
| **Docs** | **`README.md`** — full clone vs daily workflow, troubleshooting, VS Code tasks (optional **`.vscode/`**). |
