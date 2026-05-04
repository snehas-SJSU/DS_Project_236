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
from concurrent.futures import ThreadPoolExecutor
from datetime import datetime, timezone
from pathlib import Path
from typing import Any, Dict, List, Optional
from urllib import error as urlerror
from urllib import request as urlrequest

try:
    from dotenv import load_dotenv
    load_dotenv(Path(__file__).resolve().parent / ".env", override=False)
except ImportError:
    pass

from fastapi import FastAPI, Query, WebSocket, WebSocketDisconnect
from fastapi.responses import JSONResponse
from pydantic import BaseModel, Field

app = FastAPI(title="LinkedIn AgenticAI Service")

# ---------------------------------------------------------------------------
# Config — single source of truth for all env-based settings (C6)
# ---------------------------------------------------------------------------
class Config:
    # Kafka
    KAFKA_BROKERS: List[str] = [
        s.strip()
        for s in (
            os.getenv("AI_KAFKA_BROKERS")
            or os.getenv("KAFKA_BROKERS")
            or os.getenv("KAFKA_BROKER")
            or os.getenv("KAFKA_BOOTSTRAP_SERVERS")
            or "localhost:29092"
        ).split(",")
        if s.strip()
    ]
    KAFKA_CONSUMER_GROUP: str = os.getenv("AI_CONSUMER_GROUP", "ai-service-supervisor")
    SEND_TOPIC: str = os.getenv("AI_SEND_TOPIC", "outreach.requests")

    # Groq
    GROQ_API_KEY: str = (os.getenv("GROQ_API_KEY", "") or "").strip()
    GROQ_MODEL: str = (os.getenv("AI_GROQ_MODEL", "llama-3.1-8b-instant") or "llama-3.1-8b-instant").strip()

    # Embedding
    EMBEDDING_PROVIDER: str = (os.getenv("AI_EMBEDDING_PROVIDER", "local") or "local").strip().lower()
    EMBEDDING_WEIGHT: float = max(0.0, min(1.0, float(os.getenv("AI_EMBEDDING_WEIGHT", "0.4") or "0.4")))
    EMBEDDING_CACHE_TTL: int = max(30, int(os.getenv("AI_EMBEDDING_CACHE_TTL_SECONDS", "3600") or "3600"))

    # Service URLs (C5)
    URLS: Dict[str, str] = {
        "member":       os.getenv("AI_MEMBER_API_URL",       "http://127.0.0.1:4000/api/members/get"),
        "job":          os.getenv("AI_JOB_API_URL",          "http://127.0.0.1:4000/api/jobs/get"),
        "applications": os.getenv("AI_APPLICATIONS_API_URL", "http://127.0.0.1:4000/api/applications/byJob"),
        "threads_open": os.getenv("AI_THREADS_OPEN_URL",     "http://127.0.0.1:4000/api/threads/open"),
        "messages_send":os.getenv("AI_MESSAGES_SEND_URL",    "http://127.0.0.1:4000/api/messages/send"),
    }
    SKILLS_BASE_URL: str = (os.getenv("AI_SKILLS_BASE_URL", "") or "").strip().rstrip("/")

    # Feature flags
    SHORTLIST_TOP_K: int = max(1, min(50, int(os.getenv("AI_SHORTLIST_TOP_K", "5") or "5")))
    HITL_REQUIRED: bool = os.getenv("AI_SHORTLIST_HITL_REQUIRED", "false").strip().lower() in {"1", "true", "yes", "on"}
    DIRECT_SEND_ENABLED: bool = os.getenv("AI_DIRECT_SEND_ENABLED", "true").strip().lower() in {"1", "true", "yes", "on"}
    HTTP_USER_AGENT: str = (os.getenv("AI_HTTP_USER_AGENT") or "LinkedInAgenticAI/1.0 (Python)").strip()

    # MongoDB
    MONGO_URL: str = os.getenv("MONGO_URL", "mongodb://127.0.0.1:27017")
    MONGO_DB: str = os.getenv("MONGO_DB", "linkedin_sim")
    MONGO_TASKS_COLLECTION: str = os.getenv("MONGO_AI_TASKS_COLLECTION", "ai_tasks")
    MONGO_EVENTS_COLLECTION: str = os.getenv("MONGO_AI_TASK_EVENTS_COLLECTION", "ai_task_events")
    MONGO_OUTREACH_COLLECTION: str = os.getenv("MONGO_AI_OUTREACH_COLLECTION", "outreach_drafts")
    MONGO_PARSED_RESUMES_COLLECTION: str = os.getenv("MONGO_AI_PARSED_RESUMES_COLLECTION", "parsed_resumes")
    MONGO_STEPS_COLLECTION: str = os.getenv("MONGO_AI_STEPS_COLLECTION", "ai_steps")

    # Redis
    REDIS_URL: str = os.getenv("REDIS_URL", "redis://127.0.0.1:6379/0")

cfg = Config()

# ---------------------------------------------------------------------------
# Constants
# ---------------------------------------------------------------------------
TASK_TYPE_CANDIDATE_SHORTLIST = "candidate_shortlist"
TASK_TYPE_GENERATE_OUTREACH = "generate_outreach"
VALID_DECISIONS = {"approve", "edit", "reject"}
STEP_SEQUENCE_SHORTLIST = ["discover_candidates", "resume_parse", "match_score", "shortlist"]
STEP_SEQUENCE_OUTREACH = ["outreach_draft"]
FAILED_TOPIC = "ai.failed.events"
SEND_REQUESTED_EVENT = "ai.send.requested"

_consumer_thread: Optional[threading.Thread] = None
_consumer_running = False

logger = logging.getLogger("ai-service")
if not logger.handlers:
    logging.basicConfig(level=logging.INFO)

# ---------------------------------------------------------------------------
# Fixtures — loaded from file or inline defaults (C4)
# ---------------------------------------------------------------------------
_FIXTURE_DIR = Path(__file__).resolve().parent

