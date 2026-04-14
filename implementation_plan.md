# LinkedIn AgenticAI Project Plan

This document outlines a high-level strategy for tackling the **LinkedIn AgenticAI Project**. With 8 team members and a vast distributed architecture, the key to success is establishing a strong foundation, clear service boundaries, and robust local developer environments early on.

## 1. Architectural Strategy & Monorepo Setup

Given the number of services and team members, using a **Monorepo** (e.g., via Turborepo or simple root folders) is highly recommended. It keeps all code in one GitHub repository, making it easier to share Kafka event schemas, common API utilities, and Docker setups.

Suggested directory structure:
```text
/DS_Group-Project
├── /frontend               # Single Frontend Application (Vite/React or Next.js)
├── /services
│   ├── /ai-service         # FastAPI (Member 5)
│   ├── /user-service       # Handles Profiles & Auth (Member 1)
│   ├── /job-service        # Handles Jobs (Member 2)
│   ├── /application-service# Handles Applications (Member 3)
│   ├── /messaging-service  # Handles Messages & Connections (Member 4)
│   └── /analytics-service  # Handles Events & Logging (Member 6)
├── /shared                 # Shared Kafka envelopes, gRPC/OpenAPI specs, utilities
└── docker-compose.yml      # Local dev environment
```

> [!TIP]
> Keep your backend tech stack uniform (e.g., using Node.js/Express, Spring Boot, or Python) for the standard microservices, except for the AI Service, which is strictly requested to be in **FastAPI**.

## 2. Backend Planning & Scaffolding

The backend is built around a **microservices architecture** governed by Kafka. 

### Step 2.1: Infrastructure First (Member 7's early focus)
Before building any service, you need a local environment where everyone can run the databases and message broker.
- Create a `docker-compose.yml` that boots up:
  - **MySQL** (Relational data)
  - **MongoDB** (Logs, agent traces, messages)
  - **Redis** (Caching layer)
  - **Kafka & Zookeeper** (Event streaming)
- Ensure all members can run `docker compose up` locally and connect to these ports on their machine.

### Step 2.2: Shared Event Envelopes
To avoid chaos, establish a common Kafka event format schema immediately (e.g., `event_type, trace_id, timestamp, actor_id, entity, payload`). Place this schema inside the `/shared` folder.

### Step 2.3: API Gateway & Routing
Since you have multiple services, the frontend shouldn't have to connect to 6 different ports. Set up a simple API Gateway (e.g., NGINX, Traefik, or a basic Node routing proxy) locally so that `/api/jobs` routes to the Job Service and `/api/ai` routes to the AI Service.

## 3. Frontend Planning & Scaffolding

For the frontend, we strongly recommend a rich UI framework to make the interactions dynamic and premium. **React.js** (via Vite or Next.js) paired with **TailwindCSS** and **Radix UI/Shadcn** for fast, high-quality component design is standard for this kind of dashboard application.

### Phase 1: Global Setup
- Scaffold the application: `npm create vite@latest frontend -- --template react-ts`
- Implement a router (e.g., React Router) mirroring the main views:
  - `/feed` (Or home/dashboards)
  - `/jobs` (Job search and application flow)
  - `/messages` (Messaging interface)
  - `/profile` (Profile editing)

### Phase 2: Component Library
- Establish reusable components first: Buttons, Inputs, Modals, Cards.
- Set up state management: Since this is an event-heavy app, you might want to use something like **React Query (TanStack Query)**. It makes fetching, caching, and updating asynchronous backend data incredibly easy.

> [!IMPORTANT]
> The AI interactions (Member 5) need real-time WebSocket updates to the frontend for task progress. Ensure your frontend architecture allows for a global WebSocket connection handling `ai.events` and updating UI state dynamically.

## 4. How to Start achieving it: Week 1 & 2 Execution Plan

Here is how you organize the team immediately to prevent blockers:

1. **Member 7 (DevOps)**: Immediately build and merge the `docker-compose.yml` with MySQL, MongoDB, Redis, and Kafka. Provide simple scripts (`init.sql`) to prepopulate schemas.
2. **Member 8 (Testing/Docs)**: Initialize the repository, setup CI/CD (GitHub Actions) to lint/build the code, and document how teammates should clone and run the project.
3. **Frontend Teams (UI Parts of Members 1, 2, 4, 6)**: Start scaffolding the React application, implementing the static visually-rich UI pieces using mock JSON data. Do not wait for the backend APIs.
4. **Backend Teams**: Create the absolute bare-minimum boilerplate for your respective services (Node.js/FastAPI apps with standard Hello-World endpoints). Test connecting to the local Docker databases.
5. **Architectural Meeting**: Agree on the exact JSON payload structures for your Kafka events. 

## Open Questions

- What programming language/framework do you plan to use for the non-AI microservices? (e.g. Node.js, Spring Boot, or more Python?)
- Do you have a preference for the frontend framework? (Next.js vs Vite/React)
- Does the team have experience with Docker, or should I help generate exactly what the Docker Compose file looks like?
