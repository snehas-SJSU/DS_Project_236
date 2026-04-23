import json
import os
from pathlib import Path
from typing import Any, Dict, Optional
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass

from fastapi import FastAPI
from fastapi.responses import JSONResponse
from pydantic import BaseModel

app = FastAPI(title="LinkedIn AI Skills Service")


def _ai_service_base_url() -> str:
    return (os.getenv("AI_SERVICE_BASE_URL", "http://127.0.0.1:8001/ai") or "http://127.0.0.1:8001/ai").strip().rstrip("/")


def _post_json(path: str, payload: Dict[str, Any], timeout_seconds: float = 25.0) -> Optional[Dict[str, Any]]:
    target = f"{_ai_service_base_url()}{path if path.startswith('/') else f'/{path}'}"
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(
        target,
        data=body,
        headers={"Content-Type": "application/json", "User-Agent": "LinkedInAISkillsService/1.0"},
        method="POST",
    )
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
            raw = response.read().decode("utf-8")
            parsed = json.loads(raw)
            return parsed if isinstance(parsed, dict) else None
    except (urlerror.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _proxy_skill(path: str, payload: Dict[str, Any]) -> Dict[str, Any]:
    response = _post_json(path, payload)
    if response is None:
        return {
            "error_code": "SKILL_SERVICE_UNAVAILABLE",
            "message": f"Proxy skill call failed for {path}",
            "upstream": _ai_service_base_url(),
        }
    return response


class ResumeParseBody(BaseModel):
    member_id: Optional[str] = None
    text: Optional[str] = None


class MatchScoreBody(BaseModel):
    job_id: str
    member_id: Optional[str] = None
    parsed_profile: Dict[str, Any]


class ShortlistBody(BaseModel):
    job_id: str
    scores: list
    top_k: Optional[int] = 3


class OutreachDraftBody(BaseModel):
    job_id: str
    shortlist: list
    actor_id: Optional[str] = None


@app.post("/resume/parse")
async def resume_parse(body: ResumeParseBody):
    out = _proxy_skill("/resume/parse", body.model_dump())
    if out.get("error_code"):
        return JSONResponse(status_code=503, content=out)
    return out


@app.post("/match/score")
async def match_score(body: MatchScoreBody):
    out = _proxy_skill("/match/score", body.model_dump())
    if out.get("error_code"):
        return JSONResponse(status_code=503, content=out)
    return out


@app.post("/shortlist")
async def shortlist(body: ShortlistBody):
    out = _proxy_skill("/shortlist", body.model_dump())
    if out.get("error_code"):
        return JSONResponse(status_code=503, content=out)
    return out


@app.post("/outreach/draft")
async def outreach_draft(body: OutreachDraftBody):
    out = _proxy_skill("/outreach/draft", body.model_dump())
    if out.get("error_code"):
        return JSONResponse(status_code=503, content=out)
    return out


@app.post("/career-coach/suggest")
async def career_coach(body: dict):
    if not isinstance(body, dict):
        body = {}
    out = _proxy_skill("/career-coach/suggest", body)
    if out.get("error_code"):
        return JSONResponse(status_code=503, content=out)
    return out


@app.get("/health")
async def health():
    return {"status": "ok", "service": "ai-skills-service", "ai_service_base_url": _ai_service_base_url()}