def _load_fixtures() -> tuple:
    fixtures_path = _FIXTURE_DIR / "fixtures.json"
    if fixtures_path.exists():
        try:
            data = json.loads(fixtures_path.read_text(encoding="utf-8"))
            return data.get("candidates", {}), data.get("jobs", {})
        except Exception:
            pass
    candidates = {
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
    jobs = {
        "J-LIVE-1": {
            "job_id": "J-LIVE-1",
            "title": "Platform Engineer",
            "required_skills": ["python", "kafka", "fastapi", "redis"],
            "location": "San Jose",
            "seniority": "mid",
        }
    }
    return candidates, jobs

_DEFAULT_CANDIDATES, _DEFAULT_JOBS = _load_fixtures()
_profile_data_cache: Optional[Dict[str, Dict[str, Any]]] = None
_job_data_cache: Optional[Dict[str, Dict[str, Any]]] = None
_embedding_cache_local: Dict[str, Dict[str, Any]] = {}

# ---------------------------------------------------------------------------
# Sentence-transformers local embedding (F3)
# ---------------------------------------------------------------------------
_st_model = None

def _get_st_model():
    global _st_model
    if _st_model is not None:
        return _st_model
    try:
        from sentence_transformers import SentenceTransformer
        _st_model = SentenceTransformer("all-MiniLM-L6-v2")
        logger.info("sentence-transformers model loaded: all-MiniLM-L6-v2")
    except Exception as e:
        logger.warning("sentence-transformers unavailable (%s) — falling back to hashed embeddings", e)
        _st_model = None
    return _st_model

# ---------------------------------------------------------------------------
# Kafka
# ---------------------------------------------------------------------------
try:
    from kafka import KafkaConsumer, KafkaProducer
    _producer = None

    def get_producer():
        global _producer
        if _producer is None:
            _producer = KafkaProducer(
                bootstrap_servers=cfg.KAFKA_BROKERS,
                value_serializer=lambda v: json.dumps(v).encode("utf-8"),
                acks="all",
                retries=3,
            )
        return _producer
except Exception:
    KafkaConsumer = None
    get_producer = None

# ---------------------------------------------------------------------------
# MongoDB
# ---------------------------------------------------------------------------
try:
    from pymongo import MongoClient
    _mongo_client = None
    _mongo_collection = None
    _mongo_event_collection = None
    _mongo_outreach_collection = None
    _mongo_parsed_resumes_collection = None
    _mongo_steps_collection = None
except Exception:
    MongoClient = None
    _mongo_client = None
    _mongo_collection = None
    _mongo_event_collection = None
    _mongo_outreach_collection = None
    _mongo_parsed_resumes_collection = None
    _mongo_steps_collection = None

# ---------------------------------------------------------------------------
# Redis
# ---------------------------------------------------------------------------
try:
    from redis import Redis
    _redis_client = None
except Exception:
    Redis = None
    _redis_client = None

# In-memory task store — capped to avoid unbounded growth
TASKS: Dict[str, Dict[str, Any]] = {}
TASKS_MAX_SIZE = 2000  # evict oldest terminal tasks beyond this

# ===========================================================================
# Utility helpers
# ===========================================================================

def _now_iso() -> str:
    return datetime.now(timezone.utc).strftime("%Y-%m-%dT%H:%M:%SZ")


def _parse_dt(value: Any) -> Optional[datetime]:
    if not isinstance(value, str) or not value:
        return None
    try:
        return datetime.fromisoformat(value)
    except ValueError:
        return None


def _error_response(status_code: int, error_code: str, message: str,
                    trace_id: str = "", details: Optional[dict] = None):
    return JSONResponse(
        status_code=status_code,
        content={
            "error_code": error_code,
            "message": message,
            "details": details or {},
            "trace_id": trace_id,
        },
    )


def _outbound_headers(extra: Optional[Dict[str, str]] = None) -> Dict[str, str]:
    base: Dict[str, str] = {
        "User-Agent": cfg.HTTP_USER_AGENT,
        "Content-Type": "application/json",
    }
    if extra:
        base.update(extra)
    return base


# C1 — single merged HTTP helper
def _post_json(
    url: str,
    payload: Dict[str, Any],
    timeout_seconds: float = 5.0,
    headers: Optional[Dict[str, str]] = None,
) -> Optional[Any]:
    request_headers = _outbound_headers(headers)
    body = json.dumps(payload).encode("utf-8")
    req = urlrequest.Request(url, data=body, headers=request_headers, method="POST")
    try:
        with urlrequest.urlopen(req, timeout=timeout_seconds) as response:
            data = response.read().decode("utf-8")
            parsed = json.loads(data)
            return parsed if isinstance(parsed, (dict, list)) else None
    except urlerror.HTTPError as e:
        try:
            err_body = e.read().decode("utf-8")[:500]
        except Exception:
            err_body = "(could not read body)"
        logger.error("_post_json HTTPError url=%s status=%s reason=%s body=%s", url, e.code, e.reason, err_body)
        return None
    except urlerror.URLError as e:
        logger.error("_post_json URLError url=%s reason=%s", url, e.reason)
        return None
    except TimeoutError as e:
        logger.error("_post_json TimeoutError url=%s timeout=%ss", url, timeout_seconds)
        return None
    except (ValueError, json.JSONDecodeError) as e:
        logger.error("_post_json parse error url=%s type=%s msg=%s", url, type(e).__name__, str(e)[:200])
        return None
    except Exception as e:
        logger.exception("_post_json UNEXPECTED url=%s type=%s msg=%s", url, type(e).__name__, str(e)[:200])
        return None

# ===========================================================================
# Redis
# ===========================================================================

def _get_redis_client():
    global _redis_client
    if Redis is None:
        return None
    if _redis_client is not None:
        return _redis_client
    try:
        _redis_client = Redis.from_url(cfg.REDIS_URL, socket_connect_timeout=1, socket_timeout=1)
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

# ===========================================================================
# MongoDB collections
# ===========================================================================

def _get_task_collection():
    global _mongo_client, _mongo_collection, _mongo_event_collection, _mongo_outreach_collection, \
           _mongo_parsed_resumes_collection, _mongo_steps_collection
    if MongoClient is None:
        return None
    if _mongo_collection is not None:
        return _mongo_collection
    try:
        _mongo_client = MongoClient(cfg.MONGO_URL, serverSelectionTimeoutMS=1500)
        _mongo_client.admin.command("ping")
        db = _mongo_client[cfg.MONGO_DB]

        _mongo_collection = db[cfg.MONGO_TASKS_COLLECTION]
        _mongo_collection.create_index("task_id", unique=True)
        _mongo_collection.create_index("trace_id")
        _mongo_collection.create_index([("actor_id", 1), ("client_request_id", 1)])
        _mongo_collection.create_index("created_at")

        _mongo_event_collection = db[cfg.MONGO_EVENTS_COLLECTION]
        _mongo_event_collection.create_index("task_id")
        _mongo_event_collection.create_index("trace_id")
        _mongo_event_collection.create_index("timestamp")

        # outreach_drafts collection
        _mongo_outreach_collection = db[cfg.MONGO_OUTREACH_COLLECTION]
        _mongo_outreach_collection.create_index("task_id")
        _mongo_outreach_collection.create_index("member_id")
        _mongo_outreach_collection.create_index("approval_status")
        _mongo_outreach_collection.create_index("created_at")

        # parsed_resumes collection — cache parsed resume by member_id
        _mongo_parsed_resumes_collection = db[cfg.MONGO_PARSED_RESUMES_COLLECTION]
        _mongo_parsed_resumes_collection.create_index("member_id", unique=True)
        _mongo_parsed_resumes_collection.create_index("cached_at")

        # ai_steps collection — one doc per pipeline step for observability
        _mongo_steps_collection = db[cfg.MONGO_STEPS_COLLECTION]
        _mongo_steps_collection.create_index("task_id")
        _mongo_steps_collection.create_index("trace_id")
        _mongo_steps_collection.create_index([("task_id", 1), ("step_name", 1)])

    except Exception:
        _mongo_collection = None
        _mongo_event_collection = None
        _mongo_outreach_collection = None
        _mongo_parsed_resumes_collection = None
        _mongo_steps_collection = None
    return _mongo_collection


def _get_task_event_collection():
    global _mongo_event_collection
    if _mongo_event_collection is not None:
        return _mongo_event_collection
    _get_task_collection()
    return _mongo_event_collection


def _get_outreach_collection():
    global _mongo_outreach_collection
    if _mongo_outreach_collection is not None:
        return _mongo_outreach_collection
    _get_task_collection()
    return _mongo_outreach_collection


def _get_parsed_resumes_collection():
    global _mongo_parsed_resumes_collection
    if _mongo_parsed_resumes_collection is not None:
        return _mongo_parsed_resumes_collection
    _get_task_collection()
    return _mongo_parsed_resumes_collection


def _get_steps_collection():
    global _mongo_steps_collection
    if _mongo_steps_collection is not None:
        return _mongo_steps_collection
    _get_task_collection()
    return _mongo_steps_collection

# ===========================================================================
# Kafka publish / events
# ===========================================================================

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
        collection.insert_one({
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
        })
    except Exception:
        pass


def _publish_event(topic: str, event_type: str, task: Dict[str, Any], payload: Dict[str, Any]):
    if not get_producer:
        _append_task_event(task, event_type, payload, topic=topic, source="no_kafka_producer")
        return
    try:
        message = {
            "event_type": event_type,
            "trace_id": task["trace_id"],
            "timestamp": _now_iso(),
            "actor_id": task["actor_id"],
            "entity": {"entity_type": "ai_task", "entity_id": task["task_id"]},
            "payload": payload,
            "idempotency_key": str(uuid.uuid4()),
        }
        _append_task_event(task, event_type, payload, topic=topic, source="ai_service")
        get_producer().send(topic, value=message)
    except Exception:
        _append_task_event(task, event_type, payload, topic=topic, source="publish_failed")


def _publish_failed_envelope(task: Dict[str, Any], reason: str):
    _publish_event(
        FAILED_TOPIC, "ai.failed", task,
        {"task_type": task.get("task_type"), "step": task.get("current_step"), "data": {"reason": reason}},
    )

# ===========================================================================
# C8 — single state transition helper
# ===========================================================================

def _transition_state(
    task: Dict[str, Any],
    new_state: str,
    event_type: str,
    kafka_topic: str,
    event_payload: Dict[str, Any],
    *,
    approval_target: Optional[str] = None,
    current_step: Optional[str] = None,
    error: Optional[Any] = None,
    source: str = "state_transition",
):
    task["state"] = new_state
    task["updated_at"] = _now_iso()
    if approval_target is not None:
        task["approval_target"] = approval_target
    if current_step is not None:
        task["current_step"] = current_step
    if error is not None:
        task["error"] = error
    _save_task(task)
    _append_task_event(task, event_type, event_payload, source=source)
    _publish_event(kafka_topic, event_type, task, event_payload)

# ===========================================================================
# Task persistence
# ===========================================================================

def _save_task(task: Dict[str, Any]):
    TASKS[task["task_id"]] = task
    # Evict oldest terminal tasks if dict grows too large
    if len(TASKS) > TASKS_MAX_SIZE:
        terminal = [k for k, v in TASKS.items() if v.get("state") in {"completed", "failed", "rejected"}]
        for k in terminal[:len(TASKS) - TASKS_MAX_SIZE]:
            TASKS.pop(k, None)
    collection = _get_task_collection()
    if collection is None:
        return
    try:
        collection.replace_one({"task_id": task["task_id"]}, task, upsert=True)
    except Exception:
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

# ===========================================================================
# outreach_drafts collection helpers
# ===========================================================================

def _save_outreach_draft(
    task: Dict[str, Any],
    member_id: str,
    draft_text: str,
    approval_status: str = "pending",
    edited_text: Optional[str] = None,
):
    collection = _get_outreach_collection()
    if collection is None:
        return
    try:
        doc = {
            "task_id": task.get("task_id"),
            "trace_id": task.get("trace_id"),
            "job_id": task.get("job_id"),
            "recruiter_id": task.get("actor_id"),
            "member_id": member_id,
            "draft_text": draft_text,
            "approval_status": approval_status,
            "edited_text": edited_text,
            "decided_at": _now_iso() if approval_status != "pending" else None,
            "created_at": _now_iso(),
        }
        collection.update_one(
            {"task_id": task.get("task_id"), "member_id": member_id},
            {"$set": doc},
            upsert=True,
        )
    except Exception:
        pass


def _update_outreach_draft_status(
    task_id: str,
    member_id: str,
    approval_status: str,
    edited_text: Optional[str] = None,
):
    collection = _get_outreach_collection()
    if collection is None:
        return
    try:
        collection.update_one(
            {"task_id": task_id, "member_id": member_id},
            {"$set": {
                "approval_status": approval_status,
                "edited_text": edited_text,
                "decided_at": _now_iso(),
            }},
        )
    except Exception:
        pass

# ===========================================================================
# parsed_resumes collection helpers
# ===========================================================================

def _get_cached_parsed_resume(member_id: str) -> Optional[Dict[str, Any]]:
    collection = _get_parsed_resumes_collection()
    if collection is None:
        return None
    try:
        record = collection.find_one({"member_id": member_id})
        if not record:
            return None
        record.pop("_id", None)
        return record
    except Exception:
        return None


def _save_parsed_resume(member_id: str, parsed: Dict[str, Any]):
    collection = _get_parsed_resumes_collection()
    if collection is None:
        return
    try:
        doc = dict(parsed)
        doc["member_id"] = member_id
        doc["cached_at"] = _now_iso()
        collection.update_one(
            {"member_id": member_id},
            {"$set": doc},
            upsert=True,
        )
    except Exception:
        pass

# ===========================================================================
# ai_steps collection helpers
# ===========================================================================

def _save_step(
    task: Dict[str, Any],
    step_name: str,
    step_input: Optional[Dict[str, Any]],
    step_output: Optional[Dict[str, Any]],
    status: str = "completed",
    error: Optional[str] = None,
):
    collection = _get_steps_collection()
    if collection is None:
        return
    try:
        collection.update_one(
            {"task_id": task.get("task_id"), "step_name": step_name},
            {"$set": {
                "task_id": task.get("task_id"),
                "trace_id": task.get("trace_id"),
                "step_name": step_name,
                "status": status,
                "input": step_input or {},
                "output": step_output or {},
                "error": error,
                "timestamp": _now_iso(),
            }},
            upsert=True,
        )
    except Exception:
        pass

# ===========================================================================
# Groq — with retry
# ===========================================================================

def _groq_chat(
    messages: List[Dict[str, str]],
    *,
    max_tokens: int = 1024,
    temperature: float = 0.2,
    json_object: bool = False,
    timeout_seconds: float = 45.0,
) -> Optional[str]:
    if not cfg.GROQ_API_KEY:
        return None
    payload: Dict[str, Any] = {
        "model": cfg.GROQ_MODEL,
        "messages": messages,
        "max_tokens": max_tokens,
        "temperature": temperature,
    }
    if json_object:
        payload["response_format"] = {"type": "json_object"}

    # Retry up to 3 times with exponential backoff
    for attempt in range(3):
        response = _post_json(
            "https://api.groq.com/openai/v1/chat/completions",
            payload,
            headers={"Authorization": f"Bearer {cfg.GROQ_API_KEY}"},
            timeout_seconds=timeout_seconds,
        )
        if response:
            choices = response.get("choices")
            if isinstance(choices, list) and choices:
                first = choices[0]
                if isinstance(first, dict):
                    message = first.get("message")
                    if isinstance(message, dict):
                        content = message.get("content")
                        if isinstance(content, str):
                            return content
        if attempt < 2:
            time.sleep(2 ** attempt)  # 1s, 2s backoff
    return None


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

# ===========================================================================
# Embeddings (F3 — local sentence-transformers wired properly)
# ===========================================================================

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
            _embedding_cache_local[cache_key] = {"vector": vector, "expires_at": now + cfg.EMBEDDING_CACHE_TTL}
            return [float(x) for x in vector]
    except Exception:
        return None
    return None


def _write_embedding_cache(cache_key: str, vector: List[float]):
    ttl = cfg.EMBEDDING_CACHE_TTL
    now = time.time()
    _embedding_cache_local[cache_key] = {"vector": list(vector), "expires_at": now + ttl}
    client = _get_redis_client()
    if client is None:
        return
    try:
        client.set(cache_key, json.dumps({"vector": vector}), ex=ttl)
    except Exception:
        pass


def _normalize_vector(vec: List[float]) -> List[float]:
    if not vec:
        return []
    converted = [float(x) for x in vec]
    norm = math.sqrt(sum(x * x for x in converted))
    if norm == 0:
        return converted
    return [x / norm for x in converted]


def _tokenize(text: str) -> List[str]:
    return re.findall(r"[a-z0-9\+\#\.]+", (text or "").lower())


def _hashed_embedding(text: str, dims: int = 128) -> List[float]:
    vec = [0.0] * dims
    for token in _tokenize(text):
        index = hash(token) % dims
        vec[index] += 1.0
    norm = math.sqrt(sum(x * x for x in vec))
    if norm == 0:
        return vec
    return [x / norm for x in vec]


def _local_st_embedding(text: str) -> Optional[List[float]]:
    model = _get_st_model()
    if model is None:
        return None
    try:
        vector = model.encode(text, normalize_embeddings=True).tolist()
        return vector
    except Exception:
        return None


def _semantic_embedding(text: str) -> Dict[str, Any]:
    input_text = (text or "").strip()
    if not input_text:
        return {"vector": _hashed_embedding(""), "provider": "hashed", "model": "hash-v1", "source": "empty"}

    provider = cfg.EMBEDDING_PROVIDER
    if provider in {"none", "hashed"}:
        return {"vector": _hashed_embedding(input_text), "provider": "hashed", "model": "hash-v1", "source": "local"}

    # Local sentence-transformers — default and only external provider
    model_name = "all-MiniLM-L6-v2"
    cache_key = _embedding_cache_key("local", model_name, input_text)
    cached = _read_embedding_cache(cache_key)
    if cached:
        return {"vector": cached, "provider": "local", "model": model_name, "source": "cache"}
    vector = _local_st_embedding(input_text)
    if vector:
        _write_embedding_cache(cache_key, vector)
        return {"vector": vector, "provider": "local", "model": model_name, "source": "provider"}
    # Fallback if sentence-transformers not installed
    return {"vector": _hashed_embedding(input_text), "provider": "hashed", "model": "hash-v1", "source": "fallback"}


def _cosine_similarity(vec_a: List[float], vec_b: List[float]) -> float:
    if not vec_a or not vec_b:
        return 0.0
    return max(0.0, min(1.0, sum(a * b for a, b in zip(vec_a, vec_b))))

# ===========================================================================
# Skills / profile utilities
# ===========================================================================

def _normalize_skill(skill: str) -> str:
    return (skill or "").strip().lower()


def _extract_years_experience(text: str) -> int:
    matches = re.findall(r"(\d{1,2})\s*\+?\s*(?:years?|yrs?)", (text or "").lower())
    if not matches:
        return 0
    return max(int(v) for v in matches)


def _infer_seniority_from_text(text: str, years: int) -> str:
    lowered = (text or "").lower()
    if "senior" in lowered or years >= 6:
        return "senior"
    if "junior" in lowered or years <= 2:
        return "junior"
    return "mid"


def _load_json_map(path_env_key: str, fallback: Dict[str, Dict[str, Any]]) -> Dict[str, Dict[str, Any]]:
    path = os.getenv(path_env_key, "").strip()
    if not path:
        return dict(fallback)
    try:
        with Path(path).open("r", encoding="utf-8") as f:
            data = json.load(f)
            if isinstance(data, dict):
                return data
    except Exception:
        pass
    return dict(fallback)


def _get_candidate_profiles() -> Dict[str, Dict[str, Any]]:
    global _profile_data_cache
    if _profile_data_cache is None:
        _profile_data_cache = _load_json_map("AI_CANDIDATE_PROFILES_PATH", _DEFAULT_CANDIDATES)
    return _profile_data_cache


def _get_job_profiles() -> Dict[str, Dict[str, Any]]:
    global _job_data_cache
    if _job_data_cache is None:
        _job_data_cache = _load_json_map("AI_JOB_PROFILES_PATH", _DEFAULT_JOBS)
    return _job_data_cache


def _load_member_profile(member_id: str) -> Dict[str, Any]:
    profile = _post_json(cfg.URLS["member"], {"member_id": member_id})
    if not profile:
        return {}
    resume_text = profile.get("resume_text") or profile.get("about") or profile.get("summary") or ""
    location = profile.get("location") or ", ".join(
        p for p in [profile.get("city"), profile.get("state"), profile.get("country")] if p
    )
    seniority = _infer_seniority_from_text(
        f"{profile.get('title', '')} {profile.get('headline', '')}",
        _extract_years_experience(resume_text),
    )
    full_name = (
        profile.get("name")
        or " ".join(p for p in [profile.get("first_name"), profile.get("last_name")] if p).strip()
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
    job = _post_json(cfg.URLS["job"], {"job_id": job_id})
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
        "industry": job.get("industry") or job.get("company_industry") or ""
    }


def _job_profile_for(job_id: str) -> Dict[str, Any]:
    service_profile = _load_job_profile(job_id)
    if service_profile:
        return service_profile
    return _get_job_profiles().get(job_id, {
        "job_id": job_id,
        "title": "Software Engineer",
        "required_skills": ["python", "kafka", "fastapi"],
        "location": "San Jose",
        "seniority": "mid",
    })

# ===========================================================================
# C7 — single candidate normalization helper
# ===========================================================================

def _normalize_candidate(candidate: Dict[str, Any]) -> Dict[str, Any]:
    out = dict(candidate)
    matched = out.get("matched_skills") or out.get("skills_matched") or []
    missing = out.get("missing_skills", [])
    total_skills = len(matched) + len(missing)
    out["candidate_id"] = out.get("candidate_id") or out.get("member_id")
    out["match_score"] = out.get("match_score") or out.get("score")
    out["skills_overlap"] = (
        round(len(matched) / total_skills, 4) if total_skills else out.get("skills_overlap", 0.0)
    )
    out["skills_matched"] = matched
    out.setdefault("name", out.get("candidate_id"))
    out.setdefault("headline", "Candidate")
    out.setdefault("location", "Unknown")
    out.setdefault("seniority", "Unknown")
    out.setdefault("rationale", "Ranked by hybrid embedding and rule score.")
    return out

# ===========================================================================
# Task public view helpers
# ===========================================================================

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
            result_out["shortlist"] = [_normalize_candidate(c) if isinstance(c, dict) else c for c in shortlist]
        out["result"] = result_out

    if isinstance(out.get("approval"), dict):
        approval = dict(out["approval"])
        if "original_text" not in approval or approval.get("original_text") is None:
            if approval.get("target") == "outreach_draft":
                res_preview = out.get("result") or {}
                approval["original_text"] = res_preview.get("outreach_draft") or (
                    json.dumps(res_preview.get("outreach_drafts") or [])[:2000]
                    if res_preview.get("outreach_drafts") else None
                )
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
            "created_at": out.get("created_at"),
            "updated_at": out.get("updated_at"),
        }
    return out

