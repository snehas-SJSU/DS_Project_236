# LinkedIn Simulation (Data 236)

Distributed LinkedIn-style project with React frontend, API gateway, Node microservices, Kafka workers, MySQL, MongoDB, and Redis.

---

<!-- ====================== 1.0 PREREQUISITES ====================== -->
## 1.0 Prerequisites

Install these first:

1. Node.js 20+ and npm
2. Docker + Docker Compose
3. Python 3.10+ and pip

---

<!-- ====================== 2.0 FIRST-TIME SETUP ====================== -->
## 2.0 First-Time Setup (New Teammate)

Run from repo root.

### 2.1 Install dependencies

```bash
npm run bootstrap
pip install -r requirements.txt
```

Notes:
1. `npm run bootstrap` installs all Node dependencies for gateway/services/frontend.
2. `requirements.txt` installs Python dependencies used in this repo.

### 2.2 Start infrastructure (DB + broker)

```bash
docker compose up -d
```

Infra services started by this command:
1. Zookeeper (`2181`)
2. Kafka (`9092`)
3. MySQL (`3306`)
4. MongoDB (`27017`)
5. Redis (`6379`)

### 2.3 Start backend services

```bash
npm run start:all
```

### 2.4 Start frontend (second terminal)

```bash
cd frontend
npm run dev
```

### 2.5 Open app and docs

1. App: [http://localhost:3000](http://localhost:3000)
2. Swagger: [http://localhost:4000/docs](http://localhost:4000/docs)

### 2.6 Exact terminal commands (copy/paste)

1. Terminal 1 (repo root) - install + infrastructure + backend:

```bash
cd "/Users/snehasingh/Desktop/LinkedIn Simulation"
npm run bootstrap
pip install -r requirements.txt
docker compose up -d
npm run start:all
```

2. Terminal 2 - frontend:

```bash
cd "/Users/snehasingh/Desktop/LinkedIn Simulation/frontend"
npm run dev
```

3. Terminal 3 (optional) - restart member API if auth/login issues:

```bash
cd "/Users/snehasingh/Desktop/LinkedIn Simulation"
npm run dev:member-api
```

---

<!-- ====================== 3.0 TEAM TEST LOGIN ====================== -->
## 3.0 Team Test Login (No Shared DB Needed)

`member-service` bootstrap auto-creates and/or resets a default admin test account on startup.  
This means each teammate gets the same local test user even with a fresh DB.

1. Email: `admin@test.com`
2. Password: `admin123`

If login fails, restart member API once: or you can signup with new user

```bash
npm run dev:member-api
```

New users can also sign up from `/signup`.

---

<!-- ====================== 4.0 DAILY STARTUP ====================== -->
## 4.0 Daily Startup (After Initial Setup)

```bash
docker compose up -d
npm run start:all
cd frontend && npm run dev
```

---

<!-- ====================== 5.0 AUTH API (JWT) ====================== -->
## 5.0 Auth APIs (JWT)

1. `POST /api/auth/signup`
2. `POST /api/auth/login`
3. `GET /api/auth/me` (requires `Authorization: Bearer <jwt_token>`)
4. `POST /api/auth/logout`

Auth status:
1. Implemented: email/password signup/login/logout with JWT bearer tokens.
2. Pending: real Google OAuth integration (`Continue with Google` is UI-only right now).

---

<!-- ====================== 6.0 SERVICES AND PORTS ====================== -->
## 6.0 Services and Ports

1. API Gateway: `:4000`
2. Member: `:4001`
3. Job (+ recruiter admin APIs): `:4002`
4. Application: `:4003`
5. Messaging: `:4004`
6. Analytics: `:4005`
7. Connections: `:4006`
8. Frontend: `:3000`

---

<!-- ====================== 7.0 MAIN ROUTES ====================== -->
## 7.0 Main Non-AI Routes

1. `/`
2. `/login/email`
3. `/signup`
4. `/feed`
5. `/profile`
6. `/jobs`
7. `/applications`
8. `/messaging`
9. `/network`
10. `/notifications`
11. `/recruiter`
12. `/recruiter/admin`

---

<!-- ====================== 8.0 SMOKE TEST ====================== -->
## 8.0 Smoke Test

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

---

<!-- ====================== 9.0 TROUBLESHOOTING ====================== -->
## 9.0 Troubleshooting

1. If profile is missing, run `npm run seed:member`.
2. If ports are busy, stop old processes and restart `npm run start:all`.
3. If DB state is corrupted, run `docker compose down -v`, then start again.
4. If Swagger is not loading, run `npm run dev:gateway`.
5. If auth endpoints return 404, restart gateway and member API.

---

<!-- ====================== 10.0 PROJECT STATUS ====================== -->
## 10.0 Project Status

See `PROJECT_STATUS.md` for the consolidated status update.

