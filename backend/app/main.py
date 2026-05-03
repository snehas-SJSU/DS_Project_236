from __future__ import annotations

import asyncio
import json
import logging
from contextlib import asynccontextmanager

import httpx
from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import Response

from app import db as dbm
from app.config import settings
from app.kafka_bus import stop_producer
from app.mongo_db import close_mongo
from app.redis_client import close_redis
from app.schema_init import init_all_schemas
from app.routers import analytics, applications, connections, jobs, members, messaging, posts

log = logging.getLogger(__name__)


@asynccontextmanager
async def lifespan(app: FastAPI):
    await dbm.get_pool()
    try:
        await init_all_schemas()
    except Exception as e:
        log.warning("schema init (will retry on demand): %s", e)
    yield
    await stop_producer()
    await close_redis()
    await close_mongo()
    await dbm.close_pool()


app = FastAPI(title="LinkedIn Simulation API", lifespan=lifespan)
app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

app.include_router(members.router, prefix="/api")
app.include_router(jobs.router, prefix="/api")
app.include_router(applications.router, prefix="/api")
app.include_router(messaging.router, prefix="/api")
app.include_router(analytics.router, prefix="/api")
app.include_router(connections.router, prefix="/api")
app.include_router(posts.router, prefix="/api")


@app.get("/health")
async def health():
    return {"ok": True}


@app.websocket("/api/ai/ws/{full_path:path}")
async def proxy_ai_ws(websocket: WebSocket, full_path: str):
    await websocket.accept()
    target = settings.ai_service_url.replace("http://", "ws://").replace("https://", "wss://").rstrip("/")
    upstream = f"{target}/ws/{full_path}"
    try:
        import websockets

        async with websockets.connect(upstream) as upstream_ws:
            async def client_to_upstream():
                try:
                    while True:
                        data = await websocket.receive_text()
                        await upstream_ws.send(data)
                except WebSocketDisconnect:
                    pass

            async def upstream_to_client():
                try:
                    async for message in upstream_ws:
                        await websocket.send_text(message)
                except Exception:
                    pass

            await asyncio.wait(
                [asyncio.create_task(client_to_upstream()), asyncio.create_task(upstream_to_client())],
                return_when=asyncio.FIRST_COMPLETED,
            )
    except Exception as e:
        log.warning("ai ws proxy error: %s", e)
        try:
            await websocket.close(code=1011)
        except Exception:
            pass


@app.api_route("/api/ai/{path:path}", methods=["GET", "POST", "PUT", "DELETE", "PATCH", "OPTIONS", "HEAD"])
async def proxy_ai_http(request: Request, path: str):
    base = settings.ai_service_url.rstrip("/")
    url = f"{base}/ai/{path}"
    qp = str(request.query_params)
    if qp:
        url = f"{url}?{qp}"
    body = await request.body()
    headers = {
        k: v
        for k, v in request.headers.items()
        if k.lower() not in ("host", "connection", "content-length", "transfer-encoding")
    }
    try:
        async with httpx.AsyncClient(timeout=120.0) as client:
            r = await client.request(request.method, url, headers=headers, content=body)
    except httpx.RequestError as e:
        return Response(
            content=json.dumps({"error": "AI_PROXY", "message": str(e)}).encode(),
            status_code=502,
            media_type="application/json",
        )
    return Response(content=r.content, status_code=r.status_code, media_type=r.headers.get("content-type"))