# ===========================================================================
# Resume parsing
# ===========================================================================

def _resume_parse_heuristic(resume_text: str, profile: Dict[str, Any], member_id: str) -> Dict[str, Any]:
    tokens = set(_tokenize(resume_text))
    skill_catalog = {"python", "kafka", "fastapi", "redis", "docker", "react", "java", "spring", "mysql", "node.js"}
    skills = sorted(s for s in skill_catalog if s in tokens)
    profile_skills = profile.get("skills") if isinstance(profile.get("skills"), list) else []
    if profile_skills:
        merged_set = set(skills)
        for raw in profile_skills:
            norm = _normalize_skill(raw)
            if norm:
                merged_set.add(norm)
        skills = sorted(merged_set)
    years = _extract_years_experience(resume_text)
    seniority = profile.get("seniority") or _infer_seniority_from_text(
        f"{profile.get('title', '')} {profile.get('headline', '')}", years
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
        max_tokens=800, temperature=0.1, json_object=True, timeout_seconds=50.0,
    )
    if not raw:
        return None
    return _parse_llm_json_object(raw)


def _resume_parse_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    member_id = (body.get("member_id") or "").strip()
    text = body.get("text") or ""

    # F2: always check parsed_resumes cache first — avoid re-parsing same candidate.
    # Previously this was gated on `not text`, which forced a Groq call whenever the
    # discover step provided application_resume_text_by_member.
    if member_id:
        cached = _get_cached_parsed_resume(member_id)
        if cached:
            cached["from_cache"] = True
            return cached

    profile = _load_member_profile(member_id) or _get_candidate_profiles().get(member_id, {})
    resume_text = text or profile.get("resume_text", "")
    base = _resume_parse_heuristic(resume_text, profile, member_id)
    parse_provider = "heuristic"

    if cfg.GROQ_API_KEY and len((resume_text or "").strip()) > 30:
        groq_data = _resume_parse_groq(resume_text)
        if groq_data:
            parse_provider = "groq"
            g_skills = groq_data.get("skills")
            if isinstance(g_skills, list):
                cleaned = [_normalize_skill(s.strip()) for s in g_skills if isinstance(s, str) and s.strip()]
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
                norm_edu = [
                    {"school": str(r.get("school") or "Unknown")[:200], "degree": str(r.get("degree") or "Unknown")[:200]}
                    for r in edu[:6] if isinstance(r, dict)
                ]
                if norm_edu:
                    base["education"] = norm_edu
            sen = groq_data.get("seniority")
            if isinstance(sen, str) and _normalize_skill(sen) in {"junior", "mid", "senior"}:
                base["seniority"] = _normalize_skill(sen)
            loc = groq_data.get("location")
            if isinstance(loc, str) and loc.strip():
                base["location"] = loc.strip()[:200]

    base["parse_provider"] = parse_provider
    base["from_cache"] = False

    # Persist to parsed_resumes collection for future cache hits
    if member_id:
        _save_parsed_resume(member_id, base)

    return base

