import json
import logging
import math
import os
import re
import threading
import time
import uuid
import asyncio
import hashlib
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Literal, Optional, Tuple
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    from dotenv import load_dotenv

    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass

from fastapi import FastAPI, Request, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field, model_validator


class LiveDataRequiredError(Exception):
    """Raised when AI_REQUIRE_LIVE_DATA is enabled but Member/Job APIs return no usable record."""


def _require_live_platform_data() -> bool:
    return os.getenv("AI_REQUIRE_LIVE_DATA", "").strip().lower() in {"1", "true", "yes", "on"}


app = FastAPI(title="LinkedIn AgenticAI Service")


@app.exception_handler(LiveDataRequiredError)
async def _live_data_required_handler(_request: Request, exc: LiveDataRequiredError):
    return JSONResponse(
        status_code=503,
        content={
            "error_code": "LIVE_DATA_REQUIRED",
            "message": str(exc) or "Member or Job platform API did not return usable data.",
        },
    )


try:
    from kafka import KafkaConsumer, KafkaProducer
    _producer = None

    def get_producer():
        global _producer
        if _producer is None:
            _producer = KafkaProducer(
                bootstrap_servers=["127.0.0.1:9092"],
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                acks="all",
                retries=3,
            )
        return _producer
except Exception:
    KafkaConsumer = None
    get_producer = None

try:
    from pymongo import MongoClient
    _mongo_client = None
    _mongo_collection = None
    _mongo_event_collection = None
except Exception:
    MongoClient = None
    _mongo_client = None
    _mongo_collection = None
    _mongo_event_collection = None

try:
    from redis import Redis
    _redis_client = None
except Exception:
    Redis = None
    _redis_client = None


TASK_TYPE_CANDIDATE_SHORTLIST = "candidate_shortlist"
VALID_DECISIONS = {"approve", "edit", "reject"}
VALID_STATES = {
    "queued",
    "processing",
    "shortlist_ready",
    "awaiting_approval",
    "approved",
    "completed",
    "failed",
    "rejected",
}
# Ranking only; outreach runs after POST /ai/tasks/{id}/outreach/generate (recruiter-selected candidates).
STEP_SEQUENCE = ["resume_parse", "match_score", "shortlist"]
_consumer_thread: Optional[threading.Thread] = None
_consumer_running = False
FAILED_TOPIC = "ai.failed.events"
SEND_REQUESTED_EVENT = "ai.send.requested"
TASK_EVENT_COLLECTION_DEFAULT = "ai_task_events"

logger = logging.getLogger("ai-service")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

DEFAULT_CANDIDATE_PROFILES = {
    "M-101": {
        "member_id": "M-101",
        "resume_text": "Python engineer with 5 years distributed systems, Kafka, FastAPI, Redis, Docker.",
        "location": "San Jose",
        "seniority": "mid",
    },
    "M-202": {
        "member_id": "M-202",
        "resume_text": "Backend developer 3 years experience with Java, Spring, MySQL, and some Kafka.",
        "location": "San Francisco",
        "seniority": "junior",
    },
    "M-303": {
        "member_id": "M-303",
        "resume_text": "Full-stack engineer 7 years with React, Node.js, Python APIs, cloud deployment.",
        "location": "San Jose",
        "seniority": "senior",
    },
}

DEFAULT_JOB_PROFILES = {
    "J-LIVE-1": {
        "job_id": "J-LIVE-1",
        "title": "Platform Engineer",
        "required_skills": ["python", "kafka", "fastapi", "redis"],
        "location": "San Jose",
        "seniority": "mid",
    }
}
_profile_data_cache: Optional[Dict[str, Dict[str, Any]]] = None
_job_data_cache: Optional[Dict[str, Dict[str, Any]]] = None
_embedding_cache_local: Dict[str, Dict[str, Any]] = {}


def _now_iso() -> str:
    return datetime.now(timezone.utc).isoformat()


def _parse_dt(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _error_response(status_code: int, error_code: str, message: str, trace_id: str = "", details: Optional[dict] = None):
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": error_code,
            "message": message,
            "details": details or {},
            "trace_id": trace_id,
        },
    )


def _kafka_idempotency_key(task_id: str, topic: str, event_type: str, payload: Dict[str, Any]) -> str:
    canonical = json.dumps(
        {"task_id": task_id, "topic": topic, "event_type": event_type, "payload": payload},
        sort_keys=True,
        default=str,
    )
    return hashlib.sha256(canonical.encode("utf-8")).hexdigest()


def _publish_event(topic: str, event_type: str, task: Dict[str, Any], payload: Dict[str, Any]):
    if not get_producer:
        _append_task_event(task, event_type, payload, topic=topic, source="no_kafka_producer")
        return
    try:
        idem = _kafka_idempotency_key(task["task_id"], topic, event_type, payload)
        message = {
            "event_type": event_type,
            "trace_id": task["trace_id"],
            "timestamp": _now_iso(),
            "actor_id": task["actor_id"],
            "entity": {"entity_type": "ai_task", "entity_id": task["task_id"]},
            "payload": payload,
            "idempotency_key": idem,
        }
        _append_task_event(task, event_type, payload, topic=topic, source="ai_service")
        get_producer().send(topic, value=message)
    except Exception:
        _append_task_event(task, event_type, payload, topic=topic, source="publish_failed")
        # Keep service available if Kafka is unreachable.
        pass


def _publish_failed_envelope(task: Dict[str, Any], reason: str):
    _publish_event(
        FAILED_TOPIC,
        "ai.failed",
        task,
        {"task_type": task.get("task_type"), "step": task.get("current_step"), "data": {"reason": reason}},
    )


def _get_redis_client():
    global _redis_client
    if Redis is None:
        return None
    if _redis_client is not None:
        return _redis_client
    redis_url = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")
    try:
        _redis_client = Redis.from_url(redis_url, socket_connect_timeout=1, socket_timeout=1)
        _redis_client.ping()
    except Exception:
        _redis_client = None
    return _redis_client


def _mark_step_once(task_id: str, step_name: str, ttl_seconds: int = 86400) -> bool:
    client = _get_redis_client()
    if client is None:
        return True
    key = f"ai:step:{task_id}:{step_name}:started"
    try:
        created = client.set(name=key, value="1", nx=True, ex=ttl_seconds)
        return bool(created)
    except Exception:
        return True


def _log_model_mode():
    groq_ready = bool(_groq_api_key())
    gemini_ready = bool(os.getenv("GEMINI_API_KEY"))
    openai_ready = bool(os.getenv("OPENAI_API_KEY"))
    embedding_provider = _embedding_provider()
    if groq_ready or gemini_ready or openai_ready:
        logger.info(
            "Model mode enabled. groq_chat=%s groq_model=%s gemini=%s openai=%s embedding_provider=%s",
            groq_ready,
            _groq_chat_model() if groq_ready else "",
            gemini_ready,
            openai_ready,
            embedding_provider,
        )
    else:
        logger.warning("No model keys found. Running in deterministic fallback mode.")


