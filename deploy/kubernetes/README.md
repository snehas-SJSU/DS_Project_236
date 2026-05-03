# Kubernetes deployment (class rubric: Docker on AWS — EKS)

These manifests are **templates**: replace image URIs with your **ECR** (or registry) URLs after `docker build` and `docker push`.

## Build images (from repo root)

```bash
docker build -t YOUR_ECR/linkedin-core-api:latest ./backend
docker build -t YOUR_ECR/linkedin-ai-service:latest ./services/ai-service
```

Use the **same** core image for API and workers; set `RUN_WORKERS=1` only on the worker `Deployment`.

## Managed dependencies (recommended on AWS)

- **RDS** for MySQL (set `MYSQL_HOST`, `MYSQL_PORT`, secrets for user/password).
- **ElastiCache** for Redis (`REDIS_URL`).
- **DocumentDB** or **Atlas** for Mongo-compatible URL (`MONGO_URL`), or self-managed if allowed.
- **MSK** for Kafka (`KAFKA_BROKERS` = bootstrap brokers).

## Apply

```bash
kubectl apply -f deploy/kubernetes/core-api-deployment.yaml
# Create Secrets for DB passwords and ConfigMaps for non-secret env before going to production.
```

## Local cluster sanity

For a **local** cluster, you still need reachable MySQL, Mongo, Redis, and Kafka. The simplest path for the course is often **docker compose** for data plane + **one** EKS/ECS service demo for the “AWS deploy” checkbox—confirm with your instructor.