# ===========================================================================
# Match scoring
# ===========================================================================

def _match_score_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    job_id = body.get("job_id") or ""
    parsed_profile = body.get("parsed_profile") or {}
    member_id = parsed_profile.get("member_id") or body.get("member_id")
    job_profile = _job_profile_for(job_id)
    job_skills = {_normalize_skill(s) for s in job_profile.get("required_skills", [])}
    candidate_skills = {_normalize_skill(s) for s in parsed_profile.get("skills", [])}

    # --- Rule-based scoring factors ---
    overlap = len(job_skills.intersection(candidate_skills))
    skill_overlap = (overlap / len(job_skills)) if job_skills else 0.0

    location_score = 1.0 if _normalize_skill(parsed_profile.get("location", "")) == _normalize_skill(job_profile.get("location", "")) else 0.5

    seniority_map = {"junior": 1, "mid": 2, "senior": 3}
    expected = seniority_map.get(_normalize_skill(job_profile.get("seniority", "")), 2)
    actual = seniority_map.get(_normalize_skill(parsed_profile.get("seniority", "")), 2)
    seniority_score = max(0.0, 1.0 - (abs(expected - actual) * 0.3))

    # Industry scoring — candidate industries vs job industry
    job_industry = _normalize_skill(job_profile.get("industry") or job_profile.get("company_industry") or "")
    candidate_industries = [_normalize_skill(i) for i in (parsed_profile.get("industries") or [])]
    if job_industry and candidate_industries:
        industry_score = 1.0 if job_industry in candidate_industries else 0.4
    else:
        industry_score = 0.7  # neutral when data is missing

    # Weighted rule score: skills 50%, location 20%, seniority 20%, industry 10%
    rule_score = (
        (0.50 * skill_overlap) +
        (0.20 * location_score) +
        (0.20 * seniority_score) +
        (0.10 * industry_score)
    )

    # --- Embedding similarity ---
    job_text = " ".join([
        job_profile.get("title") or "",
        " ".join(str(s) for s in job_profile.get("required_skills", [])),
        job_profile.get("location") or "",
        job_profile.get("seniority") or "",
    ])
    candidate_text = " ".join([
        parsed_profile.get("resume_text", "") or "",
        " ".join(str(s) for s in (parsed_profile.get("skills", []) or [])),
        parsed_profile.get("location", "") or "",
        parsed_profile.get("seniority", "") or "",
    ])
    job_emb = _semantic_embedding(job_text)
    cand_emb = _semantic_embedding(candidate_text)
    embedding_score = _cosine_similarity(job_emb["vector"], cand_emb["vector"])

    ew = cfg.EMBEDDING_WEIGHT
    rw = 1.0 - ew
    final_score = round((ew * embedding_score) + (rw * rule_score), 4)
    matched_skills = sorted(job_skills.intersection(candidate_skills))
    missing_skills = sorted(job_skills.difference(candidate_skills))

    # --- Human-readable explanation ---
    explanation_parts = []
    if skill_overlap >= 0.7:
        explanation_parts.append("strong skills match")
    elif skill_overlap >= 0.4:
        explanation_parts.append("partial skills match")
    else:
        explanation_parts.append("weak skills match")
    if location_score == 1.0:
        explanation_parts.append("local candidate")
    if abs(expected - actual) == 0:
        explanation_parts.append("seniority aligns")
    elif abs(expected - actual) == 1:
        explanation_parts.append("seniority close")
    if industry_score == 1.0:
        explanation_parts.append("industry match")
    explanation = ", ".join(explanation_parts).capitalize() if explanation_parts else "Scored by hybrid matcher"

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
        "explanation": explanation,
        "score_breakdown": {
            "skills_overlap": round(skill_overlap, 4),
            "seniority": round(seniority_score, 4),
            "location": round(location_score, 4),
            "industry": round(industry_score, 4),
            "embedding_similarity": round(embedding_score, 4),
        },
        "embedding_score": round(embedding_score, 4),
        "rule_score": round(rule_score, 4),
        "embedding_weight": round(ew, 4),
        "rule_weight": round(rw, 4),
        "embedding_provider": cand_emb.get("provider") or "hashed",
        "embedding_model": cand_emb.get("model") or "hash-v1",
        "embedding_source": cand_emb.get("source") or "local",
        "skills_overlap": round(skill_overlap, 4),
        "matched_skills": matched_skills,
        "skills_matched": matched_skills,
        "missing_skills": missing_skills,
    }

# ===========================================================================
# Shortlist
# ===========================================================================

def _shortlist_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    job_id = body.get("job_id", "")
    scores = body.get("scores") or []
    top_k = int(body.get("top_k") or cfg.SHORTLIST_TOP_K)
    ranked = sorted(scores, key=lambda e: e.get("score", 0), reverse=True)
    candidates = [_normalize_candidate(dict(entry)) for entry in ranked[:top_k]]
    return {"job_id": job_id, "candidates": candidates}

# ===========================================================================
# C9 — Outreach draft (merged single code path)
# ===========================================================================

def _one_outreach_message(job_id: str, job_profile: Dict[str, Any], member_id: str, candidate_hint: str):
    """Returns (draft_text, provider)."""
    context = "\n".join([
        f"Job: {job_profile.get('title', '')} ({job_id})",
        f"Location: {job_profile.get('location', '')}; Seniority: {job_profile.get('seniority', '')}",
        f"Required skills: {', '.join(str(s) for s in (job_profile.get('required_skills') or [])[:20])}",
        f"Candidate {member_id}:",
        candidate_hint,
    ])
    draft: Optional[str] = None
    draft_provider = "template"
    if cfg.GROQ_API_KEY:
        system = (
            "You write concise, professional recruiter outreach messages (LinkedIn style). "
            "2–4 sentences. No placeholders. Do not invent company names if missing. "
            "Address this one candidate by name if provided, otherwise use a neutral greeting."
        )
        raw = _groq_chat(
            [{"role": "system", "content": system},
             {"role": "user", "content": f"{context}\n\nWrite one outreach message to this candidate only."}],
            max_tokens=400, temperature=0.35, timeout_seconds=35.0,
        )
        if raw and raw.strip():
            draft = raw.strip()
            draft_provider = "groq"
    if not draft:
        draft = (
            f"Hi — your background looks like a strong match for our {job_profile.get('title', 'open role')} "
            f"({job_id}). Would you be open to a brief chat this week?"
        )
    return draft, draft_provider


