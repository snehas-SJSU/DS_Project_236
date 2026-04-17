# Project Status (Single Source)

Last updated: dynamic in-app realtime-style behavior and UI parity pass.

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
- Frontend runtime hardening: centralized API base URL adaptation via frontend fetch bootstrap (`VITE_API_BASE_URL` support).
- Reliability handling: duplicate email, duplicate application, closed-job apply checks, message retry, Kafka idempotency guards.
- Auth: email/password signup/login/logout implemented with JWT bearer tokens.
- Backend stabilization: job-service schema compatibility migration for legacy MySQL (`industry`, `remote_mode`, `seniority_level`, `employment_type`, counts columns) to keep workers healthy across fresh and old DB states.

## Latest verification snapshot

- Smoke test passes (`scripts/smoke-test.sh`).
- Duplicate signup returns `DUPLICATE_EMAIL`.
- Duplicate apply returns `DUPLICATE_APPLICATION`.
- Apply-to-closed-job returns `JOB_CLOSED`.
- Premium navigation hardened with alias redirects to `/premium` (`/try-premium`, `/premium/free-trial`, `/premium/trial`).
- Manual profile smoke checks passed for `/profile` and `/profile/:memberId` route rendering plus connection-action API behavior.
- Dynamic flow checks passed for profile update persistence, job posting/search visibility, and connect→accept lifecycle validation.

## Pending note (auth)

- Google OAuth is not implemented yet. The `Continue with Google` button is currently UI-only and intentionally pending.

## Runbook

1. `docker compose up -d`
2. `npm run start:all`
3. In another terminal: `cd frontend && npm run dev`
4. Optional seed: `npm run seed:member`

## Final note

Non-AI implementation is complete and demo-ready. Remaining work is the intentionally excluded items (AI, JMeter, AWS), Google OAuth completion, and final submission packaging/screenshots/polish.
