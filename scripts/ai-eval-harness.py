#!/usr/bin/env python3
from __future__ import annotations

import argparse
import json
import random
import sys
import time
import urllib.error
import urllib.request
from datetime import datetime, timezone
from typing import Any, Dict, List, Optional


def post_json(url: str, payload: Dict[str, Any], timeout: float = 60.0) -> Dict[str, Any]:
    body = json.dumps(payload).encode("utf-8")
    req = urllib.request.Request(url, data=body, headers={"Content-Type": "application/json"}, method="POST")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def get_json(url: str, timeout: float = 30.0) -> Dict[str, Any]:
    req = urllib.request.Request(url, method="GET")
    with urllib.request.urlopen(req, timeout=timeout) as resp:
        raw = resp.read().decode("utf-8")
        return json.loads(raw) if raw else {}


def poll_task(
    base: str,
    task_id: str,
    timeout_s: float = 120.0,
    interval: float = 0.75,
    *,
    stop_states: Optional[tuple] = None,
) -> Dict[str, Any]:
    stops = stop_states or ("awaiting_approval", "completed", "failed", "rejected", "shortlist_ready")
    url = f"{base}/ai/tasks/{task_id}"
    deadline = time.time() + timeout_s
    last: Dict[str, Any] = {}
    while time.time() < deadline:
        try:
            last = get_json(url)
        except urllib.error.HTTPError as e:
            if e.code == 404:
                raise
            last = {"error": str(e)}
        state = last.get("state")
        if state in stops:
            return last
        time.sleep(interval)
    last["_poll_timeout"] = True
    return last


def main() -> int:
    parser = argparse.ArgumentParser(description="AI eval harness: submit, wait, approve/reject, fetch metrics.")
    parser.add_argument("--gateway", default="http://127.0.0.1:4000/api", help="Gateway base including /api")
    parser.add_argument("--runs", type=int, default=10, help="Number of tasks to submit")
    parser.add_argument("--job-id", default="J-LIVE-1", help="Job id for shortlist")
    parser.add_argument(
        "--candidates",
        default="M-101,M-202,M-303",
        help="Comma-separated member ids",
    )
    parser.add_argument("--actor-id", default="R-EVAL-1", help="Recruiter / actor id for tasks")
    parser.add_argument("--out", default="", help="Write JSON report to this path")
    args = parser.parse_args()

    base = args.gateway.rstrip("/")
    candidate_ids = [c.strip() for c in args.candidates.split(",") if c.strip()]

    runs: List[Dict[str, Any]] = []
    for i in range(args.runs):
        trace_id = f"eval-{datetime.now(timezone.utc).strftime('%Y%m%dT%H%M%S')}-{i}"
        submit_url = f"{base}/ai/tasks/submit"
        try:
            sub = post_json(
                submit_url,
                {
                    "task_type": "candidate_shortlist",
                    "job_id": args.job_id,
                    "candidate_ids": candidate_ids,
                    "actor_id": args.actor_id,
                    "trace_id": trace_id,
                },
            )
        except Exception as exc:
            runs.append({"run": i, "error": str(exc), "phase": "submit"})
            continue

        task_id = sub.get("task_id")
        if not task_id:
            runs.append({"run": i, "error": "no_task_id", "submit": sub})
            continue

        final = poll_task(base, task_id)
        state = final.get("state")
        entry: Dict[str, Any] = {"run": i, "task_id": task_id, "trace_id": trace_id, "state_after_poll": state}

        if state == "shortlist_ready":
            sl = (final.get("result") or {}).get("shortlist") or []
            pick: List[str] = []
            for row in sl:
                if isinstance(row, dict):
                    mid = row.get("member_id") or row.get("candidate_id")
                    if mid:
                        pick.append(str(mid))
                        break
            if not pick and candidate_ids:
                pick = [candidate_ids[0]]
            if pick:
                try:
                    gen = post_json(
                        f"{base}/ai/tasks/{task_id}/outreach/generate",
                        {"candidate_ids": pick, "actor_id": args.actor_id, "reviewer_id": args.actor_id},
                    )
                    entry["outreach_generate"] = gen
                    final = poll_task(base, task_id, stop_states=("awaiting_approval", "completed", "failed", "rejected"))
                    state = final.get("state")
                    entry["state_after_poll"] = state
                except Exception as exc:
                    entry["outreach_generate_error"] = str(exc)

        if state == "awaiting_approval":
            decision = random.choices(["approve", "edit", "reject"], weights=[0.55, 0.25, 0.2], k=1)[0]
            body: Dict[str, Any] = {"decision": decision, "reviewer_id": args.actor_id}
            if decision == "edit":
                res = final.get("result") or {}
                base_text = res.get("outreach_draft")
                if not base_text and isinstance(res.get("outreach_drafts"), list) and res["outreach_drafts"]:
                    d0 = res["outreach_drafts"][0]
                    if isinstance(d0, dict):
                        base_text = d0.get("text")
                body["edited_text"] = base_text or "Thanks for connecting — small edit for eval."
            try:
                appr = post_json(f"{base}/ai/tasks/{task_id}/approve", body)
                entry["approval"] = appr
            except Exception as exc:
                entry["approval_error"] = str(exc)
        else:
            entry["note"] = "skipped_approve_not_awaiting"

        runs.append(entry)
        time.sleep(0.3)

    metrics: Dict[str, Any] = {}
    try:
        metrics = get_json(f"{base}/ai/metrics/summary")
    except Exception as exc:
        metrics = {"error": str(exc)}

    report = {
        "generated_at": datetime.now(timezone.utc).isoformat(),
        "gateway": base,
        "job_id": args.job_id,
        "candidate_ids": candidate_ids,
        "actor_id": args.actor_id,
        "runs": runs,
        "metrics_summary": metrics,
    }

    text = json.dumps(report, indent=2)
    if args.out:
        from pathlib import Path

        path = Path(args.out)
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text, encoding="utf-8")
        print(f"Wrote {path}", file=sys.stderr)
    print(text)
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