def _outreach_draft_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    """Unified outreach draft — works for both candidate_ids and legacy shortlist context."""
    job_id = body.get("job_id") or ""
    job_profile = _job_profile_for(job_id)

    # Resolve candidate list from either candidate_ids or shortlist
    candidate_ids = body.get("candidate_ids") or []
    if isinstance(candidate_ids, str):
        candidate_ids = [candidate_ids]
    candidate_ids = [str(x).strip() for x in candidate_ids if str(x).strip()]

    if not candidate_ids:
        shortlist = body.get("shortlist") or []
        candidate_ids = [
            (c.get("member_id") or c.get("candidate_id") or "")
            for c in shortlist if isinstance(c, dict)
        ]
        candidate_ids = [x for x in candidate_ids if x]

    if not candidate_ids:
        # Absolute fallback — generic message
        draft = (
            f"Hi — your background looks like a strong match for our "
            f"{job_profile.get('title', 'open role')} ({job_id}). "
            f"Would you be open to a brief chat this week?"
        )
        return {"draft": draft, "drafts": [], "draft_provider": "template"}

    drafts: List[Dict[str, Any]] = []
    providers: List[str] = []
    for mid in candidate_ids:
        profile = _load_member_profile(mid) or _get_candidate_profiles().get(mid, {})
        hint = "\n".join([
            f"name={profile.get('name') or mid}",
            f"headline={profile.get('headline') or profile.get('title', '')}",
            f"skills={profile.get('skills', [])}",
            f"resume_excerpt={(profile.get('resume_text') or '')[:800]}",
        ])
        text, prov = _one_outreach_message(job_id, job_profile, mid, hint)
        drafts.append({"member_id": mid, "name": profile.get("name") or mid, "draft": text})
        providers.append(prov)

    single = drafts[0]["draft"] if len(drafts) == 1 else None
    return {
        "draft": single,
        "drafts": drafts,
        "draft_provider": providers[0] if len(providers) == 1 else "mixed",
    }

# ===========================================================================
# Career coach
# ===========================================================================

def _career_coach_skill(body: Dict[str, Any]) -> Dict[str, Any]:
    member_id = (body.get("member_id") or "").strip()
    job_id = (body.get("job_id") or body.get("target_job_id") or "").strip()
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

    if not cfg.GROQ_API_KEY:
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
        max_tokens=700, temperature=0.35, json_object=True, timeout_seconds=40.0,
    )
    if not raw:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_failed"}
    parsed = _parse_llm_json_object(raw)
    if not parsed:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_bad_json"}
    items = parsed.get("suggestions")
    if not isinstance(items, list) or not items:
        return {"suggestions": default_suggestions, "coach_provider": "default_groq_shape"}
    out: List[Dict[str, str]] = [
        {"text": r.get("text", "").strip()[:400], "rationale": (r.get("rationale") or "").strip()[:300]}
        for r in items[:6] if isinstance(r, dict) and isinstance(r.get("text"), str) and r.get("text", "").strip()
    ]
    return {"suggestions": out or default_suggestions, "coach_provider": "groq" if out else "default_groq_empty"}

# ===========================================================================
# External outreach delivery
# ===========================================================================

def _fetch_applicant_rows(job_id: str, recruiter_id: Optional[str] = None) -> List[Dict[str, Any]]:
    job_id = (job_id or "").strip()
    if not job_id:
        return []
    rid = (recruiter_id or "").strip()
    payload: Dict[str, Any] = {"job_id": job_id}
    if rid:
        payload["recruiter_id"] = rid

    try:
        response = _post_json(
            cfg.URLS["applications"],
            payload,
            timeout_seconds=5.0
        )

        logger.debug(
            "APPLICATION API response: %d row(s)",
            len(response) if isinstance(response, list) else 0,
        )

        if isinstance(response, list):
            return response

        if isinstance(response, dict):
            return response.get("applications") or response.get("data") or []

        return []

    except Exception as e:
        logger.error("FETCH ERROR: %s", e)
        return []


def _deliver_outreach_direct(actor_id: str, job_id: str, messages: List[Dict[str, str]]) -> Dict[str, Any]:
    delivered = 0
    failed: List[Dict[str, str]] = []
    for row in messages:
        candidate_id = (row.get("candidate_id") or row.get("member_id") or "").strip()
        text = (row.get("text") or row.get("outreach_text") or "").strip()
        if not actor_id or not candidate_id or not text:
            failed.append({"candidate_id": candidate_id or "?", "reason": "missing_fields"})
            continue
        thread = _post_json(cfg.URLS["threads_open"], {"participant_a": actor_id, "participant_b": candidate_id}, timeout_seconds=5.0)
        thread_id = (thread or {}).get("thread_id") if isinstance(thread, dict) else None
        if not thread_id:
            failed.append({"candidate_id": candidate_id, "reason": "thread_open_failed"})
            continue
        sent = _post_json(
            cfg.URLS["messages_send"],
            {"thread_id": thread_id, "sender_id": actor_id, "text": f"[AI outreach | job {job_id}] {text}"},
            timeout_seconds=5.0,
        )
        if isinstance(sent, dict) and sent.get("message_id"):
            delivered += 1
        else:
            failed.append({"candidate_id": candidate_id, "reason": "message_send_failed"})
    return {"delivered": delivered, "failed": failed}

# ===========================================================================
# Pipeline
# ===========================================================================

def _step_template_for_type(task_type: str) -> List[Dict[str, Any]]:
    seq = STEP_SEQUENCE_OUTREACH if task_type == TASK_TYPE_GENERATE_OUTREACH else STEP_SEQUENCE_SHORTLIST
    return [
        {"step_name": step, "status": "pending", "started_at": None, "ended_at": None,
         "output_summary": None, "output_data": None, "attempt": 0, "error": None}
        for step in seq
    ]


def _invoke_skill(path: str, payload: Dict[str, Any], local_fallback):
    if cfg.SKILLS_BASE_URL:
        response = _post_json(f"{cfg.SKILLS_BASE_URL}{path}", payload, timeout_seconds=20.0)
        if isinstance(response, dict):
            return response
    return local_fallback(payload)


