import json
import uuid
from fastapi import FastAPI, WebSocket, WebSocketDisconnect
from pydantic import BaseModel
from typing import Optional

app = FastAPI(title="LinkedIn AgenticAI Service")

# Kafka optional — install kafka-python; publish when broker available
try:
    from kafka import KafkaProducer
    _producer = None
    def get_producer():
        global _producer
        if _producer is None:
            _producer = KafkaProducer(
                bootstrap_servers=["127.0.0.1:9092"],
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
            )
        return _producer
except Exception:
    get_producer = None


class AIRequest(BaseModel):
    task_type: str
    payload: dict


class ApproveBody(BaseModel):
    decision: str  # approve | edit | reject
    edited_text: Optional[str] = None


TASKS = {}


@app.post("/ai/tasks/submit", status_code=202)
async def submit_task(req: AIRequest):
    task_id = str(uuid.uuid4())
    trace_id = str(uuid.uuid4())
    TASKS[task_id] = {"status": "queued", "trace_id": trace_id, "task_type": req.task_type}
    msg = {
        "event_type": "ai.requested",
        "trace_id": trace_id,
        "task_id": task_id,
        "task_type": req.task_type,
        "payload": req.payload,
    }
    if get_producer:
        try:
            get_producer().send("ai.requests", value=msg)
        except Exception:
            pass
    TASKS[task_id]["status"] = "processing"
    return {"message": "Task accepted", "task_id": task_id, "trace_id": trace_id}


@app.get("/ai/tasks/{task_id}")
async def get_task(task_id: str):
    t = TASKS.get(task_id, {"status": "unknown"})
    return {"task_id": task_id, **t}


@app.post("/ai/resume/parse")
async def resume_parse(body: dict):
    text = body.get("text", "")
    return {
        "skills": ["Python", "Kafka", "React"],
        "years_experience": 3,
        "education": [{"school": "SJSU", "degree": "MS"}],
        "raw_sample": text[:200],
    }


@app.post("/ai/match/score")
async def match_score(body: dict):
    return {"score": 0.85, "member_id": body.get("member_id"), "job_id": body.get("job_id")}


@app.post("/ai/shortlist")
async def shortlist(body: dict):
    job_id = body.get("job_id", "")
    return {"job_id": job_id, "candidates": [{"member_id": "M-1", "score": 0.9}]}


@app.post("/ai/outreach/draft")
async def outreach_draft(body: dict):
    return {"draft": "Hi — your background in distributed systems is a strong fit for this role."}


@app.post("/ai/career-coach/suggest")
async def career_coach(body: dict):
    return {"suggestions": ["Add Kafka throughput metrics to your headline.", "Mention FastAPI on your profile."]}


@app.post("/ai/tasks/{task_id}/approve")
async def approve_task(task_id: str, body: ApproveBody):
    if task_id not in TASKS:
        return {"error": "NOT_FOUND"}
    TASKS[task_id]["approval"] = body.decision
    TASKS[task_id]["status"] = "completed"
    return {"task_id": task_id, "recorded": body.decision}


@app.websocket("/ws/ai/tasks/{task_id}")
async def ws_task(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        await websocket.send_json({"step": 1, "message": "Parsing resumes", "task_id": task_id})
        await websocket.send_json({"step": 2, "message": "Scoring matches", "task_id": task_id})
        await websocket.send_json({"step": "done", "message": "Shortlist ready — awaiting approval", "task_id": task_id})
    except WebSocketDisconnect:
        pass


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/ai/health")
async def ai_health_alias():
    """Same as /health but reachable via gateway /api/ai/health."""
    return {"status": "ok", "service": "linkedin-agentic-ai"}
