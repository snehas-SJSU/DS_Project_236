from fastapi import FastAPI, BackgroundTasks
from pydantic import BaseModel

app = FastAPI(title="LinkedIn AgenticAI Service")

class AIRequest(BaseModel):
    task_type: str
    payload: dict

@app.post("/ai/tasks/submit", status_code=202)
async def submit_task(req: AIRequest, background_tasks: BackgroundTasks):
    trace_id = "mock-uuid-1234"
    # ToDo: Background task to publish to Kafka ai.requests topic
    return {"message": "Task accepted", "trace_id": trace_id}

@app.get("/health")
async def health_check():
    return {"status": "ok"}