def _run_pipeline(task: Dict[str, Any]):
    logger.info("Pipeline started: %s", task["task_id"])
    _transition_state(
        task, "processing", "ai.task.processing", "ai.results",
        {"step": None}, current_step=None, approval_target=None,
    )

    outputs = {
        "discover_candidates": "Resolved candidate pool for this job",
        "resume_parse": "Parsed candidate profiles from resume text",
        "match_score": "Computed embedding-plus-rules match scores",
        "shortlist": "Generated ranked shortlist",
        "outreach_draft": "Prepared outreach draft(s)",
    }
    parsed_profiles: List[Dict[str, Any]] = []
    score_cards: List[Dict[str, Any]] = []
    shortlist_candidates: List[Dict[str, Any]] = []
    last_outreach_bundle: Optional[Dict[str, Any]] = None
    task_type = task.get("task_type") or TASK_TYPE_CANDIDATE_SHORTLIST

    for step in task["steps"]:
        step_name = step["step_name"]
        logger.info("Running step: %s | task: %s", step_name, task["task_id"])
        
        if step["status"] == "completed":
            continue

        success = False
        for _ in range(2):
            try:
                if not _mark_step_once(task["task_id"], step_name) and step["status"] != "failed":
                    if step["status"] == "completed":
                        success = True
                        break
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
                    "ai.results", "ai.step.started", task,
                    {"task_type": task["task_type"], "step": step_name, "data": {"attempt": step["attempt"]}},
                )

                summary = outputs.get(step_name)
                if not summary:
                    raise RuntimeError(f"Unknown pipeline step: {step_name}")

                if step_name == "discover_candidates":
                    existing = [str(x).strip() for x in (task.get("candidate_ids") or []) if str(x).strip()]
                    source = "request"
                    ids = list(existing)
                    app_resume_map: Dict[str, str] = {}
                    if not ids:
                        applicant_rows = _fetch_applicant_rows(
                            task["job_id"], str(task.get("actor_id") or "").strip() or None
                        )
                        seen_ids: set = set()
                        for row in applicant_rows:
                            mid = str(row.get("member_id") or row.get("memberId") or "").strip()
                            if not mid:
                                continue
                            rt = str(row.get("resume_text") or "").strip()
                            if rt:
                                app_resume_map[mid] = rt
                            if mid not in seen_ids:
                                seen_ids.add(mid)
                                ids.append(mid)
                        source = "applications"
                    if not ids:
                        demo = (os.getenv("AI_FALLBACK_DEMO_CANDIDATES", "") or "").strip()
                        if demo:
                            ids = [s.strip() for s in demo.split(",") if s.strip()]
                            source = "demo_fallback"
                    if not ids:
                        raise RuntimeError("No applicants found for this job. Ask candidates to apply.")
                    task["candidate_ids"] = ids
                    task["application_resume_text_by_member"] = app_resume_map
                    step["output_data"] = {"candidate_ids": ids, "source": source}
                    step["output_summary"] = f"Discovered {len(ids)} candidate(s) ({source})"

                elif step_name == "resume_parse":
                    app_resume_map = task.get("application_resume_text_by_member") or {}
                    candidate_list = list(task["candidate_ids"])

                    def _parse_one(cid: str) -> Dict[str, Any]:
                        fallback_text = str(app_resume_map.get(cid) or "").strip() if isinstance(app_resume_map, dict) else ""
                        try:
                            parsed = _invoke_skill(
                                "/resume/parse",
                                {"member_id": cid, "text": fallback_text},
                                _resume_parse_skill,
                            )
                        except Exception as exc:  # one bad candidate must not break the batch
                            logger.warning("resume_parse failed for %s: %s", cid, exc)
                            parsed = {
                                "member_id": cid,
                                "skills": [],
                                "years_experience": 0,
                                "parse_provider": "error",
                            }
                        if not parsed.get("member_id"):
                            parsed["member_id"] = cid
                        return parsed

                    # F1: parallelize Groq calls across candidates. pool.map preserves
                    # input order so downstream match_score still sees the same sequence.
                    max_workers = max(1, min(10, len(candidate_list)))
                    if max_workers > 1:
                        with ThreadPoolExecutor(max_workers=max_workers) as pool:
                            parsed_profiles = list(pool.map(_parse_one, candidate_list))
                    else:
                        parsed_profiles = [_parse_one(cid) for cid in candidate_list]

                    step["output_data"] = {
                        "parsed_profiles": [
                            {"member_id": p.get("member_id"), "skills": p.get("skills", []), "years_experience": p.get("years_experience", 0)}
                            for p in parsed_profiles
                        ]
                    }
                    step["output_summary"] = f"Parsed {len(parsed_profiles)} candidate resumes"

                elif step_name == "match_score":
                    score_cards = [
                        _invoke_skill(
                            "/match/score",
                            {"job_id": task["job_id"], "member_id": p.get("member_id"), "parsed_profile": p},
                            _match_score_skill,
                        )
                        for p in parsed_profiles
                    ]
                    step["output_data"] = {"scores": score_cards}
                    step["output_summary"] = "Computed hybrid embedding-plus-rules scores"

                elif step_name == "shortlist":
                    shortlist_response = _invoke_skill(
                        "/shortlist",
                        {"job_id": task["job_id"], "scores": score_cards, "top_k": cfg.SHORTLIST_TOP_K},
                        _shortlist_skill,
                    )
                    shortlist_candidates = shortlist_response.get("candidates", [])
                    step["output_data"] = {"shortlist": shortlist_candidates}
                    step["output_summary"] = f"Generated ranked shortlist with {len(shortlist_candidates)} candidates"

                elif step_name == "outreach_draft":
                    draft_response = _invoke_skill(
                        "/outreach/draft",
                        {"job_id": task["job_id"], "candidate_ids": task.get("candidate_ids") or [], "actor_id": task["actor_id"]},
                        _outreach_draft_skill,
                    )
                    last_outreach_bundle = draft_response
                    step["output_data"] = draft_response
                    # F4 — persist each draft to outreach_drafts collection
                    for d in (draft_response.get("drafts") or []):
                        if isinstance(d, dict) and d.get("member_id") and d.get("draft"):
                            _save_outreach_draft(task, d["member_id"], d["draft"])
                    n_drafts = len(draft_response.get("drafts") or []) or (1 if draft_response.get("draft") else 0)
                    step["output_summary"] = f"Prepared {n_drafts or 1} outreach draft(s)"

                else:
                    step["output_summary"] = summary

                step["status"] = "completed"
                step["ended_at"] = _now_iso()
                if not step.get("output_summary"):
                    step["output_summary"] = summary
                task["updated_at"] = _now_iso()
                _save_task(task)

                # Persist to ai_steps collection for observability
                _save_step(task, step_name,
                           {"candidate_ids": task.get("candidate_ids"), "job_id": task.get("job_id")},
                           step.get("output_data") or {"summary": step["output_summary"]},
                           status="completed")

                _publish_event(
                    "ai.results", "ai.step.completed", task,
                    {"task_type": task["task_type"], "step": step_name,
                     "data": {"summary": step["output_summary"], "attempt": step["attempt"]}},
                )
                success = True
                break

            except Exception as exc:
                step["status"] = "failed"
                step["error"] = str(exc)
                task["updated_at"] = _now_iso()
                _save_task(task)
                _save_step(task, step_name, None, None, status="failed", error=str(exc))

        if not success:
            _transition_state(
                task, "failed", "ai.task.failed", "ai.results",
                {"reason": step.get("error") or "step_failed", "step": step_name},
                current_step=step_name,
                error={"reason": step.get("error") or "step_failed", "step": step_name},
            )
            _publish_failed_envelope(task, task["error"]["reason"])
            return

    if task_type == TASK_TYPE_CANDIDATE_SHORTLIST:
        if cfg.HITL_REQUIRED:
            task["result"] = {"shortlist": shortlist_candidates, "outreach_draft": None, "outreach_drafts": None}
            _transition_state(
                task, "awaiting_approval", "ai.awaiting_approval", "ai.results",
                {"task_type": task["task_type"], "step": "shortlist",
                 "data": {"status": "awaiting_approval", "approval_target": "shortlist"}},
                approval_target="shortlist", current_step=None,
            )
            return

        task["result"] = {"shortlist": shortlist_candidates, "candidate_ids": task.get("candidate_ids") or []}
        _transition_state(
            task, "completed", "ai.completed", "ai.results",
            {"task_type": task["task_type"], "step": "shortlist", "data": {"status": "completed"}},
            approval_target=None, current_step=None,
        )
        return

    # generate_outreach path
    draft_bundle = last_outreach_bundle or {}
    drafts = draft_bundle.get("drafts") or []
    single = draft_bundle.get("draft")
    task["result"] = {
        "shortlist": [],
        "outreach_draft": single,
        "outreach_drafts": drafts if drafts else (
            [{"member_id": task["candidate_ids"][0], "name": task["candidate_ids"][0], "draft": single}]
            if single and task.get("candidate_ids") else []
        ),
    }
    _transition_state(
        task, "awaiting_approval", "ai.awaiting_approval", "ai.results",
        {"task_type": task["task_type"], "step": "outreach_draft",
         "data": {"status": "awaiting_approval", "approval_target": "outreach_draft"}},
        approval_target="outreach_draft", current_step=None,
    )

# ===========================================================================
# Kafka consumer (B2, B3, B4)
# ===========================================================================

def _extract_task_id_from_event(event: Dict[str, Any]) -> Optional[str]:
    entity = event.get("entity") or {}
    task_id = entity.get("entity_id") or event.get("task_id")
    return task_id if isinstance(task_id, str) and task_id.strip() else None


