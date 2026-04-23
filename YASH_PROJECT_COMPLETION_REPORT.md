# Completion report — Yash Shevkar (`YashShevkar30`)

**Repository:** [snehas-SJSU/DS_Project_236](https://github.com/snehas-SJSU/DS_Project_236)  
**This file last verified:** 2026-04-22 (against `git fetch origin` and commit graph)  
**Purpose:** One place for (1) **git-accurate** personal contributions, (2) **what the integrated codebase already completes** (non-AI), (3) **all remote branches** compared to `main`, (4) **remaining work excluding Section 7 / Agentic AI**.

**Scope rule:** Anything under *Agentic AI (PDF §7)* — FastAPI supervisor, `ai.requests` / `ai.results` orchestration, evaluation metrics, AI deliverables — is **listed only** in the “Out of scope” note at the bottom, not in the remaining-work checklist.

---

## 1. How this was verified (reproducible)

Run these locally to confirm branch relationships:

```bash
git fetch origin
git branch -r -v
git log --oneline origin/main..origin/YashShevkar30/project-status
git log --oneline origin/YashShevkar30/project-status..origin/main
git log --oneline origin/ai-integration..origin/main
git log --oneline origin/main..origin/ai-integration
git merge-base origin/main origin/ai-integration
```

---

## 2. All `origin` branches — exact relationship to `origin/main`

| Remote branch | Tip commit (short) | Tip author (from `git log -1`) | vs `origin/main` |
|---------------|-------------------|--------------------------------|-------------------|
| `origin/main` | `d8b199b` | prakharsinghpersonal | Default branch; current integrated line. |
| `origin/prakhar/setup` | `35c5eab` | prakharsinghpersonal | **No commits that are not ancestors of `main`.** `main` adds merge commit `d8b199b` and already includes `35c5eab` (and later work). This branch is **not ahead** of `main`. |
| `origin/ai-integration` | `498e18c` | snehas-SJSU | **Behind `main` by 3 commits.** **Zero** commits on this branch that are not already contained in `main`’s history (`git log main..ai-integration` is empty). Same tree as `ai-feature-backend-orchestration`. |
| `origin/ai-feature-backend-orchestration` | `498e18c` | snehas-SJSU | **Identical tip to `ai-integration`.** Same “behind main, no unique commits” situation. |
| `origin/YashShevkar30/project-status` | `f075b1b` | YashShevkar30 | **Exactly 1 commit ahead of `main`:** documentation on this branch (`PROJECT_STATUS.md` plus this report once pushed). **No code drift** from `main` beyond those files. |

**Accurate conclusion:** There is **no feature work** sitting only on `ai-integration` or `ai-feature-backend-orchestration` that `main` does not already have. Those two branches are **stale snapshots** relative to `main`. Integrating “other branches” for non-AI code does **not** require merging them — `main` already contains the newer work.

---

## 3. What **you** (`YashShevkar30`) have completed in Git (author-level, 100% accurate)

Source: `git log --all --author='YashShevkar30' --format='%h %ci %s'`

| Commit | Date | Summary |
|--------|------|---------|
| `f075b1b` | 2026-04-22 | `docs: add PROJECT_STATUS for YashShevkar30 branch with current snapshot` — adds/updates **`PROJECT_STATUS.md`** (project status + contributor snapshot, aligned with team `README.md`). |

**Repository-wide count (non-merge):** `git shortlog -sne --all --no-merges` shows **1** commit attributed to `YashShevkar30` vs **36** to `snehas-SJSU` and **2** to `prakharsinghpersonal` (approximate team split).

**What this means:** Your **documented** contributions on this branch are the **status / completion documentation** (`PROJECT_STATUS.md` and this report). The **application code** on `main` was authored primarily by other commit identities; do not claim sole credit for the Node/React services in academic submissions unless your team’s contributions page states otherwise.

---

## 4. What the **repository on `main`** already completes (non-AI, team)

This is the **integrated product** state (same as your branch minus your extra doc commits). Evidence is in the paths cited; it reflects the **Class Project** non-AI technical bar, not the optional/excluded deliverables.

### 4.1 Architecture and infrastructure

| Area | Status | Where |
|------|--------|--------|
| 3-tier: React UI → gateway → services | Done | `frontend/`; `api-gateway/index.js` |
| API gateway + Swagger | Done | `api-gateway/index.js`; `api-gateway/swagger.yaml` |
| Docker Compose: Zookeeper, Kafka, MySQL, MongoDB, Redis | Done | `docker-compose.yml` |
| MySQL OLTP | Done | `shared/mysql.js`; services under `services/*-service/` |
| MongoDB events / messages | Done | `shared/mongo.js`; `services/analytics-service/`; `services/messaging-service/` |
| Kafka producers/consumers (core domains) | Done | e.g. `services/member-service/worker.js`, `job-service/worker.js`, `application-service/worker.js`, `messaging-service/worker.js`, `analytics-service/worker.js` |
| Shared Kafka JSON envelope + idempotent analytics ingest | Done | `shared/kafka-envelope.js`; `services/analytics-service/api.js` `POST /events/ingest` |
| Redis SQL cache (member + job paths) | Done | `shared/redis.js`; `services/member-service/api.js`; `services/job-service/api.js` |

### 4.2 PDF §6-style service APIs (behind gateway)

| Service | Port (local) | Key files |
|---------|----------------|-----------|
| Member + auth | 4001 | `services/member-service/api.js` |
| Jobs + recruiters | 4002 | `services/job-service/api.js` |
| Applications | 4003 | `services/application-service/api.js` |
| Messaging | 4004 | `services/messaging-service/api.js` |
| Analytics | 4005 | `services/analytics-service/api.js` |
| Connections | 4006 | `services/connection-service/api.js` (API only; no separate `worker.js` in repo) |
| Posts / feed (extension) | 4007 | `services/post-service/api.js` |

Gateway wiring: `api-gateway/index.js`.

### 4.3 Tier-1 client (PDF §5)

| Area | Status | Where |
|------|--------|--------|
| Major routes (feed, jobs, profile, applications, messaging, network, recruiter, analytics) | Done | `frontend/src/App.tsx` and `frontend/src/pages/*` |

### 4.4 Analytics dashboards (PDF §8)

| Endpoint | Status | Where |
|----------|--------|--------|
| `POST /events/ingest` | Done | `services/analytics-service/api.js` |
| `POST /analytics/jobs/top` | Done | same |
| `POST /analytics/funnel` | Done | same |
| `POST /analytics/geo` | Done | same |
| `POST /analytics/member/dashboard` | Done | same |
| Time series (e.g. saves) | Done | `POST /analytics/jobs/timeseries` in same file |

### 4.5 Required failure modes (PDF “Exceptions/Failure Modes”)

| Case | Status | Where |
|------|--------|--------|
| Duplicate email | Done | `services/member-service/api.js` → `DUPLICATE_EMAIL` |
| Duplicate application | Done | `services/application-service/api.js` → `DUPLICATE_APPLICATION` |
| Apply to closed job | Done | `application-service/api.js` → `JOB_CLOSED` |
| Idempotent / deduped event processing | Done | `shared/idempotency.js` + analytics ingest |

### 4.6 Verification already in repo

| Artifact | Role |
|----------|------|
| `scripts/smoke-test.sh` | Integration smoke against `http://localhost:4000/api` |
| `README.md` | Runbook, ports, startup commands |
| `NON_AI_COMPLETION_REPORT.pdf` | **Referenced in `PROJECT_STATUS.md`** as a team non-AI checklist. This clone of the repo had **no `*.pdf` files** in-tree at report time; confirm whether your team stores that PDF in Git, Canvas, or drive and keep the reference accurate. |

---

## 5. Remaining work (**non-AI only**) — to fully close the course PDF (excluding §7)

Use this as a **student checklist**; items are *not* duplicate code on other branches as of 2026-04-22.

### 5.1 Performance and scalability evidence (PDF §11 + presentation)

| Task | Why it is “remaining” |
|------|------------------------|
| Run **JMeter** (or equivalent) and produce **four-bar** comparisons: **B**, **B+S**, **B+S+K**, **B+S+K+other** at **100 concurrent** users | No `*.jmx` / results bundle checked into this repo. |
| Seed **≥ 10,000** records and **measure** as required | Seeds/scripts in repo are demo-scale unless you add a dedicated bulk load + evidence. |
| **Write-up** of detection rules, cache policy, and messaging flow supporting scalability | Grading deliverable; not replaceable by code alone. |

### 5.2 Deployment (PDF grading: distributed on AWS / Docker to AWS)

| Task | Why it is “remaining” |
|------|------------------------|
| Deploy to **AWS** (ECS/Kubernetes per PDF) and document | No `terraform/`, `k8s/`, or AWS manifests in this repository; `docker-compose.yml` is local dev infra. |

### 5.3 Datasets (PDF §9)

| Task | Why it is “remaining” |
|------|------------------------|
| **Cite** the chosen Kaggle (or other) **jobs** + **resume** datasets in the **final write-up** and show they flow through your **pipeline** | Spec links also appear in `shared/class_project_bible.txt`; **loader + report evidence** is a submission item, not fully reflected as automated ingest in the codebase audit. |

### 5.4 Process / course submission (PDF §12 + presentation)

| Task | Notes |
|------|--------|
| Title page, **per-member contributions**, 5-page technical write-up (object policy, heavyweight resources, DB write + cache invalidation) | **Out-of-repo** deliverables. |
| Screenshots (client + schema), test output, lessons learned | **Out-of-repo**. |
| **Presentation** slides: architecture, **non-AI** performance graphs, DB schema | **Out-of-repo**; must match measured runs. |
| **Peer review** (Canvas) | **Out-of-repo**. |

### 5.5 Optional / product gaps (not always PDF-hard-requirements)

| Item | Status |
|------|--------|
| **Google OAuth** | UI-level; not implemented as real OAuth in `PROJECT_STATUS.md`. |
| **CI (GitHub Actions)** | No `.github/workflows/` — XP recommends; treat as team process gap if needed. |
| **Connection service Kafka worker** | `connection-service` has **no** `worker.js`; events are produced from API, but there is no dedicated consumer in that folder (differs from member/job/app pattern). Hardening optional unless course requires strict symmetry. |

---

## 6. Explicitly out of scope for “remaining tasks” in this file (AI / §7)

Per your request, the following are **not** expanded as checklist items here:

- `ai.requests` / `ai.results` **full** supervisor loop, **persistent** task store, **ai.results** publication chain, HITL metrics, AI evaluation report, AI workflow diagram package, etc.  
- See **`PROJECT_STATUS.md` → “Pending note (AI section)”** and `services/ai-service/main.py` for the current **baseline** FastAPI + gateway proxy state.

---

## 7. Suggested next Git steps (for you)

1. Open a **PR** from `YashShevkar30/project-status` → `main` if the team wants `PROJECT_STATUS.md` and this report on the default branch.  
2. For course submission, attach **JMeter output**, **AWS** screenshots/config, and the **write-up** as your instructor requires — they will not appear until you generate them.

---

*This file was generated to be consistent with the git history and file tree; if `main` moves forward, re-run the `git log` / `git diff` commands in §1 to refresh.*
