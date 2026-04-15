# LinkedIn Simulation (Data 236)

Distributed LinkedIn-style project with React frontend, API gateway, Node microservices, Kafka workers, MySQL, MongoDB, and Redis.

## Quickstart (new teammate)

From repo root:

```bash
npm run bootstrap
docker compose up -d
npm run start:all
```

In a second terminal:

```bash
cd frontend
npm run dev
```

Optional demo seed (first run / after DB wipe):

```bash
cd ..
npm run seed:member
```

Open:

- App: [http://localhost:3000](http://localhost:3000)
- Swagger: [http://localhost:4000/docs](http://localhost:4000/docs)

## Daily startup

```bash
docker compose up -d
npm run start:all
cd frontend && npm run dev
```

## Core services and ports

- API Gateway: `:4000`
- Member: `:4001`
- Job (+ recruiter admin APIs): `:4002`
- Application: `:4003`
- Messaging: `:4004`
- Analytics: `:4005`
- Connections: `:4006`
- Frontend: `:3000`

## Main non-AI routes

- `/feed`
- `/profile`
- `/jobs`
- `/applications`
- `/messaging`
- `/network`
- `/notifications`
- `/recruiter`
- `/recruiter/admin`

## Smoke test

```bash
chmod +x scripts/smoke-test.sh
./scripts/smoke-test.sh
```

## Troubleshooting

- If profile is missing, run `npm run seed:member`.
- If ports are busy, stop old processes and restart `npm run start:all`.
- If DB auth gets corrupted, run `docker compose down -v`, then bring stack up and reseed.

## Project status

See `PROJECT_STATUS.md` for the single consolidated status update.