def _consume_ai_requests():
    global _consumer_running
    if KafkaConsumer is None:
        return
    try:
        consumer = KafkaConsumer(
            "ai.requests",
            bootstrap_servers=cfg.KAFKA_BROKERS,
            group_id=cfg.KAFKA_CONSUMER_GROUP,
            auto_offset_reset="earliest",  # B2 — was "latest"
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


def _recover_inflight_tasks():  # B3 — called in background thread now
    collection = _get_task_collection()
    if collection is None:
        return
    try:
        for record in collection.find({"state": {"$in": ["queued", "processing"]}}):
            record.pop("_id", None)
            TASKS[record["task_id"]] = record
            _run_pipeline(record)
    except Exception:
        pass


def _start_consumer_thread():
    """Start (or restart) the Kafka consumer thread. B4 — called at startup and on watchdog."""
    global _consumer_thread
    if _consumer_thread and _consumer_thread.is_alive():
        return
    _consumer_thread = threading.Thread(
        target=_consume_ai_requests, name="ai-requests-consumer", daemon=True
    )
    _consumer_thread.start()
    logger.info("Kafka consumer thread started")

# ===========================================================================
# D2 — startup log
# ===========================================================================

def _log_startup_config():
    logger.info("=" * 60)
    logger.info("LinkedIn AgenticAI Service — startup config")
    logger.info("  GROQ key present   : %s  model=%s", bool(cfg.GROQ_API_KEY), cfg.GROQ_MODEL if cfg.GROQ_API_KEY else "n/a")
    logger.info("  Embedding provider : %s  weight=%.2f", cfg.EMBEDDING_PROVIDER, cfg.EMBEDDING_WEIGHT)
    logger.info("  HITL required      : %s", cfg.HITL_REQUIRED)
    logger.info("  Shortlist top-k    : %d", cfg.SHORTLIST_TOP_K)
    logger.info("  Kafka brokers      : %s", cfg.KAFKA_BROKERS)
    logger.info("  Skills base URL    : %s", cfg.SKILLS_BASE_URL or "(local fallback)")
    # MongoDB
    try:
        c = _get_task_collection()
        logger.info("  MongoDB            : %s", "connected" if c is not None else "UNAVAILABLE — using in-memory only")
    except Exception:
        logger.info("  MongoDB            : UNAVAILABLE")
    # Redis
    try:
        r = _get_redis_client()
        logger.info("  Redis              : %s", "connected" if r is not None else "UNAVAILABLE — embedding cache disabled")
    except Exception:
        logger.info("  Redis              : UNAVAILABLE")
    # sentence-transformers
    if cfg.EMBEDDING_PROVIDER == "local":
        m = _get_st_model()
        logger.info("  sentence-transformers: %s", "loaded" if m is not None else "UNAVAILABLE — using hashed fallback")
    logger.info("=" * 60)

# ===========================================================================
# Pydantic models
# ===========================================================================

class SubmitTaskRequest(BaseModel):
    task_type: str
    job_id: str
    candidate_ids: Optional[List[str]] = None
    actor_id: str
    trace_id: Optional[str] = None
    client_request_id: Optional[str] = None


class ApproveBody(BaseModel):
    decision: str
    edited_text: Optional[str] = None
    edited_drafts: Optional[Dict[str, str]] = None
    reviewer_id: str


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
    top_k: Optional[int] = 5


class OutreachDraftBody(BaseModel):
    job_id: str
    shortlist: List[Dict[str, Any]] = Field(default_factory=list)
    candidate_ids: Optional[List[str]] = None
    actor_id: Optional[str] = None

# ===========================================================================
# Task dedup helper
# ===========================================================================

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

# ===========================================================================
# FastAPI startup
# ===========================================================================

@app.on_event("startup")
async def startup_supervisor_consumer():
    _log_startup_config()

    if KafkaConsumer is not None:
        _start_consumer_thread()
        threading.Thread(
            target=_recover_inflight_tasks,
            name="ai-recovery",
            daemon=True
        ).start()

# ===========================================================================
# Endpoints
# ===========================================================================

@app.post("/ai/tasks/submit", status_code=202)
async def submit_task(req: SubmitTaskRequest):
    # B4 — consumer watchdog: restart if thread died
    if KafkaConsumer is not None and not _consumer_running:
        _start_consumer_thread()

    if req.task_type not in {TASK_TYPE_CANDIDATE_SHORTLIST, TASK_TYPE_GENERATE_OUTREACH}:
        return _error_response(400, "VALIDATION_ERROR",
                               "Unsupported task_type. Use candidate_shortlist or generate_outreach.",
                               details={"task_type": req.task_type})
    if not req.job_id.strip():
        return _error_response(400, "VALIDATION_ERROR", "job_id is required.")
    if not req.actor_id.strip():
        return _error_response(400, "VALIDATION_ERROR", "actor_id is required.")
    candidate_ids = [str(x).strip() for x in (req.candidate_ids or []) if str(x).strip()]
    if req.task_type == TASK_TYPE_GENERATE_OUTREACH and not candidate_ids:
        return _error_response(400, "VALIDATION_ERROR",
                               "candidate_ids must contain at least one ID for generate_outreach.")
    if req.client_request_id and len(req.client_request_id) > 128:
        return _error_response(400, "VALIDATION_ERROR", "client_request_id must be <= 128 chars.")

    existing = _find_existing_task_by_client_request(req.actor_id, (req.client_request_id or "").strip())
    if existing:
        return {"task_id": existing["task_id"], "trace_id": existing["trace_id"],
                "state": existing["state"], "created_at": existing.get("created_at"), "reused": True}

    task_id = str(uuid.uuid4())
    trace_id = req.trace_id or str(uuid.uuid4())
    created_at = _now_iso()
    task = {
        "task_id": task_id,
        "trace_id": trace_id,
        "task_type": req.task_type,
        "job_id": req.job_id.strip(),
        "candidate_ids": candidate_ids,
        "actor_id": req.actor_id.strip(),
        "client_request_id": (req.client_request_id or "").strip() or None,
        "state": "queued",
        "current_step": None,
        "steps": _step_template_for_type(req.task_type),
        "result": None,
        "error": None,
        "created_at": created_at,
        "updated_at": created_at,
    }
    _save_task(task)
    _append_task_event(
        task, "ai.task.requested",
        {"job_id": task["job_id"], "candidate_ids": candidate_ids, "task_type": req.task_type},
        source="state_transition",
    )
    _publish_event(
        "ai.requests", "ai.requested", task,
        {"task_type": req.task_type, "step": None,
         "data": {"job_id": task["job_id"], "candidate_ids": candidate_ids or None}},
    )

    threading.Thread(
    target=_run_pipeline,
    args=(task,),
    daemon=True
    ).start()

    return {"task_id": task_id, "trace_id": trace_id, "state": task["state"],
            "created_at": created_at, "reused": False}


# F5 — /ai/agent/shortlist alias (project spec endpoint name)
@app.post("/ai/agent/shortlist", status_code=202)
async def agent_shortlist(req: SubmitTaskRequest):
    """Alias for POST /ai/tasks/submit with task_type=candidate_shortlist."""
    if not req.task_type or req.task_type not in {TASK_TYPE_CANDIDATE_SHORTLIST, TASK_TYPE_GENERATE_OUTREACH}:
        req = SubmitTaskRequest(
            task_type=TASK_TYPE_CANDIDATE_SHORTLIST,
            job_id=req.job_id,
            candidate_ids=req.candidate_ids,
            actor_id=req.actor_id,
            trace_id=req.trace_id,
            client_request_id=req.client_request_id,
        )
    return await submit_task(req)


@app.get("/ai/tasks/{task_id}")
async def get_task(task_id: str):
    task = _load_task(task_id)
    if not task:
        return _error_response(404, "TASK_NOT_FOUND", "No task found for provided task_id.")
    return _public_task(task)


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
    return _shortlist_skill(body.model_dump())


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
        if body.decision == "edit":
            has_single = bool((body.edited_text or "").strip())
            has_map = bool(body.edited_drafts and any((v or "").strip() for v in (body.edited_drafts or {}).values()))
            if not has_single and not has_map:
                return _error_response(400, "EDIT_TEXT_REQUIRED",
                                       "edited_text or edited_drafts is required when decision is edit.", task["trace_id"])
        if task["state"] != "awaiting_approval":
            return _error_response(409, "INVALID_STATE",
                                   f"Cannot approve task in state '{task['state']}'.",
                                   task["trace_id"], details={"state": task["state"]})

        if not isinstance(task.get("result"), dict):
            task["result"] = {"shortlist": [], "outreach_draft": None}
        if not isinstance(task["result"].get("shortlist"), list):
            task["result"]["shortlist"] = []

        approval_target = task.get("approval_target") or "outreach_draft"
        res_block = task.get("result") if isinstance(task.get("result"), dict) else {}
        original_text = None
        if approval_target == "outreach_draft":
            original_text = res_block.get("outreach_draft") or (
                json.dumps(res_block.get("outreach_drafts") or [])[:2000]
                if res_block.get("outreach_drafts") else None
            )

        task["approval"] = {
            "decision": body.decision,
            "edited_text": body.edited_text,
            "edited_drafts": body.edited_drafts,
            "original_text": original_text,
            "reviewer_id": body.reviewer_id,
            "target": approval_target,
            "recorded_at": _now_iso(),
        }
        task["updated_at"] = _now_iso()

        if body.decision == "reject":
            task["error"] = None
            _transition_state(task, "rejected", "ai.rejected", "ai.results",
                              {"task_type": task["task_type"], "step": None, "data": {"reason": "reviewer_rejected"}})
            # F4 — update outreach_drafts collection
            for mid in (task.get("candidate_ids") or []):
                _update_outreach_draft_status(task_id, mid, "rejected")

        elif approval_target == "shortlist":
            if body.decision == "edit":
                task["result"]["shortlist_reviewer_note"] = body.edited_text or json.dumps(body.edited_drafts or {})
            _transition_state(task, "completed", "ai.completed", "ai.results",
                              {"task_type": task["task_type"], "step": "shortlist", "data": {"decision": body.decision}},
                              approval_target=None, current_step=None)

        else:
            # Outreach approval path — apply edits
            res = dict(task.get("result") or {})
            drafts = list(res.get("outreach_drafts") or [])
            mids = list(task.get("candidate_ids") or [])

            if body.decision == "edit":
                edited_map = dict(body.edited_drafts or {})
                if edited_map:
                    merged: List[Dict[str, Any]] = []
                    for d in drafts:
                        if not isinstance(d, dict):
                            continue
                        mid = d.get("member_id")
                        if mid and mid in edited_map and str(edited_map[mid]).strip():
                            merged.append({"member_id": mid, "name": d.get("name") or mid, "draft": str(edited_map[mid]).strip()})
                        else:
                            merged.append(d)
                    res["outreach_drafts"] = merged
                    if len(merged) == 1:
                        res["outreach_draft"] = merged[0].get("draft")
                    task["result"] = res
                elif (body.edited_text or "").strip():
                    text = body.edited_text.strip()
                    res["outreach_draft"] = text
                    res["outreach_drafts"] = (
                        [{"member_id": mids[0], "name": mids[0], "draft": text}] if len(mids) == 1 and mids
                        else [{"member_id": mid, "name": mid, "draft": text} for mid in mids]
                    )
                    task["result"] = res

            # Build final messages list
            res = dict(task.get("result") or {})
            drafts = list(res.get("outreach_drafts") or [])
            by_id = {d.get("member_id"): (d.get("draft") or "").strip() for d in drafts if isinstance(d, dict)}
            messages: List[Dict[str, str]] = []
            for mid in mids:
                text = (by_id.get(mid) or "").strip() or (res.get("outreach_draft") or "").strip()
                if text:
                    messages.append({"candidate_id": mid, "text": text})

            task["error"] = None
            _transition_state(task, "completed", "ai.completed", "ai.results",
                              {"task_type": task["task_type"], "step": None, "data": {"decision": body.decision}})
            _publish_event(cfg.SEND_TOPIC, SEND_REQUESTED_EVENT, task,
                           {"task_type": task["task_type"], "step": "send",
                            "data": {"job_id": task["job_id"], "messages": messages}})

            # F4 — update outreach_drafts collection with final decision
            for d in drafts:
                if isinstance(d, dict) and d.get("member_id"):
                    edited = by_id.get(d["member_id"]) if body.decision == "edit" else None
                    _update_outreach_draft_status(task_id, d["member_id"], body.decision, edited)

            if cfg.DIRECT_SEND_ENABLED:
                direct_result = _deliver_outreach_direct(task.get("actor_id", ""), task.get("job_id", ""), messages)
                task.setdefault("result", {})
                if isinstance(task["result"], dict):
                    task["result"]["direct_send"] = direct_result
                _append_task_event(task, "ai.send.direct", direct_result, source="ai_service")

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
        _append_task_event(task, "ai.task.failed",
                           {"reason": "approval_processing_failed", "message": str(exc)}, source="exception")
        return _error_response(500, "APPROVAL_FAILED", "Failed while processing approval.", task.get("trace_id", ""))


@app.websocket("/ws/ai/tasks/{task_id}")
async def ws_task(websocket: WebSocket, task_id: str):
    await websocket.accept()
    try:
        terminal_states = {"completed", "failed", "rejected"}
        seen_signatures: set = set()

        for _ in range(240):
            task = _load_task(task_id)
            if not task:
                await websocket.send_json({"error_code": "TASK_NOT_FOUND", "task_id": task_id})
                return

            steps = task.get("steps", [])
            total_steps = max(1, len(steps))
            for index, step in enumerate(steps, start=1):
                sig = (step.get("step_name"), step.get("status"), step.get("attempt"),
                       step.get("started_at"), step.get("ended_at"))
                if sig in seen_signatures:
                    continue
                seen_signatures.add(sig)
                status = _public_step_status(step.get("status"))
                msg = step.get("output_summary") or f"{step.get('step_name')} is {status}"
                await websocket.send_json({
                    "task_id": task_id,
                    "trace_id": task["trace_id"],
                    "state": task["state"],
                    "current_step": step.get("step_name"),
                    "step_status": status,
                    "progress_pct": int((index / total_steps) * 100),
                    "message": msg,
                    "timestamp": _now_iso(),
                })

            task_sig = ("task_state", task.get("state"), task.get("approval_target"), task.get("updated_at"))
            if task_sig not in seen_signatures:
                seen_signatures.add(task_sig)
                if task.get("state") == "awaiting_approval":
                    status_message = f"Awaiting human approval for {task.get('approval_target') or 'outreach_draft'}"
                elif task.get("state") in terminal_states:
                    status_message = f"Task {task.get('state')}"
                else:
                    status_message = "Task update"
                await websocket.send_json({
                    "task_id": task_id,
                    "trace_id": task["trace_id"],
                    "state": task.get("state"),
                    "current_step": task.get("current_step"),
                    "step_status": "completed" if task.get("state") != "processing" else "running",
                    "progress_pct": 100 if task.get("state") != "processing" else 75,
                    "message": status_message,
                    "timestamp": _now_iso(),
                })

            if task.get("state") in terminal_states:
                return
            await asyncio.sleep(0.5)
    except WebSocketDisconnect:
        pass


def _task_matches_recruiter(task: Dict[str, Any], recruiter_id: str) -> bool:
    rid = (recruiter_id or "").strip()
    if not rid:
        return True
    if str(task.get("actor_id") or "").strip() == rid:
        return True
    if str(task.get("recruiter_id") or "").strip() == rid:
        return True
    if str((task.get("approval") or {}).get("reviewer_id") or "").strip() == rid:
        return True
    return False


def _load_metric_records(recruiter_id: Optional[str] = None) -> List[Dict[str, Any]]:
    rid = (recruiter_id or "").strip()
    records: List[Dict[str, Any]] = []
    collection = _get_task_collection()
    if collection is not None:
        try:
            for record in collection.find():
                record.pop("_id", None)
                if not rid or _task_matches_recruiter(record, rid):
                    records.append(record)
        except Exception:
            records = [t for t in TASKS.values() if not rid or _task_matches_recruiter(t, rid)]
    else:
        records = [t for t in TASKS.values() if not rid or _task_matches_recruiter(t, rid)]
    return records


@app.get("/ai/metrics/summary")
async def ai_metrics_summary(recruiter_id: Optional[str] = Query(default=None)):
    records = _load_metric_records(recruiter_id)
    approved = edited = rejected = 0
    scores: List[float] = []
    completion_ms: List[float] = []
    tasks_by_state: Dict[str, int] = {}

    for task in records:
        state = task.get("state") or "unknown"
        tasks_by_state[state] = tasks_by_state.get(state, 0) + 1
        decision = (task.get("approval") or {}).get("decision")
        if decision == "approve":
            approved += 1
        elif decision == "edit":
            edited += 1
        elif decision == "reject":
            rejected += 1
        for candidate in (task.get("result") or {}).get("shortlist") or []:
            s = candidate.get("score") or candidate.get("match_score")
            if isinstance(s, (int, float)):
                scores.append(float(s))
        c_at, u_at = task.get("created_at"), task.get("updated_at")
        if c_at and u_at:
            try:
                s_dt, e_dt = _parse_dt(c_at), _parse_dt(u_at)
                if s_dt and e_dt and e_dt >= s_dt:
                    completion_ms.append((e_dt - s_dt).total_seconds() * 1000)
            except Exception:
                pass

    total_reviewed = approved + edited + rejected
    avg_score = round(sum(scores) / len(scores), 4) if scores else 0.0
    avg_ms = round(sum(completion_ms) / len(completion_ms), 2) if completion_ms else 0.0
    return {
        "total_tasks": len(records),
        "recruiter_id": recruiter_id.strip() if isinstance(recruiter_id, str) and recruiter_id.strip() else None,
        "reviewed_tasks": total_reviewed,
        "approval_counts": {"approved": approved, "edited": edited, "rejected": rejected},
        "approval_rate": round(approved / total_reviewed, 4) if total_reviewed else 0.0,
        "edit_rate": round(edited / total_reviewed, 4) if total_reviewed else 0.0,
        "rejection_rate": round(rejected / total_reviewed, 4) if total_reviewed else 0.0,
        "avg_shortlist_score": avg_score,
        "avg_match_score": avg_score,
        "average_completion_time_ms": avg_ms,
        "tasks_by_state": tasks_by_state,
    }


@app.get("/ai/metrics")
async def ai_metrics_alias(recruiter_id: Optional[str] = Query(default=None)):
    return await ai_metrics_summary(recruiter_id=recruiter_id)


@app.get("/ai/metrics/matching-quality")
async def get_matching_quality_metrics(recruiter_id: Optional[str] = Query(default=None)):
    records = [
        t for t in _load_metric_records(recruiter_id)
        if (t.get("state") or "").strip() in {"completed", "approved", "rejected"}
    ]
    all_scores: List[float] = []
    top_k_scores: List[float] = []
    skills_overlaps: List[float] = []
    candidates_per_job: List[int] = []

    for task in records:
        shortlist = (task.get("result") or {}).get("shortlist") or []
        if shortlist:
            candidates_per_job.append(len(shortlist))
        for idx, candidate in enumerate(shortlist):
            s = candidate.get("match_score") or candidate.get("score")
            if isinstance(s, (int, float)):
                all_scores.append(float(s))
                if idx < 5:
                    top_k_scores.append(float(s))
            ov = candidate.get("skills_overlap")
            if isinstance(ov, (int, float)):
                skills_overlaps.append(float(ov))

    return {
        "recruiter_id": recruiter_id.strip() if isinstance(recruiter_id, str) and recruiter_id.strip() else None,
        "total_candidates_evaluated": len(all_scores),
        "total_tasks_with_shortlists": len(candidates_per_job),
        "average_match_score": round(sum(all_scores) / len(all_scores), 4) if all_scores else 0.0,
        "top_k_average_match_score": round(sum(top_k_scores) / len(top_k_scores), 4) if top_k_scores else 0.0,
        "average_skills_overlap": round(sum(skills_overlaps) / len(skills_overlaps), 4) if skills_overlaps else 0.0,
        "min_match_score": round(min(all_scores), 4) if all_scores else 0.0,
        "max_match_score": round(max(all_scores), 4) if all_scores else 0.0,
        "average_candidates_per_shortlist": round(sum(candidates_per_job) / len(candidates_per_job), 2) if candidates_per_job else 0.0,
        "match_score_distribution": {
            "excellent_80_plus": sum(1 for s in all_scores if s >= 0.8),
            "good_60_to_80": sum(1 for s in all_scores if 0.6 <= s < 0.8),
            "fair_40_to_60": sum(1 for s in all_scores if 0.4 <= s < 0.6),
            "poor_below_40": sum(1 for s in all_scores if s < 0.4),
        },
    }


class EditBody(BaseModel):
    edited_text: Optional[str] = None
    edited_drafts: Optional[Dict[str, str]] = None
    reviewer_id: str


class RejectBody(BaseModel):
    reviewer_id: str


@app.post("/ai/agent/edit")
async def agent_edit(task_id: str, body: EditBody):
    """Standalone edit endpoint — submits edited outreach draft for a task."""
    return await approve_task(
        task_id,
        ApproveBody(
            decision="edit",
            edited_text=body.edited_text,
            edited_drafts=body.edited_drafts,
            reviewer_id=body.reviewer_id,
        ),
    )


@app.post("/ai/agent/reject")
async def agent_reject(task_id: str, body: RejectBody):
    """Standalone reject endpoint — rejects the AI output for a task."""
    return await approve_task(
        task_id,
        ApproveBody(
            decision="reject",
            reviewer_id=body.reviewer_id,
        ),
    )


@app.get("/health")
async def health_check():
    return {"status": "ok"}


@app.get("/ai/health")
async def ai_health_alias():
    return {"status": "ok", "service": "linkedin-agentic-ai"}