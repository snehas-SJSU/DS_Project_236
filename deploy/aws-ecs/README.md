# AWS ECS (Fargate) — rubric path: “Docker into AWS”

This repo ships **Dockerfiles** for:

- `backend/` → FastAPI core API (port 4000) or workers (`RUN_WORKERS=1` in task definition).
- `services/ai-service/` → Agentic AI (port 8001).

## High-level steps

1. **Create ECR repositories**  
   e.g. `linkedin-core-api`, `linkedin-ai-service`.

2. **Build and push** (from repo root, after `aws ecr get-login-password`):

   ```bash
   docker build -t linkedin-core-api ./backend
   docker tag linkedin-core-api:latest YOUR_ACCOUNT.dkr.ecr.REGION.amazonaws.com/linkedin-core-api:latest
   docker push YOUR_ACCOUNT.dkr.ecr.REGION.amazonaws.com/linkedin-core-api:latest

   docker build -t linkedin-ai-service ./services/ai-service
   docker tag linkedin-ai-service:latest YOUR_ACCOUNT.dkr.ecr.REGION.amazonaws.com/linkedin-ai-service:latest
   docker push YOUR_ACCOUNT.dkr.ecr.REGION.amazonaws.com/linkedin-ai-service:latest
   ```

3. **Data plane** (typical student/production pattern)  
   Use **RDS** (MySQL), **ElastiCache** (Redis), **DocumentDB or MongoDB Atlas**, **MSK** (Kafka). Put endpoints in **ECS task environment** or **Secrets Manager**.

4. **ECS services**  
   - Service **core-api**: container port 4000, ALB if you need public HTTP.  
   - Service **core-workers**: same image, override command/env with `RUN_WORKERS=1` (see `backend/entrypoint.sh`).  
   - Service **ai-service**: port 8001; set `AI_*_API_URL` to the **public or internal** URL of core-api `/api/...` routes.

5. **Frontend**  
   Host on S3+CloudFront, **or** run Vite preview behind nginx in a small task; set `VITE_API_BASE_URL` to the ALB URL for the API.

## Networking

Tasks must reach **Kafka brokers** and databases on ports allowed by **security groups**. For MSK, use the cluster’s **bootstrap servers** string as `KAFKA_BROKERS`.

## Course tip

If full AWS data plane is out of scope, clarify with the instructor whether **ECS tasks + managed RDS + MSK** is enough, or whether **local docker compose + one ECS service screenshot** satisfies the “AWS deploy” evidence.