def _shortlist_hitl_required() -> bool:
    return os.getenv("AI_SHORTLIST_HITL_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}


def _send_topic_name() -> str:
    return os.getenv("AI_SEND_TOPIC", "outreach.requests")


def _skills_base_url() -> str:
    return (os.getenv("AI_SKILLS_BASE_URL", "") or "").strip().rstrip("/")


def _load_json_map(path_env_key: str, fallback: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    path = os.getenv(path_env_key, "").strip()
    if not path:
        return dict(fallback)
    try:
        with Path(path).open("r", encoding="utf-8") as file:
            data = json.load(file)
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return dict(fallback)


def _get_candidate_profiles() -> Dict[str, Dict[str, Any]]:
    global _profile_data_cache
    if _profile_data_cache is None:
        _profile_data_cache = _load_json_map("AI_CANDIDATE_PROFILES_PATH", DEFAULT_CANDIDATE_PROFILES)
    return _profile_data_cache


def _get_job_profiles() -> Dict[str, Dict[str, Any]]:
    global _job_data_cache
    if _job_data_cache is None:
        _job_data_cache = _load_json_map("AI_JOB_PROFILES_PATH", DEFAULT_JOB_PROFILES)
    return _job_data_cache


def _member_api_url() -> str:
    return os.getenv("AI_MEMBER_API_URL", "http://127.0.0.1:4000/api/members/get")


def _job_api_url() -> str:
    return os.getenv("AI_JOB_API_URL", "http://127.0.0.1:4000/api/jobs/get")


def _applications_by_job_url() -> str:
    return os.getenv("AI_APPLICATIONS_BY_JOB_URL", "http://127.0.0.1:4000/api/applications/byJob")


def _members_search_url() -> str:
    return os.getenv("AI_MEMBERS_SEARCH_URL", "http://127.0.0.1:4000/api/members/search")


def _members_search_max() -> int:
    raw = (os.getenv("AI_MEMBERS_SEARCH_MAX", "40") or "40").strip()
    try:
        n = int(raw)
        return max(1, min(100, n))
    except ValueError:
        return 40


def _shortlist_top_k() -> int:
    raw = (os.getenv("AI_SHORTLIST_TOP_K", "5") or "5").strip()
    try:
        n = int(raw)
        return max(1, min(50, n))
    except ValueError:
        return 5


def _outbound_request_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    """Groq/Cloudflare often block Python-urllib’s default User-Agent; set a real-looking UA."""
    user_agent = (os.getenv("AI_HTTP_USER_AGENT") or "LinkedInAgenticAI/1.0 (Python)").strip()
    base: Dict[str, str] = {"User-Agent": user_agent}
    if extra:
        base.update(extra)
    return base


def _post_json(url: str, payload: Dict[str, Any], timeout_seconds: float = 2.0) -> Optional[Dict[str, Any]]:
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=_outbound_request_headers({"Content-Type": "application/json"}), method="POST")
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
            data = response.read().decode("utf-8")
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                return parsed
            return None
    except (urlerror.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _post_json_value(url: str, payload: Dict[str, Any], timeout_seconds: float = 5.0) -> Any:
    """POST JSON; return parsed dict or list, or None on failure."""
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=_outbound_request_headers({"Content-Type": "application/json"}), method="POST")
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
            data = response.read().decode("utf-8")
            parsed = json.loads(data)
            if isinstance(parsed, (dict, list)):
                return parsed
            return None
    except (urlerror.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _post_json_with_headers(
    url: str,
    payload: Dict[str, Any],
    headers: Optional[Dict[str, str]] = None,
    timeout_seconds: float = 6.0,
) -> Optional[Dict[str, Any]]:
    request_headers = _outbound_request_headers({"Content-Type": "application/json"})
    if headers:
        request_headers.update(headers)
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=request_headers, method="POST")
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
            data = response.read().decode("utf-8")
            parsed = json.loads(data)
            if isinstance(parsed, dict):
                return parsed
            return None
    except (urlerror.URLError, TimeoutError, ValueError, json.JSONDecodeError):
        return None


def _groq_api_key() -> str:
    return (os.getenv("GROQ_API_KEY", "") or "").strip()


def _groq_chat_model() -> str:
    return (os.getenv("AI_GROQ_MODEL", "llama-3.1-8b-instant") or "llama-3.1-8b-instant").strip()


def _groq_chat(
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    json_object: bool = False,
    timeout_seconds: float = 45.0,
) -> Optional[str]:
    """Groq OpenAI-compatible chat completion; returns assistant message content or None."""
    api_key = _groq_api_key()
    if not api_key:
        return None
    payload: Dict[str, Any] = {
        "model": _groq_chat_model(),
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}
    response = _post_json_with_headers(
        "https://api.groq.com/openai/v1/chat/completions",
        payload,
        headers={"Authorization": f"Bearer {api_key}"},
        timeout_seconds=timeout_seconds,
    )
    if not response:
        return None
    choices = response.get("choices")
    if not isinstance(choices, list) or not choices:
        return None
    first = choices[0]
    if not isinstance(first, dict):
        return None
    message = first.get("message")
    if not isinstance(message, dict):
        return None
    content = message.get("content")
    return content if isinstance(content, str) else None


def _parse_llm_json_object(text: str) -> Optional[Dict[str, Any]]:
    if not text or not isinstance(text, str):
        return None
    cleaned = text.strip()
    if cleaned.startswith("```"):
        lines = cleaned.split("\n")
        if len(lines) >= 2 and lines[0].startswith("```"):
            cleaned = "\n".join(lines[1:])
        if cleaned.endswith("```"):
            cleaned = cleaned[: cleaned.rfind("```")].rstrip()
    try:
        parsed = json.loads(cleaned)
        return parsed if isinstance(parsed, dict) else None
    except json.JSONDecodeError:
        return None


def _embedding_provider() -> str:
    provider = (os.getenv("AI_EMBEDDING_PROVIDER", "hashed") or "hashed").strip().lower()
    if provider in {"openai", "gemini", "local", "hashed", "none"}:
        return provider
    return "hashed"


def _embedding_cache_ttl_seconds() -> int:
    raw = (os.getenv("AI_EMBEDDING_CACHE_TTL_SECONDS", "3600") or "3600").strip()
    try:
        ttl = int(raw)
        return max(30, ttl)
    except ValueError:
        return 3600


def _embedding_cache_key(provider: str, model: str, text: str) -> str:
    digest = hashlib.sha256((text or "").encode("utf-8")).hexdigest()
    return f"ai:embedding:{provider}:{model}:{digest}"


def _read_embedding_cache(cache_key: str) -> Optional[List[float]]:
    now = time.time()
    local_entry = _embedding_cache_local.get(cache_key)
    if local_entry and local_entry.get("expires_at", 0) > now:
        vector = local_entry.get("vector")
        if isinstance(vector, list):
            return [float(x) for x in vector]

    client = _get_redis_client()
    if client is None:
        return None
    try:
        raw = client.get(cache_key)
        if raw is None:
            return None
        if isinstance(raw, bytes):
            raw = raw.decode("utf-8")
        parsed = json.loads(raw)
        vector = parsed.get("vector") if isinstance(parsed, dict) else None
        if isinstance(vector, list):
            _embedding_cache_local[cache_key] = {"vector": vector, "expires_at": now + _embedding_cache_ttl_seconds()}
            return [float(x) for x in vector]
    except Exception:
        return None
    return None


def _write_embedding_cache(cache_key: str, vector: List[float]):
    ttl = _embedding_cache_ttl_seconds()
    now = time.time()
    _embedding_cache_local[cache_key] = {"vector": list(vector), "expires_at": now + ttl}
    client = _get_redis_client()
    if client is None:
        return
    try:
        client.set(cache_key, json.dumps({"vector": vector}), ex=ttl)
    except Exception:
        pass


def _infer_seniority_from_text(text: str, years: int) -> str:
    lowered = (text or "").lower()
    if "senior" in lowered or years >= 6:
        return "senior"
    if "junior" in lowered or years <= 2:
        return "junior"
    return "mid"


def _load_member_profile(member_id: str) -> Dict[str, Any]:
    profile = _post_json(_member_api_url(), {"member_id": member_id})
    if not profile:
        return {}
    resume_text = (
        profile.get("resume_text")
        or profile.get("about")
        or profile.get("summary")
        or ""
    )
    location = profile.get("location") or ", ".join(
        part for part in [profile.get("city"), profile.get("state"), profile.get("country")] if part
    )
    seniority = _infer_seniority_from_text(
        f"{profile.get('title', '')} {profile.get('headline', '')}",
        _extract_years_experience(resume_text),
    )
    full_name = (
        profile.get("name")
        or " ".join(part for part in [profile.get("first_name"), profile.get("last_name")] if part).strip()
    )
    return {
        "member_id": profile.get("member_id") or member_id,
        "resume_text": resume_text,
        "location": location or "Unknown",
        "seniority": seniority,
        "skills": profile.get("skills") if isinstance(profile.get("skills"), list) else [],
        "title": profile.get("title") or "",
        "headline": profile.get("headline") or "",
        "name": full_name or "",
    }


def _load_job_profile(job_id: str) -> Dict[str, Any]:
    job = _post_json(_job_api_url(), {"job_id": job_id})
    if not job:
        return {}
    skills = job.get("skills") or job.get("skills_required") or []
    if not isinstance(skills, list):
        skills = []
    return {
        "job_id": job.get("job_id") or job_id,
        "title": job.get("title") or "Software Engineer",
        "required_skills": skills,
        "location": job.get("location") or "Unknown",
        "seniority": (job.get("seniority_level") or "mid").lower(),
    }


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9\+\#\.]+", (text or "").lower())


def _extract_years_experience(text: str) -> int:
    matches = re.findall(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", (text or "").lower())
    if not matches:
        return 0
    return max(int(value) for value in matches)


def _hashed_embedding(text: str, dims: int = 128) -> List[float]:
    vec = [0.0] * dims
    for token in _tokenize(text):
        index = hash(token) % dims
        vec[index] += 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def _normalize_vector(vec: List[float]) -> List[float]:
    if not vec:
        return []
    converted = [float(x) for x in vec]
    norm = math.sqrt(sum(x * x for x in converted))
    if norm == 0:
        return converted
    return [x / norm for x in converted]


def _embedding_weight() -> float:
    raw = (os.getenv("AI_EMBEDDING_WEIGHT", "0.7") or "0.7").strip()
    try:
        value = float(raw)
    except ValueError:
        value = 0.7
    return max(0.0, min(1.0, value))


def _openai_embedding_model() -> str:
    return os.getenv("AI_OPENAI_EMBEDDING_MODEL", "text-embedding-3-small")


def _gemini_embedding_model() -> str:
    return os.getenv("AI_GEMINI_EMBEDDING_MODEL", "text-embedding-004")


def _openai_embedding(text: str) -> Optional[List[float]]:
    api_key = os.getenv("OPENAI_API_KEY", "").strip()
    if not api_key:
        return None
    response = _post_json_with_headers(
        "https://api.openai.com/v1/embeddings",
        {"input": text, "model": _openai_embedding_model()},
        headers={"Authorization": f"Bearer {api_key}"},
        timeout_seconds=8.0,
    )
    if not response:
        return None
    data = response.get("data")
    if not isinstance(data, list) or not data:
        return None
    first = data[0]
    if not isinstance(first, dict):
        return None
    vector = first.get("embedding")
    if not isinstance(vector, list):
        return None
    return _normalize_vector(vector)


def _gemini_embedding(text: str) -> Optional[List[float]]:
    api_key = os.getenv("GEMINI_API_KEY", "").strip()
    if not api_key:
        return None
    model = _gemini_embedding_model()
    url = f"https://generativelanguage.googleapis.com/v1beta/models/{model}:embedContent?key={api_key}"
    response = _post_json_with_headers(
        url,
        {"content": {"parts": [{"text": text}]}},
        timeout_seconds=8.0,
    )
    if not response:
        return None
    embedding = response.get("embedding")
    if not isinstance(embedding, dict):
        return None
    vector = embedding.get("values")
    if not isinstance(vector, list):
        return None
    return _normalize_vector(vector)


def _semantic_embedding(text: str) -> Dict[str, Any]:
    input_text = (text or "").strip()
    if not input_text:
        return {"vector": _hashed_embedding(""), "provider": "hashed", "model": "hash-v1", "source": "empty"}

    provider = _embedding_provider()
    if provider in {"none", "hashed", "local"}:
        return {"vector": _hashed_embedding(input_text), "provider": "hashed", "model": "hash-v1", "source": "local"}

    model = _openai_embedding_model() if provider == "openai" else _gemini_embedding_model()
    cache_key = _embedding_cache_key(provider, model, input_text)
    cached = _read_embedding_cache(cache_key)
    if cached:
        return {"vector": cached, "provider": provider, "model": model, "source": "cache"}

    vector = _openai_embedding(input_text) if provider == "openai" else _gemini_embedding(input_text)
    if vector:
        _write_embedding_cache(cache_key, vector)
        return {"vector": vector, "provider": provider, "model": model, "source": "provider"}

    return {"vector": _hashed_embedding(input_text), "provider": "hashed", "model": "hash-v1", "source": "fallback"}


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    return max(0.0, min(1.0, sum(a * b for a, b in zip(vec_a, vec_b))))


def _normalize_skill(skill: str) -> str:
    return (skill or "").strip().lower()


def _public_step_status(status: Optional[str]) -> str:
    if status == "processing":
        return "running"
    return status or "pending"


def _task_error_string(error_value: Any) -> Optional[str]:
    if error_value is None:
        return None
    if isinstance(error_value, str):
        return error_value
    if isinstance(error_value, dict):
        return error_value.get("reason") or error_value.get("message") or str(error_value)
    return str(error_value)


def _outreach_by_candidate_map(result: Dict[str, Any], send_ids: List[str]) -> Dict[str, str]:
    """Map member_id -> message text for Kafka/worker; uses per-candidate drafts when present."""
    by_mid: Dict[str, str] = {}
    drafts = result.get("outreach_drafts") if isinstance(result.get("outreach_drafts"), list) else []
    for d in drafts:
        if isinstance(d, dict) and d.get("member_id"):
            by_mid[str(d["member_id"])] = str(d.get("text") or "")
    single = (result.get("outreach_draft") or "").strip()
    out: Dict[str, str] = {}
    for cid in send_ids:
        cid = str(cid).strip()
        if not cid:
            continue
        if cid in by_mid and by_mid[cid].strip():
            out[cid] = by_mid[cid]
        elif single:
            out[cid] = single
        else:
            out[cid] = ""
    return out


def _public_shortlist_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    total_skills = len(candidate.get("matched_skills", [])) + len(candidate.get("missing_skills", []))
    skills_overlap = (
        round(len(candidate.get("matched_skills", [])) / total_skills, 4) if total_skills else candidate.get("skills_overlap", 0.0)
    )
    out = dict(candidate)
    out["candidate_id"] = candidate.get("candidate_id") or candidate.get("member_id")
    out["match_score"] = candidate.get("match_score", candidate.get("score"))
    out["skills_overlap"] = candidate.get("skills_overlap", skills_overlap)
    out["skills_matched"] = candidate.get("skills_matched", candidate.get("matched_skills", []))
    out.setdefault("name", out.get("candidate_id"))
    out.setdefault("headline", "Candidate")
    out.setdefault("rationale", "Ranked by hybrid embedding and rule score.")
    return out


def _public_task(task: Dict[str, Any], compact: bool = False) -> Dict[str, Any]:
    out = dict(task)
    steps = []
    for step in task.get("steps", []):
        step_out = dict(step)
        step_out["status"] = _public_step_status(step.get("status"))
        steps.append(step_out)
    out["steps"] = steps

    result = task.get("result")
    if isinstance(result, dict):
        result_out = dict(result)
        shortlist = result_out.get("shortlist")
        if isinstance(shortlist, list):
            result_out["shortlist"] = [_public_shortlist_candidate(c) if isinstance(c, dict) else c for c in shortlist]
        out["result"] = result_out
    if isinstance(out.get("approval"), dict):
        approval = dict(out["approval"])
        if "original_text" not in approval or approval.get("original_text") is None:
            if approval.get("target") == "outreach_draft":
                res = out.get("result") or {}
                ods = res.get("outreach_drafts")
                if isinstance(ods, list) and ods:
                    approval["original_text"] = json.dumps(ods)
                else:
                    approval["original_text"] = res.get("outreach_draft")
        out["approval"] = approval

    out["error_details"] = task.get("error")
    out["error"] = _task_error_string(task.get("error"))

    if compact:
        return {
            "task_id": out.get("task_id"),
            "trace_id": out.get("trace_id"),
            "task_type": out.get("task_type"),
            "state": out.get("state"),
            "job_id": out.get("job_id"),
            "candidate_ids": out.get("candidate_ids", []),
            "candidate_source": out.get("candidate_source", "explicit"),
            "created_at": out.get("created_at"),
            "updated_at": out.get("updated_at"),
        }
    return out


def _resume_parse_heuristic(resume_text: str, profile: Dict[str, Any], member_id: str) -> Dict[str, Any]:
    tokens = set(_tokenize(resume_text))
    skill_catalog = {
        "python",
        "kafka",
        "fastapi",
        "redis",
        "docker",
        "react",
        "java",
        "spring",
        "mysql",
        "node.js",
    }
    skills = sorted(skill for skill in skill_catalog if skill in tokens)
    profile_skills = profile.get("skills") if isinstance(profile.get("skills"), list) else []
    if profile_skills:
        merged = set(skills)
        for raw in profile_skills:
            norm = _normalize_skill(raw)
            if norm:
                merged.add(norm)
        skills = sorted(merged)
    years = _extract_years_experience(resume_text)
    seniority = profile.get("seniority") or _infer_seniority_from_text(
        f"{profile.get('title', '')} {profile.get('headline', '')}",
        years,
    )
    return {
        "member_id": member_id or profile.get("member_id"),
        "skills": skills,
        "years_experience": years,
        "education": [{"school": "Unknown", "degree": "Unknown"}],
        "location": profile.get("location"),
        "seniority": seniority,
        "name": profile.get("name") or "",
        "headline": profile.get("headline") or profile.get("title") or "",
        "resume_text": resume_text,
        "raw_sample": resume_text[:200],
    }


def _resume_parse_groq(resume_text: str) -> Optional[Dict[str, Any]]:
    system = (
        "You extract structured hiring data from resume text. "
        "Reply with ONLY a JSON object using keys: "
        "skills (array of lowercase skill strings), years_experience (integer), "
        "education (array of {school, degree}), seniority (one of junior|mid|senior), "
        "location (short string or empty)."
    )
    user = f"Resume text:\n{(resume_text or '')[:12000]}"
    raw = _groq_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=800,
        temperature=0.1,
        json_object=True,
        timeout_seconds=50.0,
    )
    if not raw:
        return None
    return _parse_llm_json_object(raw)


def _resume_parse_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    member_id = (body.get("member_id") or "").strip()
    text = body.get("text") or ""
    if _require_live_platform_data():
        if member_id:
            profile = _load_member_profile(member_id)
            if not profile or not profile.get("member_id"):
                raise LiveDataRequiredError(
                    f"Member profile for member_id={member_id} is required (AI_REQUIRE_LIVE_DATA=true) but the Member API returned no data."
                )
        else:
            if not (text or "").strip():
                raise LiveDataRequiredError(
                    "When AI_REQUIRE_LIVE_DATA=true, provide member_id (Member API) or non-empty resume text."
                )
            profile = {}
    else:
        profile = _load_member_profile(member_id) or _get_candidate_profiles().get(member_id, {})
    resume_text = text or profile.get("resume_text", "")
    base = _resume_parse_heuristic(resume_text, profile, member_id)
    parse_provider = "heuristic"

    if _groq_api_key() and len((resume_text or "").strip()) > 30:
        groq_data = _resume_parse_groq(resume_text)
        if groq_data:
            parse_provider = "groq"
            g_skills = groq_data.get("skills")
            if isinstance(g_skills, list):
                cleaned = []
                for s in g_skills:
                    if isinstance(s, str) and s.strip():
                        cleaned.append(_normalize_skill(s.strip()))
                if cleaned:
                    base["skills"] = sorted(set(cleaned))
            try:
                y = int(groq_data.get("years_experience"))
                if y >= 0:
                    base["years_experience"] = y
            except (TypeError, ValueError):
                pass
            edu = groq_data.get("education")
            if isinstance(edu, list) and edu:
                norm_edu = []
                for row in edu[:6]:
                    if isinstance(row, dict):
                        norm_edu.append(
                            {
                                "school": str(row.get("school") or "Unknown")[:200],
                                "degree": str(row.get("degree") or "Unknown")[:200],
                            }
                        )
                if norm_edu:
                    base["education"] = norm_edu
            sen = groq_data.get("seniority")
            if isinstance(sen, str) and _normalize_skill(sen) in {"junior", "mid", "senior"}:
                base["seniority"] = _normalize_skill(sen)
            loc = groq_data.get("location")
            if isinstance(loc, str) and loc.strip():
                base["location"] = loc.strip()[:200]

    base["parse_provider"] = parse_provider
    return base


def _job_profile_for(job_id: str) -> Dict[str, Any]:
    default_profile = {
        "job_id": job_id,
        "title": "Software Engineer",
        "required_skills": ["python", "kafka", "fastapi"],
        "location": "San Jose",
        "seniority": "mid",
    }
    service_profile = _load_job_profile(job_id)
    if service_profile:
        return service_profile
    if _require_live_platform_data():
        raise LiveDataRequiredError(
            f"Job profile for job_id={job_id} is required (AI_REQUIRE_LIVE_DATA=true) but the Job API returned no data."
        )
    return _get_job_profiles().get(job_id, default_profile)


def _match_score_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    job_id = body.get("job_id") or ""
    parsed_profile = body.get("parsed_profile") or {}
    member_id = parsed_profile.get("member_id") or body.get("member_id")
    job_profile = _job_profile_for(job_id)
    job_skills = {_normalize_skill(skill) for skill in job_profile.get("required_skills", [])}
    candidate_skills = {_normalize_skill(skill) for skill in parsed_profile.get("skills", [])}

    overlap = len(job_skills.intersection(candidate_skills))
    skill_overlap = (overlap / len(job_skills)) if job_skills else 0.0
    location_score = 1.0 if _normalize_skill(parsed_profile.get("location", "")) == _normalize_skill(job_profile.get("location", "")) else 0.5
    seniority_map = {"junior": 1, "mid": 2, "senior": 3}
    expected = seniority_map.get(_normalize_skill(job_profile.get("seniority", "")), 2)
    actual = seniority_map.get(_normalize_skill(parsed_profile.get("seniority", "")), 2)
    seniority_score = max(0.0, 1.0 - (abs(expected - actual) * 0.3))
    rule_score = (0.6 * skill_overlap) + (0.2 * location_score) + (0.2 * seniority_score)

    job_semantic_text = " ".join(
        [
            (job_profile.get("title") or ""),
            " ".join(str(skill) for skill in job_profile.get("required_skills", [])),
            (job_profile.get("location") or ""),
            (job_profile.get("seniority") or ""),
        ]
    )
    candidate_semantic_text = " ".join(
        [
            parsed_profile.get("resume_text", "") or "",
            " ".join(str(skill) for skill in (parsed_profile.get("skills", []) or [])),
            parsed_profile.get("location", "") or "",
            parsed_profile.get("seniority", "") or "",
        ]
    )
    job_embedding_meta = _semantic_embedding(job_semantic_text)
    candidate_embedding_meta = _semantic_embedding(candidate_semantic_text)
    embedding_score = _cosine_similarity(job_embedding_meta["vector"], candidate_embedding_meta["vector"])

    embedding_weight = _embedding_weight()
    rule_weight = 1.0 - embedding_weight
    final_score = round((embedding_weight * embedding_score) + (rule_weight * rule_score), 4)
    matched_skills = sorted(job_skills.intersection(candidate_skills))
    missing_skills = sorted(job_skills.difference(candidate_skills))
    embedding_provider = candidate_embedding_meta.get("provider") or job_embedding_meta.get("provider") or "hashed"
    embedding_model = candidate_embedding_meta.get("model") or job_embedding_meta.get("model") or "hash-v1"
    embedding_source = candidate_embedding_meta.get("source") or job_embedding_meta.get("source") or "local"
    return {
        "member_id": member_id,
        "candidate_id": member_id,
        "job_id": job_id,
        "name": parsed_profile.get("name") or member_id,
        "headline": parsed_profile.get("headline") or "Candidate",
        "location": parsed_profile.get("location") or "Unknown",
        "seniority": parsed_profile.get("seniority") or "Unknown",
        "score": final_score,
        "match_score": final_score,
        "embedding_score": round(embedding_score, 4),
        "rule_score": round(rule_score, 4),
        "embedding_weight": round(embedding_weight, 4),
        "rule_weight": round(rule_weight, 4),
        "embedding_provider": embedding_provider,
        "embedding_model": embedding_model,
        "embedding_source": embedding_source,
        "skills_overlap": round(skill_overlap, 4),
        "matched_skills": matched_skills,
        "skills_matched": matched_skills,
        "missing_skills": missing_skills,
    }


def _shortlist_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    job_id = body.get("job_id", "")
    scores = body.get("scores") or []
    raw_k = body.get("top_k")
    top_k = int(raw_k) if raw_k is not None and str(raw_k).strip() != "" else _shortlist_top_k()
    ranked = sorted(scores, key=lambda entry: entry.get("score", 0), reverse=True)
    candidates: List[Dict[str, Any]] = []
    for entry in ranked[:top_k]:
        candidate = dict(entry)
        candidate_id = candidate.get("member_id") or candidate.get("candidate_id")
        candidate["candidate_id"] = candidate_id
        candidate["match_score"] = candidate.get("match_score", candidate.get("score"))
        total_skills = len(candidate.get("matched_skills", [])) + len(candidate.get("missing_skills", []))
        candidate["skills_overlap"] = (
            round(len(candidate.get("matched_skills", [])) / total_skills, 4) if total_skills else candidate.get("skills_overlap", 0.0)
        )
        candidate["skills_matched"] = candidate.get("skills_matched", candidate.get("matched_skills", []))
        candidate.setdefault("name", candidate_id)
        candidate.setdefault("headline", "Candidate")
        candidate.setdefault("location", "Unknown")
        candidate.setdefault("seniority", "Unknown")
        candidate.setdefault("rationale", "Ranked by hybrid embedding and rule score.")
        candidates.append(candidate)
    return {"job_id": job_id, "candidates": candidates}


def _shortlist_row_member_id(row: Dict[str, Any]) -> str:
    return str(row.get("member_id") or row.get("candidate_id") or "").strip()


def _outreach_draft_text_for_single_row(job_id: str, row: Dict[str, Any], actor_id: Optional[str]) -> Tuple[str, str]:
    """Returns (draft_text, draft_provider) for exactly one shortlist row."""
    job_profile = _job_profile_for(job_id)
    mid = _shortlist_row_member_id(row) or "candidate"
    score = row.get("match_score", row.get("score", ""))
    skills = row.get("matched_skills") or row.get("skills_matched") or []
    lines = [
        f"Job: {job_profile.get('title', '')} ({job_id})",
        f"Location: {job_profile.get('location', '')}; Seniority: {job_profile.get('seniority', '')}",
        f"Required skills: {', '.join(str(s) for s in (job_profile.get('required_skills') or [])[:20])}",
        f"Target candidate member_id: {mid}",
        f"Match score: {score}; matched_skills: {skills}",
    ]
    context = "\n".join(lines)
    draft: Optional[str] = None
    draft_provider = "template"

    if _groq_api_key():
        system = (
            "You write concise, professional recruiter outreach messages (LinkedIn style). "
            "2–4 sentences. No placeholders. Do not invent company names if missing. "
            "Write to exactly one recipient; if you only have member_id, address them naturally without sounding robotic."
        )
        user = (
            f"{context}\n\nWrite one outreach message to member_id {mid} only. "
            "Reference the role and 1–2 strengths from the match data above."
        )
        raw = _groq_chat(
            [{"role": "system", "content": system}, {"role": "user", "content": user}],
            max_tokens=400,
            temperature=0.35,
            json_object=False,
            timeout_seconds=35.0,
        )
        if raw and raw.strip():
            draft = raw.strip()
            draft_provider = "groq"

    if not draft:
        draft = (
            f"Hi {mid} — your background looks like a strong match for our {job_profile.get('title', 'open role')} "
            f"({job_id}). Would you be open to a brief chat this week?"
        )
    _ = actor_id  # reserved for future tone / company personalization
    return draft, draft_provider


def _outreach_draft_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    """Build one draft per shortlist row; never one 'top' draft implicitly reused for others."""
    job_id = body.get("job_id") or ""
    actor_id = body.get("actor_id")
    raw_rows = [c for c in (body.get("shortlist") or []) if isinstance(c, dict)]
    drafts: List[Dict[str, str]] = []
    providers: List[str] = []

    for row in raw_rows:
        mid = _shortlist_row_member_id(row)
        if not mid:
            continue
        text, prov = _outreach_draft_text_for_single_row(job_id, row, actor_id)
        drafts.append({"member_id": mid, "text": text})
        providers.append(prov)

    draft_provider = providers[0] if len(providers) == 1 else ("mixed" if providers else "template")
    single_draft: Optional[str] = drafts[0]["text"] if len(drafts) == 1 else None

    return {
        "drafts": drafts,
        "draft": single_draft,
        "draft_provider": draft_provider,
    }


def _career_coach_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    member_id = (body.get("member_id") or "").strip()
    job_id = (body.get("job_id") or body.get("target_job_id") or "").strip()
    if _require_live_platform_data() and member_id:
        profile = _load_member_profile(member_id)
        if not profile or not profile.get("member_id"):
            raise LiveDataRequiredError(
                f"Member profile for member_id={member_id} is required (AI_REQUIRE_LIVE_DATA=true) but the Member API returned no data."
            )
    else:
        profile = _load_member_profile(member_id) if member_id else {}
    job = _job_profile_for(job_id) if job_id else {}

    headline = f"{profile.get('title', '')} {profile.get('headline', '')}".strip() or "(no headline loaded)"
    resume_snip = (profile.get("resume_text") or "")[:2500]
    skills = profile.get("skills") if isinstance(profile.get("skills"), list) else []
    job_title = job.get("title") or "Target role"
    job_skills = job.get("required_skills") or []
    job_loc = job.get("location") or ""

    default_suggestions = [
        {"text": "Add measurable impact metrics to your headline.", "rationale": "Recruiters scan for outcomes."},
        {"text": "Align your top skills with the job's required stack.", "rationale": "ATS and matching rank explicit overlap."},
    ]

    if not _groq_api_key():
        return {"suggestions": default_suggestions, "coach_provider": "default"}

    system = (
        "You are a career coach for tech professionals. "
        "Return ONLY JSON with key 'suggestions': an array (2 to 4 items) of objects "
        "with keys 'text' (short actionable tip) and 'rationale' (one sentence why it helps)."
    )
    user = (
        f"Target job: {job_title} (id={job_id or 'n/a'}) location={job_loc} required_skills={job_skills}\n"
        f"Member headline/context: {headline}\n"
        f"Existing skills list: {skills}\n"
        f"Resume excerpt:\n{resume_snip}"
    )
    raw = _groq_chat(
        [{"role": "system", "content": system}, {"role": "user", "content": user}],
        max_tokens=700,
        temperature=0.35,
        json_object=True,
        timeout_seconds=40.0,
    )
    if not raw:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_failed"}
    parsed = _parse_llm_json_object(raw)
    if not parsed:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_bad_json"}
    items = parsed.get("suggestions")
    if not isinstance(items, list) or not items:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_shape"}
    out: List[Dict[str, str]] = []
    for row in items[:6]:
        if not isinstance(row, dict):
            continue
        t = row.get("text")
        r = row.get("rationale")
        if isinstance(t, str) and t.strip():
            out.append({"text": t.strip()[:400], "rationale": (r.strip()[:300] if isinstance(r, str) else "")})
    if not out:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_empty"}
    return {"suggestions": out, "coach_provider": "groq"}


def _get_task_collection():
    global _mongo_client, _mongo_collection, _mongo_event_collection
    if MongoClient is None:
        return None
    if _mongo_collection is not None:
        return _mongo_collection

    mongo_url = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    mongo_db = os.getenv("MONGO_DB", "linkedin_sim")
    mongo_collection = os.getenv("MONGO_AI_TASKS_COLLECTION", "ai_tasks")
    try:
        _mongo_client = MongoClient(mongo_url, serverSelectionTimeoutMS=1500)
        _mongo_client.admin.command("ping")
        db = _mongo_client[mongo_db]
        _mongo_collection = db[mongo_collection]
        _mongo_collection.create_index("task_id", unique=True)
        _mongo_collection.create_index("trace_id")
        _mongo_collection.create_index([("actor_id", 1), ("client_request_id", 1)])
        _mongo_collection.create_index("created_at")
        _mongo_event_collection = db[os.getenv("MONGO_AI_TASK_EVENTS_COLLECTION", TASK_EVENT_COLLECTION_DEFAULT)]
        _mongo_event_collection.create_index("task_id")
        _mongo_event_collection.create_index("trace_id")
        _mongo_event_collection.create_index("timestamp")
    except Exception:
        _mongo_collection = None
        _mongo_event_collection = None
    return _mongo_collection


def _get_task_event_collection():
    global _mongo_event_collection
    if _mongo_event_collection is not None:
        return _mongo_event_collection
    _get_task_collection()
    return _mongo_event_collection


def _append_task_event(
    task: Dict[str, Any],
    event_type: str,
    payload: Optional[Dict[str, Any]] = None,
    *,
    topic: str = "",
    source: str = "ai_service",
):
    collection = _get_task_event_collection()
    if collection is None:
        return
    try:
        collection.insert_one(
            {
                "task_id": task.get("task_id"),
                "trace_id": task.get("trace_id"),
                "actor_id": task.get("actor_id"),
                "event_type": event_type,
                "topic": topic,
                "source": source,
                "payload": payload or {},
                "state": task.get("state"),
                "current_step": task.get("current_step"),
                "timestamp": _now_iso(),
            }
        )
    except Exception:
        pass


def _save_task(task: Dict[str, Any]):
    TASKS[task["task_id"]] = task
    collection = _get_task_collection()
    if collection is None:
        return
    try:
        collection.replace_one({"task_id": task["task_id"]}, task, upsert=True)
    except Exception:
        # Keep API available even if DB write fails.
        pass


def _load_task(task_id: str) -> Optional[Dict[str, Any]]:
    task = TASKS.get(task_id)
    if task:
        return task

    collection = _get_task_collection()
    if collection is None:
        return None
    try:
        record = collection.find_one({"task_id": task_id})
        if not record:
            return None
        record.pop("_id", None)
        TASKS[task_id] = record
        return record
    except Exception:
        return None


def _step_template() -> List[Dict[str, Any]]:
    return [
        {
            "step_name": step,
            "status": "pending",
            "started_at": None,
            "ended_at": None,
            "output_summary": None,
            "output_data": None,
            "attempt": 0,
            "error": None,
        }
        for step in STEP_SEQUENCE
    ]


def _invoke_skill(path: str, payload: Dict[str, Any], local_fallback):
    base_url = _skills_base_url()
    if base_url:
        response = _post_json(f"{base_url}{path}", payload, timeout_seconds=20.0)
        if isinstance(response, dict):
            return response
    return local_fallback(payload)


def _run_pipeline(task: Dict[str, Any]):
    task["state"] = "processing"
    task["approval_target"] = None
    task["updated_at"] = _now_iso()
    _save_task(task)
    _append_task_event(task, "ai.task.processing", {"step": None}, source="state_transition")

    outputs = {
        "resume_parse": "Parsed candidate profiles from resume text",
        "match_score": "Computed embedding-plus-rules match scores",
        "shortlist": "Generated ranked shortlist",
        # Legacy in-flight tasks may still include this step from older deployments.
        "outreach_draft": "Prepared outreach draft",
    }
    parsed_profiles: List[Dict[str, Any]] = []
    score_cards: List[Dict[str, Any]] = []
    shortlist_candidates: List[Dict[str, Any]] = []

    for step in task["steps"]:
        step_name = step["step_name"]
        # Idempotency guard: skip duplicate execution for already completed steps.
        if step["status"] == "completed":
            continue

        success = False
        for _ in range(2):
            try:
                if not _mark_step_once(task["task_id"], step_name) and step["status"] != "failed":
                    if step["status"] == "completed":
                        success = True
                        break
                    # Another worker already started this step.
                    continue

                step["attempt"] += 1
                step["status"] = "processing"
                step["error"] = None
                if not step["started_at"]:
                    step["started_at"] = _now_iso()
                task["current_step"] = step_name
                task["updated_at"] = _now_iso()
                _save_task(task)

                _publish_event(
                    "ai.results",
                    "ai.step.started",
                    task,
                    {"task_type": task["task_type"], "step": step_name, "data": {"attempt": step["attempt"]}},
                )

                summary = outputs.get(step_name)
                if not summary:
                    raise RuntimeError(f"Unknown pipeline step: {step_name}")

                if step_name == "resume_parse":
                    parsed_profiles = []
                    for candidate_id in task["candidate_ids"]:
                        parsed = _invoke_skill(
                            "/resume/parse",
                            {"member_id": candidate_id},
                            _resume_parse_skill,
                        )
                        if not parsed.get("member_id"):
                            parsed["member_id"] = candidate_id
                        parsed_profiles.append(parsed)
                    step["output_data"] = {
                        "parsed_profiles": [
                            {
                                "member_id": profile.get("member_id"),
                                "skills": profile.get("skills", []),
                                "years_experience": profile.get("years_experience", 0),
                            }
                            for profile in parsed_profiles
                        ]
                    }
                    step["output_summary"] = f"Parsed {len(parsed_profiles)} candidate resumes"
                elif step_name == "match_score":
                    score_cards = [
                        _invoke_skill(
                            "/match/score",
                            {
                                "job_id": task["job_id"],
                                "member_id": parsed.get("member_id"),
                                "parsed_profile": parsed,
                            },
                            _match_score_skill,
                        )
                        for parsed in parsed_profiles
                    ]
                    step["output_data"] = {"scores": score_cards}
                    step["output_summary"] = "Computed hybrid embedding-plus-rules scores"
                elif step_name == "shortlist":
                    shortlist_response = _invoke_skill(
                        "/shortlist",
                        {"job_id": task["job_id"], "scores": score_cards, "top_k": _shortlist_top_k()},
                        _shortlist_skill,
                    )
                    shortlist_candidates = shortlist_response.get("candidates", [])
                    step["output_data"] = {"shortlist": shortlist_candidates}
                    step["output_summary"] = f"Generated ranked shortlist with {len(shortlist_candidates)} candidates"
                elif step_name == "outreach_draft":
                    draft_response = _invoke_skill(
                        "/outreach/draft",
                        {"job_id": task["job_id"], "shortlist": shortlist_candidates, "actor_id": task["actor_id"]},
                        _outreach_draft_skill,
                    )
                    step["output_data"] = draft_response
                    step["output_summary"] = "Prepared outreach draft"
                else:
                    step["output_summary"] = summary

                step["status"] = "completed"
                step["ended_at"] = _now_iso()
                if not step.get("output_summary"):
                    step["output_summary"] = summary
                task["updated_at"] = _now_iso()
                _save_task(task)

                _publish_event(
                    "ai.results",
                    "ai.step.completed",
                    task,
                    {
                        "task_type": task["task_type"],
                        "step": step_name,
                        "data": {
                            "summary": step["output_summary"],
                            "attempt": step["attempt"],
                        },
                    },
                )
                success = True
                break
            except Exception as exc:
                step["status"] = "failed"
                step["error"] = str(exc)
                task["updated_at"] = _now_iso()
                _save_task(task)

        if not success:
            task["state"] = "failed"
            task["current_step"] = step_name
            task["error"] = {"reason": step.get("error") or "step_failed", "step": step_name}
            task["updated_at"] = _now_iso()
            _save_task(task)
            _append_task_event(task, "ai.task.failed", {"reason": task["error"]["reason"], "step": step_name}, source="state_transition")
            _publish_event(
                "ai.results",
                "ai.failed",
                task,
                {
                    "task_type": task["task_type"],
                    "step": step_name,
                    "data": {"reason": task["error"]["reason"], "attempt": step["attempt"]},
                },
            )
            _publish_failed_envelope(task, task["error"]["reason"])
            return

    if _shortlist_hitl_required():
        task["state"] = "awaiting_approval"
        task["approval_target"] = "shortlist"
        task["current_step"] = None
        task["result"] = {"shortlist": shortlist_candidates, "outreach_draft": None, "outreach_drafts": []}
        task["updated_at"] = _now_iso()
        _save_task(task)
        _append_task_event(task, "ai.task.awaiting_approval", {"approval_target": "shortlist"}, source="state_transition")
        _publish_event(
            "ai.results",
            "ai.awaiting_approval",
            task,
            {
                "task_type": task["task_type"],
                "step": "shortlist",
                "data": {"status": "awaiting_approval", "approval_target": "shortlist"},
            },
        )
        return

    # Legacy in-flight tasks may still include an outreach_draft step from older deployments.
    outreach_done = next(
        (
            s
            for s in (task.get("steps") or [])
            if isinstance(s, dict) and s.get("step_name") == "outreach_draft" and s.get("status") == "completed"
        ),
        None,
    )
    if outreach_done:
        od = outreach_done.get("output_data") or {}
        draft_text = od.get("draft") if isinstance(od, dict) else None
        od_drafts = od.get("drafts") if isinstance(od, dict) else None
        task["state"] = "awaiting_approval"
        task["approval_target"] = "outreach_draft"
        task["current_step"] = None
        task["outreach_candidate_ids"] = [
            str(c.get("member_id") or c.get("candidate_id"))
            for c in shortlist_candidates
            if isinstance(c, dict) and (c.get("member_id") or c.get("candidate_id"))
        ]
        res_sl: Dict[str, Any] = {
            "shortlist": shortlist_candidates,
            "score_cards": score_cards,
            "outreach_draft": draft_text,
        }
        if isinstance(od_drafts, list) and od_drafts:
            res_sl["outreach_drafts"] = od_drafts
        elif draft_text and task["outreach_candidate_ids"]:
            res_sl["outreach_drafts"] = [
                {"member_id": str(x), "text": str(draft_text)} for x in task["outreach_candidate_ids"]
            ]
        task["result"] = res_sl
        task["updated_at"] = _now_iso()
        _save_task(task)
        _append_task_event(task, "ai.task.awaiting_approval", {"approval_target": "outreach_draft"}, source="state_transition")
        _publish_event(
            "ai.results",
            "ai.awaiting_approval",
            task,
            {
                "task_type": task["task_type"],
                "step": "outreach_draft",
                "data": {"status": "awaiting_approval", "approval_target": "outreach_draft"},
            },
        )
        return

    task["state"] = "shortlist_ready"
    task["approval_target"] = None
    task["current_step"] = None
    task["outreach_candidate_ids"] = None
    task["result"] = {
        "shortlist": shortlist_candidates,
        "score_cards": score_cards,
        "outreach_draft": None,
        "outreach_drafts": [],
    }
    task["updated_at"] = _now_iso()
    _save_task(task)
    _append_task_event(
        task,
        "ai.task.shortlist_ready",
        {"shortlist_size": len(shortlist_candidates), "top_k": _shortlist_top_k()},
        source="state_transition",
    )
    _publish_event(
        "ai.results",
        "ai.shortlist_ready",
        task,
        {
            "task_type": task["task_type"],
            "step": "shortlist",
            "data": {
                "status": "shortlist_ready",
                "shortlist_size": len(shortlist_candidates),
                "top_k": _shortlist_top_k(),
            },
        },
    )


def _pick_shortlist_entries_for_ids(task: Dict[str, Any], selected_ids: List[str]) -> Tuple[List[Dict[str, Any]], Optional[str]]:
    shortlist = (task.get("result") or {}).get("shortlist") or []
    if not isinstance(shortlist, list) or not shortlist:
        return [], "Task has no shortlist yet. Run ranking first."
    by_id: Dict[str, Dict[str, Any]] = {}
    for c in shortlist:
        if isinstance(c, dict):
            mid = c.get("member_id") or c.get("candidate_id")
            if mid:
                by_id[str(mid)] = c
    ordered: List[Dict[str, Any]] = []
    for sid in selected_ids:
        s = str(sid).strip()
        if s and s in by_id:
            ordered.append(by_id[s])
    if not ordered:
        return [], "Selected candidate_ids do not match anyone in the current shortlist."
    return ordered, None


def _extract_task_id_from_event(event: Dict[str, Any]) -> Optional[str]:
    entity = event.get("entity") or {}
    task_id = entity.get("entity_id") or event.get("task_id")
    if isinstance(task_id, str) and task_id.strip():
        return task_id
    return None


def _consume_ai_requests():
    global _consumer_running
    if KafkaConsumer is None:
        return
    try:
        consumer = KafkaConsumer(
            "ai.requests",
            bootstrap_servers=["127.0.0.1:9092"],
            group_id=os.getenv("AI_CONSUMER_GROUP", "ai-service-supervisor"),
            auto_offset_reset="latest",
            enable_auto_commit=False,
            value_deserializer=lambda b: json.loads(b.decode("utf-8")),
        )
    except Exception:
        return

    _consumer_running = True
    try:
        for message in consumer:
            event = message.value or {}
            task_id = _extract_task_id_from_event(event)
            if not task_id:
                continue
            task = _load_task(task_id)
            if not task:
                continue
            if task.get("state") != "queued":
                # Idempotent protection against duplicate delivery.
                try:
                    consumer.commit()
                except Exception:
                    pass
                continue
            _run_pipeline(task)
            try:
                consumer.commit()
            except Exception:
                pass
    except Exception as exc:
        logger.exception("Kafka consumer loop crashed: %s", exc)
    finally:
        _consumer_running = False
        try:
            consumer.close()
        except Exception:
            pass


def _recover_inflight_tasks():
    collection = _get_task_collection()
    if collection is None:
        return
    try:
        for record in collection.find({"state": {"$in": ["queued", "processing"]}}):
            record.pop("_id", None)
            TASKS[record["task_id"]] = record
            _run_pipeline(record)
    except Exception:
        # Recovery should not block service startup.
        pass


class MemberSearchFilters(BaseModel):
    """Used when candidate_source=members_search (passed to POST /members/search)."""

    keyword: Optional[str] = None
    location: Optional[str] = None
    skill: Optional[str] = None


class SubmitTaskRequest(BaseModel):
    task_type: str
    job_id: str
    candidate_ids: List[str] = Field(default_factory=list)
    actor_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    # Default: resolve applicants for job_id when candidate_ids is omitted (job-first flow).
    candidate_source: Literal["explicit", "job_applicants", "members_search"] = "job_applicants"
    member_search: Optional[MemberSearchFilters] = None
    trace_id: Optional[str] = None
    client_request_id: Optional[str] = None

    @model_validator(mode="after")
    def _merge_recruiter_actor(self) -> "SubmitTaskRequest":
        a = (self.actor_id or "").strip()
        r = (self.recruiter_id or "").strip()
        if a and r and a != r:
            raise ValueError("actor_id and recruiter_id must match when both are set")
        merged = a or r
        if not merged:
            raise ValueError("Provide actor_id or recruiter_id (recruiter / hiring user for this workflow)")
        self.actor_id = merged
        return self


def _candidate_ids_from_job_applicants(job_id: str) -> Tuple[List[str], Optional[str]]:
    raw = _post_json_value(_applications_by_job_url(), {"job_id": job_id}, timeout_seconds=8.0)
    if raw is None:
        return [], "Applications service unreachable or invalid response."
    if isinstance(raw, dict):
        if raw.get("error"):
            return [], str(raw.get("message") or raw.get("error") or "applications_error")
        return [], "Unexpected applications response (expected a list)."
    if not isinstance(raw, list):
        return [], "Unexpected applications response."
    out: List[str] = []
    seen = set()
    for row in raw:
        if not isinstance(row, dict):
            continue
        mid = str(row.get("member_id") or "").strip()
        if mid and mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out, None


def _candidate_ids_from_members_search(filters: MemberSearchFilters) -> Tuple[List[str], Optional[str]]:
    kw = (filters.keyword or "").strip()
    loc = (filters.location or "").strip()
    sk = (filters.skill or "").strip()
    if not kw and not loc and not sk:
        return [], "members_search requires member_search with at least one of keyword, location, or skill."
    body: Dict[str, Any] = {}
    if kw:
        body["keyword"] = kw
    if loc:
        body["location"] = loc
    if sk:
        body["skill"] = sk
    raw = _post_json_value(_members_search_url(), body, timeout_seconds=10.0)
    if raw is None:
        return [], "Member search unreachable or invalid response."
    if isinstance(raw, dict) and raw.get("error"):
        return [], str(raw.get("message") or raw.get("error") or "member_search_error")
    if not isinstance(raw, list):
        return [], "Unexpected member search response."
    cap = _members_search_max()
    out: List[str] = []
    seen = set()
    for row in raw[:cap]:
        if not isinstance(row, dict):
            continue
        mid = str(row.get("member_id") or "").strip()
        if mid and mid not in seen:
            seen.add(mid)
            out.append(mid)
    return out, None


class ApproveBody(BaseModel):
    decision: str  # approve | edit | reject
    edited_text: Optional[str] = None
    reviewer_id: str


class GenerateOutreachBody(BaseModel):
    """After shortlist_ready: recruiter picks one or more member_ids from the ranked shortlist."""

    candidate_ids: List[str]
    actor_id: Optional[str] = None
    recruiter_id: Optional[str] = None
    reviewer_id: Optional[str] = None

    @model_validator(mode="after")
    def _merge_gen_recruiter_actor(self) -> "GenerateOutreachBody":
        a = (self.actor_id or "").strip()
        r = (self.recruiter_id or "").strip()
        if a and r and a != r:
            raise ValueError("actor_id and recruiter_id must match when both are set")
        merged = a or r
        self.actor_id = merged or None
        return self


class ResumeParseBody(BaseModel):
    member_id: Optional[str] = None
    text: Optional[str] = None


class MatchScoreBody(BaseModel):
    job_id: str
    member_id: Optional[str] = None
    parsed_profile: Dict[str, Any]


class ShortlistBody(BaseModel):
    job_id: str
    scores: List[Dict[str, Any]]
    top_k: Optional[int] = None


class OutreachDraftBody(BaseModel):
    job_id: str
    shortlist: List[Dict[str, Any]]
    actor_id: Optional[str] = None


TASKS = {}


def _find_existing_task_by_client_request(actor_id: str, client_request_id: str) -> Optional[Dict[str, Any]]:
    if not client_request_id:
        return None
    for task in TASKS.values():
        if task.get("actor_id") == actor_id and task.get("client_request_id") == client_request_id:
            return task
    collection = _get_task_collection()
    if collection is None:
        return None
    try:
        record = collection.find_one({"actor_id": actor_id, "client_request_id": client_request_id})
        if not record:
            return None
        record.pop("_id", None)
        TASKS[record["task_id"]] = record
        return record
    except Exception:
        return None


@app.on_event("startup")
def startup_supervisor_consumer():
    global _consumer_thread
    if KafkaConsumer is None:
        return
    if _consumer_thread and _consumer_thread.is_alive():
        return
    _consumer_thread = threading.Thread(target=_consume_ai_requests, name="ai-requests-consumer", daemon=True)
    _consumer_thread.start()
    _log_model_mode()
    _recover_inflight_tasks()


@app.post("/ai/tasks/submit", status_code=202)
async def submit_task(req: SubmitTaskRequest):
    if req.task_type != TASK_TYPE_CANDIDATE_SHORTLIST:
        return _error_response(
            400,
            "VALIDATION_ERROR",
            "Unsupported task_type. Only 'candidate_shortlist' is currently supported.",
            details={"task_type": req.task_type},
        )
    if not req.job_id.strip():
        return _error_response(400, "VALIDATION_ERROR", "job_id is required.")
    if req.client_request_id and len(req.client_request_id) > 128:
        return _error_response(400, "VALIDATION_ERROR", "client_request_id must be <= 128 chars.")

    raw_explicit = [str(x).strip() for x in (req.candidate_ids or []) if str(x).strip()]
    resolved_ids: List[str] = []
    source_error: Optional[str] = None
    source: str

    if raw_explicit:
        source, resolved_ids = "explicit", raw_explicit
    elif req.candidate_source == "members_search":
        source = "members_search"
        filters = req.member_search or MemberSearchFilters()
        resolved_ids, source_error = _candidate_ids_from_members_search(filters)
        if source_error:
            return _error_response(400, "VALIDATION_ERROR", source_error)
        if not resolved_ids:
            return _error_response(
                404,
                "NO_CANDIDATES",
                "Member search returned no members for the given filters.",
            )
    elif req.candidate_source == "explicit":
        return _error_response(
            400,
            "VALIDATION_ERROR",
            "candidate_ids must contain at least one ID when candidate_source is explicit.",
        )
    else:
        source = "job_applicants"
        resolved_ids, source_error = _candidate_ids_from_job_applicants(req.job_id.strip())
        if source_error:
            return _error_response(502, "CANDIDATE_SOURCE_FAILED", source_error)
        if not resolved_ids:
            return _error_response(
                404,
                "NO_CANDIDATES",
                "No applicants found for this job_id. Submit applications first, or pass candidate_ids explicitly.",
            )

    existing = _find_existing_task_by_client_request(req.actor_id, (req.client_request_id or "").strip())
    if existing:
        return {
            "task_id": existing["task_id"],
            "trace_id": existing["trace_id"],
            "state": existing["state"],
            "created_at": existing.get("created_at"),
            "reused": True,
        }

    task_id = str(uuid.uuid4())
    trace_id = req.trace_id or str(uuid.uuid4())
    created_at = _now_iso()

    task = {
        "task_id": task_id,
        "trace_id": trace_id,
        "task_type": req.task_type,
        "job_id": req.job_id,
        "candidate_ids": resolved_ids,
        "candidate_source": source,
        "member_search": (req.member_search.model_dump(exclude_none=True) if req.member_search else None),
        "actor_id": req.actor_id,
        "client_request_id": (req.client_request_id or "").strip() or None,
        "state": "queued",
        "current_step": None,
        "steps": _step_template(),
        "result": None,
        "error": None,
        "created_at": created_at,
        "updated_at": created_at,
    }
    _save_task(task)
    _append_task_event(
        task,
        "ai.task.requested",
        {"job_id": req.job_id, "candidate_ids": resolved_ids, "candidate_source": source},
        source="state_transition",
    )

    _publish_event(
        "ai.requests",
        "ai.requested",
        task,
        {
            "task_type": req.task_type,
            "step": None,
            "data": {"job_id": req.job_id, "candidate_ids": resolved_ids, "candidate_source": source},
        },
    )

    # Fallback for environments where Kafka consumer is unavailable.
    if not _consumer_running:
        _run_pipeline(task)

    return {
        "task_id": task_id,
        "trace_id": trace_id,
        "state": task["state"],
        "created_at": created_at,
        "reused": False,
        "candidate_source": source,
        "candidate_ids": resolved_ids,
    }


@app.get("/ai/tasks/{task_id}")
async def get_task(task_id: str):
    task = _load_task(task_id)
    if not task:
        return _error_response(404, "TASK_NOT_FOUND", "No task found for provided task_id.")
    return _public_task(task)


@app.post("/ai/tasks/{task_id}/outreach/generate", status_code=202)
async def generate_outreach_draft(task_id: str, body: GenerateOutreachBody):
    """Second recruiter action: draft outreach for selected shortlist members (after shortlist_ready)."""
    task = _load_task(task_id)
    if not task:
        return _error_response(404, "TASK_NOT_FOUND", "No task found for provided task_id.")
    caller = (body.actor_id or "").strip()
    task_actor = (task.get("actor_id") or "").strip()
    if caller and task_actor and caller != task_actor:
        return _error_response(
            403,
            "RECRUITER_MISMATCH",
            "actor_id/recruiter_id must match this task's recruiter (actor_id).",
            task.get("trace_id", ""),
            details={"task_actor_id": task_actor},
        )
    if task.get("state") != "shortlist_ready":
        return _error_response(
            409,
            "INVALID_STATE",
            f"Generate outreach is only allowed in state shortlist_ready (current: {task.get('state')}).",
            task.get("trace_id", ""),
            details={"state": task.get("state")},
        )
    if any(
        isinstance(s, dict) and s.get("step_name") == "outreach_draft" and s.get("status") == "completed"
        for s in (task.get("steps") or [])
    ):
        return _error_response(
            409,
            "OUTREACH_EXISTS",
            "Outreach draft was already generated for this task.",
            task.get("trace_id", ""),
        )
    selected = [str(x).strip() for x in body.candidate_ids if str(x).strip()]
    if not selected:
        return _error_response(
            400,
            "VALIDATION_ERROR",
            "candidate_ids must list at least one member_id from the shortlist.",
            task.get("trace_id", ""),
        )
    filtered, perr = _pick_shortlist_entries_for_ids(task, selected)
    if perr:
        return _error_response(400, "INVALID_SELECTION", perr, task.get("trace_id", ""))
    send_targets = [str(c.get("member_id") or c.get("candidate_id") or "") for c in filtered]
    send_targets = [x for x in send_targets if x]
    draft_response = _invoke_skill(
        "/outreach/draft",
        {"job_id": task["job_id"], "shortlist": filtered, "actor_id": task["actor_id"]},
        _outreach_draft_skill,
    )
    now = _now_iso()
    out_data = draft_response if isinstance(draft_response, dict) else {"draft": str(draft_response)}
    outreach_step = {
        "step_name": "outreach_draft",
        "status": "completed",
        "started_at": now,
        "ended_at": now,
        "output_summary": "Prepared outreach draft",
        "output_data": out_data,
        "attempt": 1,
        "error": None,
    }
    task["steps"] = list(task.get("steps") or []) + [outreach_step]
    task["outreach_candidate_ids"] = send_targets
    if body.reviewer_id:
        task["outreach_selected_by"] = body.reviewer_id.strip()
    if not isinstance(task.get("result"), dict):
        task["result"] = {}
    dr = draft_response if isinstance(draft_response, dict) else {}
    task["result"]["outreach_drafts"] = dr.get("drafts") or []
    task["result"]["outreach_draft"] = dr.get("draft")
    task["result"]["outreach_send_targets"] = send_targets
    task["state"] = "awaiting_approval"
    task["approval_target"] = "outreach_draft"
    task["current_step"] = None
    task["updated_at"] = now
    _save_task(task)
    _append_task_event(
        task,
        "ai.task.awaiting_approval",
        {"approval_target": "outreach_draft", "outreach_targets": send_targets},
        source="state_transition",
    )
    _publish_event(
        "ai.results",
        "ai.awaiting_approval",
        task,
        {
            "task_type": task["task_type"],
            "step": "outreach_draft",
            "data": {"status": "awaiting_approval", "approval_target": "outreach_draft", "outreach_targets": send_targets},
        },
    )
    return {
        "task_id": task_id,
        "trace_id": task["trace_id"],
        "state": task["state"],
        "outreach_candidate_ids": send_targets,
        "outreach_drafts": (task.get("result") or {}).get("outreach_drafts") or [],
        "outreach_draft": (task.get("result") or {}).get("outreach_draft"),
    }


@app.get("/ai/tasks/{task_id}/events")
async def get_task_events(task_id: str, limit: int = 200):
    collection = _get_task_event_collection()
    if collection is None:
        return []
    safe_limit = max(1, min(1000, int(limit)))
    try:
        records = list(collection.find({"task_id": task_id}).sort("timestamp", 1).limit(safe_limit))
    except Exception:
        return []
    out = []
    for record in records:
        record.pop("_id", None)
        out.append(record)
    return out


@app.get("/ai/tasks")
async def list_tasks(actor_id: Optional[str] = None):
    records: List[Dict[str, Any]] = []
    collection = _get_task_collection()
    if collection is not None:
        query = {"actor_id": actor_id} if actor_id else {}
        try:
            for record in collection.find(query):
                record.pop("_id", None)
                records.append(record)
        except Exception:
            records = list(TASKS.values())
    else:
        records = list(TASKS.values())
    if actor_id:
        records = [r for r in records if r.get("actor_id") == actor_id]
    records.sort(key=lambda r: r.get("updated_at") or r.get("created_at") or "", reverse=True)
    return [_public_task(task, compact=True) for task in records]


@app.post("/ai/resume/parse")
async def resume_parse(body: ResumeParseBody):
    return _resume_parse_skill(body.model_dump())


@app.post("/ai/match/score")
async def match_score(body: MatchScoreBody):
    return _match_score_skill(body.model_dump())


@app.post("/ai/shortlist")
async def shortlist(body: ShortlistBody):
    payload = body.model_dump()
    if payload.get("top_k") is None:
        payload["top_k"] = _shortlist_top_k()
    return _shortlist_skill(payload)


@app.post("/ai/outreach/draft")
async def outreach_draft(body: OutreachDraftBody):
    return _outreach_draft_skill(body.model_dump())


@app.post("/ai/career-coach/suggest")
async def career_coach(body: dict):
    if not isinstance(body, dict):
        body = {}
    return _career_coach_skill(body)


@app.post("/ai/tasks/{task_id}/approve")
async def approve_task(task_id: str, body: ApproveBody):
    task = _load_task(task_id)
    if not task:
        return _error_response(404, "TASK_NOT_FOUND", "No task found for provided task_id.")
    try:
        if body.decision not in VALID_DECISIONS:
            return _error_response(400, "INVALID_DECISION", "decision must be one of approve|edit|reject.", task["trace_id"])
        if body.decision == "edit" and not (body.edited_text or "").strip():
            return _error_response(400, "EDIT_TEXT_REQUIRED", "edited_text is required when decision is edit.", task["trace_id"])
        if task["state"] != "awaiting_approval":
            return _error_response(
                409,
                "INVALID_STATE",
                f"Cannot approve task in state '{task['state']}'.",
                task["trace_id"],
                details={"state": task["state"]},
            )

        if not isinstance(task.get("result"), dict):
            task["result"] = {"shortlist": [], "outreach_draft": None, "outreach_drafts": []}
        if not isinstance(task["result"].get("shortlist"), list):
            task["result"]["shortlist"] = []

        approval_target = task.get("approval_target") or "outreach_draft"
        original_text: Any = None
        if approval_target == "outreach_draft":
            r0 = task.get("result") or {}
            ods0 = r0.get("outreach_drafts")
            if isinstance(ods0, list) and ods0:
                original_text = json.dumps(ods0)
            else:
                original_text = r0.get("outreach_draft")
        task["approval"] = {
            "decision": body.decision,
            "edited_text": body.edited_text,
            "original_text": original_text,
            "reviewer_id": body.reviewer_id,
            "target": approval_target,
            "recorded_at": _now_iso(),
        }
        task["updated_at"] = _now_iso()

        if body.decision == "reject":
            task["state"] = "rejected"
            task["error"] = None
            if isinstance(task.get("result"), dict):
                task["result"]["rejection_note"] = "Rejected by reviewer"
            _append_task_event(task, "ai.task.rejected", {"target": approval_target}, source="state_transition")
            _publish_event(
                "ai.results",
                "ai.rejected",
                task,
                {"task_type": task["task_type"], "step": None, "data": {"reason": "rejected", "target": approval_target}},
            )
        elif approval_target == "shortlist":
            if body.decision == "edit":
                task["result"]["shortlist_reviewer_note"] = body.edited_text
            sl = task.get("result", {}).get("shortlist") or []
            outreach = _invoke_skill(
                "/outreach/draft",
                {"job_id": task["job_id"], "shortlist": sl, "actor_id": task["actor_id"]},
                _outreach_draft_skill,
            )
            task["result"]["outreach_drafts"] = outreach.get("drafts") or []
            task["result"]["outreach_draft"] = outreach.get("draft")
            task["outreach_candidate_ids"] = [
                str(c.get("member_id") or c.get("candidate_id"))
                for c in sl
                if isinstance(c, dict) and (c.get("member_id") or c.get("candidate_id"))
            ]
            task["approval_target"] = "outreach_draft"
            task["state"] = "awaiting_approval"
            task["updated_at"] = _now_iso()
            _append_task_event(task, "ai.task.awaiting_approval", {"approval_target": "outreach_draft"}, source="state_transition")
            _publish_event(
                "ai.results",
                "ai.awaiting_approval",
                task,
                {
                    "task_type": task["task_type"],
                    "step": "outreach_draft",
                    "data": {"status": "awaiting_approval", "approval_target": "outreach_draft"},
                },
            )
        else:
            if body.decision == "edit" and (body.edited_text or "").strip():
                if isinstance(task["result"].get("outreach_drafts"), list) and task["result"]["outreach_drafts"]:
                    for d in task["result"]["outreach_drafts"]:
                        if isinstance(d, dict):
                            d["text"] = body.edited_text.strip()
                else:
                    task["result"]["outreach_draft"] = body.edited_text.strip()

            task["state"] = "approved"
            task["updated_at"] = _now_iso()
            _save_task(task)
            _append_task_event(
                task,
                "ai.task.approved",
                {"target": approval_target, "decision": body.decision},
                source="state_transition",
            )
            _publish_event(
                "ai.results",
                "ai.approved",
                task,
                {"task_type": task["task_type"], "step": None, "data": {"decision": body.decision, "target": approval_target}},
            )

            send_ids = list(task.get("outreach_candidate_ids") or [])
            if not send_ids:
                shortlist = (task.get("result") or {}).get("shortlist") or []
                first = shortlist[0] if shortlist and isinstance(shortlist[0], dict) else None
                if first:
                    one = first.get("candidate_id") or first.get("member_id")
                    if one:
                        send_ids = [str(one)]
            if not send_ids:
                send_ids = [str(x) for x in (task.get("candidate_ids") or []) if str(x).strip()]
            obc = _outreach_by_candidate_map(task.get("result") or {}, send_ids)
            legacy_single = (task.get("result") or {}).get("outreach_draft")
            _publish_event(
                _send_topic_name(),
                SEND_REQUESTED_EVENT,
                task,
                {
                    "task_type": task["task_type"],
                    "step": "send",
                    "data": {
                        "job_id": task["job_id"],
                        "candidate_ids": send_ids,
                        "outreach_by_candidate": obc,
                        "outreach_text": legacy_single if len(send_ids) == 1 else None,
                    },
                },
            )
            task["state"] = "completed"
            task["updated_at"] = _now_iso()
            _append_task_event(task, "ai.task.completed", {"decision": body.decision}, source="state_transition")
            _publish_event(
                "ai.results",
                "ai.completed",
                task,
                {"task_type": task["task_type"], "step": None, "data": {"decision": body.decision}},
            )
        _save_task(task)

        return {
            "task_id": task_id,
            "trace_id": task["trace_id"],
            "state": task["state"],
            "decision": body.decision,
            "recorded_at": task["approval"]["recorded_at"],
        }
    except Exception as exc:
        task["state"] = "failed"
        task["error"] = {"reason": "approval_processing_failed", "message": str(exc)}
        task["updated_at"] = _now_iso()
        _save_task(task)
        _append_task_event(task, "ai.task.failed", {"reason": "approval_processing_failed", "message": str(exc)}, source="exception")
        return _error_response(500, "APPROVAL_FAILED", "Failed while processing approval.", task.get("trace_id", ""))


@app.websocket("/ws/ai/tasks/{task_id}")
async def ws_task(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        terminal_states = {"completed", "failed", "rejected"}
        seen_signatures = set()

        for _ in range(240):
            task = _load_task(task_id)
            if not task:
                await websocket.send_json({"error_code": "TASK_NOT_FOUND", "task_id": task_id})
                return

            steps = task.get("steps", [])
            total_steps = max(1, len(steps))
            for index, step in enumerate(steps, start=1):
                signature = (
                    step.get("step_name"),
                    step.get("status"),
                    step.get("attempt"),
                    step.get("started_at"),
                    step.get("ended_at"),
                )
                if signature in seen_signatures:
                    continue
                seen_signatures.add(signature)
                status = _public_step_status(step.get("status"))
                msg = step.get("output_summary") or f"{step.get('step_name')} is {status}"
                await websocket.send_json(
                    {
                        "task_id": task_id,
                        "trace_id": task["trace_id"],
                        "state": task["state"],
                        "current_step": step.get("step_name"),
                        "step_status": status,
                        "progress_pct": int((index / total_steps) * 100),
                        "message": msg,
                        "timestamp": _now_iso(),
                    }
                )

            task_signature = (
                "task_state",
                task.get("state"),
                task.get("approval_target"),
                task.get("updated_at"),
            )
            if task_signature not in seen_signatures:
                seen_signatures.add(task_signature)
                status_message = "Task update"
                if task.get("state") == "awaiting_approval":
                    target = task.get("approval_target") or "outreach_draft"
                    status_message = f"Awaiting human approval for {target}"
                elif task.get("state") == "shortlist_ready":
                    status_message = "Shortlist ready — select candidates, then POST /ai/tasks/.../outreach/generate"
                elif task.get("state") == "approved":
                    status_message = "Recruiter approved — outreach send requested"
                elif task.get("state") in terminal_states:
                    status_message = f"Task {task.get('state')}"
                await websocket.send_json(
                    {
                        "task_id": task_id,
                        "trace_id": task["trace_id"],
                        "state": task.get("state"),
                        "current_step": task.get("current_step"),
                        "step_status": "completed" if task.get("state") != "processing" else "running",
                        "progress_pct": 100 if task.get("state") != "processing" else 75,
                        "message": status_message,
                        "timestamp": _now_iso(),
                    }
                )

            if task.get("state") in terminal_states:
                return
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


@app.get("/ai/metrics/summary")
async def ai_metrics_summary():
    records: List[Dict[str, Any]] = []
    collection = _get_task_collection()
    if collection is not None:
        try:
            for record in collection.find():
                record.pop("_id", None)
                records.append(record)
        except Exception:
            records = list(TASKS.values())
    else:
        records = list(TASKS.values())

    approved = 0
    edited = 0
    rejected = 0
    scores: List[float] = []
    completion_ms: List[float] = []
    tasks_by_state: Dict[str, int] = {}

    for task in records:
        state = task.get("state") or "unknown"
        tasks_by_state[state] = tasks_by_state.get(state, 0) + 1
        approval = task.get("approval") or {}
        decision = approval.get("decision")
        if decision == "approve":
            approved += 1
        elif decision == "edit":
            edited += 1
        elif decision == "reject":
            rejected += 1

        result = task.get("result") or {}
        shortlist = result.get("shortlist") or []
        for candidate in shortlist:
            score = candidate.get("score")
            if isinstance(score, (int, float)):
                scores.append(float(score))
            else:
                alias_score = candidate.get("match_score")
                if isinstance(alias_score, (int, float)):
                    scores.append(float(alias_score))

        created_at = task.get("created_at")
        updated_at = task.get("updated_at")
        if created_at and updated_at:
            try:
                start_dt = _parse_dt(created_at)
                end_dt = _parse_dt(updated_at)
                if start_dt and end_dt and end_dt >= start_dt:
                    completion_ms.append((end_dt - start_dt).total_seconds() * 1000)
            except Exception:
                pass

    avg_shortlist_score = round(sum(scores) / len(scores), 4) if scores else 0.0
    total_reviewed = approved + edited + rejected
    average_completion_time_ms = round(sum(completion_ms) / len(completion_ms), 2) if completion_ms else 0.0
    approval_rate = round(approved / total_reviewed, 4) if total_reviewed else 0.0
    edit_rate = round(edited / total_reviewed, 4) if total_reviewed else 0.0
    rejection_rate = round(rejected / total_reviewed, 4) if total_reviewed else 0.0
    return {
        "total_tasks": len(records),
        "reviewed_tasks": total_reviewed,
        "approval_counts": {"approved": approved, "edited": edited, "rejected": rejected},
        "approval_rate": approval_rate,
        "avg_shortlist_score": avg_shortlist_score,
        "approved_tasks": approved,
        "edited_tasks": edited,
        "rejected_tasks": rejected,
        "edit_rate": edit_rate,
        "rejection_rate": rejection_rate,
        "avg_match_score": avg_shortlist_score,
        "average_completion_time_ms": average_completion_time_ms,
        "tasks_by_state": tasks_by_state,
    }


@app.get("/ai/metrics")
async def ai_metrics_alias():
    return await ai_metrics_summary()


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/ai/health")
async def ai_health_alias():
    """Same as /health but reachable via gateway /api/ai/health."""
    return {"status": "ok", "service": "linkedin-agentic-ai"}
