from __future__ import annotations

import uuid
from typing import Any, Optional

from fastapi import APIRouter
from fastapi.responses import JSONResponse

from app import db as dbm

router = APIRouter()

_demo_seed_ran = False

DEMO_SEED_POSTS = [
    ("P-SEED-ALEX", "M-DEMO-01", "Alex Chen", "Senior Engineer at Acme", "Shipped a Kafka retry strategy that cut duplicate writes by 92%.", "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80"),
    ("P-SEED-PRIYA", "M-DEMO-02", "Priya Kapoor", "Recruiter at Nova Labs", "Hiring for distributed systems and backend interns.", None),
    ("P-SEED-JORDAN", "M-DEMO-03", "Jordan Lee", "Staff Engineer · Platform", "Tip: idempotent consumers + dead-letter topics saved us.", "https://images.unsplash.com/photo-1555066931-4365d14bab8c?auto=format&fit=crop&w=1200&q=80"),
    ("P-SEED-MARIA", "M-DEMO-04", "Maria Santos", "Product Design Lead", "We're polishing the job application flow.", None),
    ("P-SEED-RAHUL", "M-DEMO-05", "Rahul Verma", "Data Infra @ Northwind", "Interesting read on stream-table duality this week.", "https://images.unsplash.com/photo-1544383835-bda2bc66a55d?auto=format&fit=crop&w=1200&q=80"),
]


async def ensure_tables() -> None:
    global _demo_seed_ran
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS posts (
      post_id VARCHAR(50) PRIMARY KEY, member_id VARCHAR(50) NOT NULL, author_name VARCHAR(255),
      author_headline VARCHAR(255) NULL, body TEXT NOT NULL, image_data LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_posts_member (member_id), INDEX idx_posts_created (created_at)
    )"""
    )
    row = await dbm.fetch_one("SHOW COLUMNS FROM posts LIKE %s", ("author_headline",))
    if not row:
        try:
            await dbm.execute("ALTER TABLE posts ADD COLUMN author_headline VARCHAR(255) NULL")
        except Exception:
            pass
    row = await dbm.fetch_one("SHOW COLUMNS FROM posts LIKE %s", ("quoted_post_id",))
    if not row:
        try:
            await dbm.execute("ALTER TABLE posts ADD COLUMN quoted_post_id VARCHAR(50) NULL")
        except Exception:
            pass
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id VARCHAR(50) NOT NULL, member_id VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id), INDEX idx_likes_member (member_id)
    )"""
    )
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS post_comments (
      comment_id VARCHAR(50) PRIMARY KEY, post_id VARCHAR(50) NOT NULL, member_id VARCHAR(50) NOT NULL,
      author_name VARCHAR(255), body TEXT NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_comments_post (post_id)
    )"""
    )
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS post_reposts (
      post_id VARCHAR(50) NOT NULL, member_id VARCHAR(50) NOT NULL, created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id), INDEX idx_reposts_member (member_id)
    )"""
    )
    await dbm.execute(
        """
    CREATE TABLE IF NOT EXISTS post_sends (
      send_id VARCHAR(50) PRIMARY KEY, post_id VARCHAR(50) NOT NULL, member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP, INDEX idx_sends_post (post_id)
    )"""
    )
    if not _demo_seed_ran:
        for pid, mid, name, hl, body, img in DEMO_SEED_POSTS:
            await dbm.execute(
                "INSERT IGNORE INTO posts (post_id, member_id, author_name, author_headline, body, image_data) VALUES (%s,%s,%s,%s,%s,%s)",
                (pid, mid, name, hl, body, img),
            )
        _demo_seed_ran = True


def new_id(prefix: str) -> str:
    return f"{prefix}-{uuid.uuid4().hex[:8]}"


def quoted_from_row(r: dict) -> Optional[dict]:
    if not r.get("quoted_post_id") or not r.get("qp_post_id"):
        return None
    return {
        "post_id": r["qp_post_id"],
        "member_id": r["qp_member_id"],
        "author_name": r["qp_author_name"],
        "author_headline": r["qp_author_headline"],
        "body": r["qp_body"],
        "image_data": r["qp_image_data"],
        "author_profile_photo_url": r.get("qp_author_profile_photo_url"),
    }


LIST_SQL = """
SELECT p.post_id, p.member_id, p.author_name, p.author_headline, p.body, p.image_data, p.created_at, p.quoted_post_id,
  m.profile_photo_url AS author_profile_photo_url,
  qp.post_id AS qp_post_id, qp.member_id AS qp_member_id, qp.author_name AS qp_author_name,
  qp.author_headline AS qp_author_headline, qp.body AS qp_body, qp.image_data AS qp_image_data,
  qm.profile_photo_url AS qp_author_profile_photo_url,
  (SELECT COUNT(*) FROM post_likes l WHERE l.post_id = p.post_id) AS like_count,
  (SELECT COUNT(*) FROM post_comments c WHERE c.post_id = p.post_id) AS comment_count,
  (SELECT COUNT(*) FROM post_reposts r WHERE r.post_id = p.post_id) AS repost_count,
  (SELECT COUNT(*) FROM post_sends s WHERE s.post_id = p.post_id) AS send_count
FROM posts p
LEFT JOIN members m ON m.member_id = p.member_id AND COALESCE(m.status, '') != 'deleted'
LEFT JOIN posts qp ON qp.post_id = p.quoted_post_id
LEFT JOIN members qm ON qm.member_id = qp.member_id AND COALESCE(qm.status, '') != 'deleted'
"""


def format_post_row(r: dict, viewer_id: str | None) -> dict:
    return {
        "post_id": r["post_id"],
        "member_id": r["member_id"],
        "author_name": r["author_name"],
        "author_headline": r["author_headline"],
        "author_profile_photo_url": r.get("author_profile_photo_url"),
        "body": r["body"],
        "image_data": r["image_data"],
        "quoted_post_id": r.get("quoted_post_id"),
        "quoted": quoted_from_row(r),
        "created_at": r["created_at"],
        "like_count": int(r.get("like_count") or 0),
        "comment_count": int(r.get("comment_count") or 0),
        "repost_count": int(r.get("repost_count") or 0),
        "send_count": int(r.get("send_count") or 0),
        "liked": False,
        "reposted": False,
        "sent": False,
    }


async def viewer_engagement_sets(viewer_id: str | None, post_ids: list[str]) -> tuple[set[str], set[str], set[str]]:
    if not viewer_id or not post_ids:
        return set(), set(), set()
    ph = ",".join(["%s"] * len(post_ids))
    args: tuple[Any, ...] = (viewer_id, *post_ids)
    like_rows = await dbm.fetch_all(
        f"SELECT post_id FROM post_likes WHERE member_id = %s AND post_id IN ({ph})", args
    )
    rep_rows = await dbm.fetch_all(
        f"SELECT post_id FROM post_reposts WHERE member_id = %s AND post_id IN ({ph})", args
    )
    send_rows = await dbm.fetch_all(
        f"SELECT post_id FROM post_sends WHERE member_id = %s AND post_id IN ({ph})", args
    )
    liked = {str(r["post_id"]) for r in like_rows}
    reposted = {str(r["post_id"]) for r in rep_rows}
    sent = {str(r["post_id"]) for r in send_rows}
    return liked, reposted, sent


def apply_viewer_engagement(item: dict, liked: set[str], reposted: set[str], sent: set[str]) -> None:
    pid = item["post_id"]
    item["liked"] = pid in liked
    item["reposted"] = pid in reposted
    item["sent"] = pid in sent


@router.post("/posts/create")
async def posts_create(body: dict):
    await ensure_tables()
    member_id = body.get("member_id")
    author_name = body.get("author_name")
    text_body = body.get("body")
    image_data = body.get("image_data")
    author_headline = body.get("author_headline")
    quoted_post_id = (body.get("quoted_post_id") or "").strip() or None
    if not member_id or not str(text_body or "").strip():
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id and body required"})
    if quoted_post_id:
        q = await dbm.fetch_one("SELECT post_id FROM posts WHERE post_id = %s LIMIT 1", (quoted_post_id,))
        if not q:
            return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "quoted_post_id not found"})
    pid = new_id("P")
    await dbm.execute(
        "INSERT INTO posts (post_id, member_id, author_name, author_headline, body, image_data, quoted_post_id) VALUES (%s,%s,%s,%s,%s,%s,%s)",
        (pid, member_id, author_name, author_headline, str(text_body).strip(), image_data, quoted_post_id),
    )
    return JSONResponse(status_code=201, content={"post_id": pid, "message": "Post created"})


@router.post("/posts/list")
async def posts_list(body: dict):
    await ensure_tables()
    limit = min(int(body.get("limit") or 50), 100)
    viewer_id = body.get("viewer_member_id")
    rows = await dbm.fetch_all(LIST_SQL + " ORDER BY p.created_at DESC LIMIT %s", (limit,))
    out = []
    for r in rows:
        item = format_post_row(dict(r), viewer_id)
        out.append(item)
    if viewer_id and out:
        pids = [o["post_id"] for o in out]
        lk, rp, sn = await viewer_engagement_sets(viewer_id, pids)
        for item in out:
            apply_viewer_engagement(item, lk, rp, sn)
    return out


@router.post("/posts/get")
async def posts_get(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    if not post_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id required"})
    viewer_id = body.get("viewer_member_id")
    rows = await dbm.fetch_all(LIST_SQL + " WHERE p.post_id = %s", (post_id,))
    if not rows:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Post not found"})
    r = dict(rows[0])
    item = format_post_row(r, viewer_id)
    if viewer_id:
        lk, rp, sn = await viewer_engagement_sets(viewer_id, [post_id])
        apply_viewer_engagement(item, lk, rp, sn)
    return item


@router.post("/posts/memberActivity")
async def posts_member_activity(body: dict):
    """Activity for a profile: authored posts, likes, comments, reposts (LinkedIn-style)."""
    await ensure_tables()
    member_id = body.get("member_id")
    viewer_id = body.get("viewer_member_id")
    scope = str(body.get("scope") or "full").strip().lower()
    limit = min(int(body.get("limit") or 40), 100)
    if not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "member_id required"})

    raw: list[dict[str, Any]] = []
    if scope == "public":
        rows = await dbm.fetch_all(
            "SELECT post_id, created_at AS activity_at, 'created' AS activity_kind, NULL AS comment_body "
            "FROM posts WHERE member_id = %s ORDER BY created_at DESC LIMIT %s",
            (member_id, limit),
        )
        raw = [dict(r) for r in rows]
    else:
        created = await dbm.fetch_all(
            "SELECT post_id, created_at AS activity_at, 'created' AS activity_kind, NULL AS comment_body "
            "FROM posts WHERE member_id = %s",
            (member_id,),
        )
        liked = await dbm.fetch_all(
            "SELECT post_id, created_at AS activity_at, 'liked' AS activity_kind, NULL AS comment_body "
            "FROM post_likes WHERE member_id = %s",
            (member_id,),
        )
        commented = await dbm.fetch_all(
            "SELECT post_id, created_at AS activity_at, 'commented' AS activity_kind, body AS comment_body "
            "FROM post_comments WHERE member_id = %s",
            (member_id,),
        )
        reposted = await dbm.fetch_all(
            "SELECT post_id, created_at AS activity_at, 'reposted' AS activity_kind, NULL AS comment_body "
            "FROM post_reposts WHERE member_id = %s",
            (member_id,),
        )
        for group in (created, liked, commented, reposted):
            raw.extend(dict(r) for r in group)

    raw.sort(key=lambda x: x["activity_at"], reverse=True)
    raw = raw[:limit]
    if not raw:
        return []

    post_ids_ordered: list[str] = []
    seen: set[str] = set()
    for row in raw:
        pid = str(row["post_id"])
        if pid not in seen:
            seen.add(pid)
            post_ids_ordered.append(pid)
    if not post_ids_ordered:
        return []

    ph = ",".join(["%s"] * len(post_ids_ordered))
    prow = await dbm.fetch_all(LIST_SQL + f" WHERE p.post_id IN ({ph})", tuple(post_ids_ordered))
    by_id = {str(dict(r)["post_id"]): dict(r) for r in prow}

    out: list[dict] = []
    for row in raw:
        pid = str(row["post_id"])
        pr = by_id.get(pid)
        if not pr:
            continue
        item = format_post_row(pr, viewer_id)
        out.append(
            {
                "activity_type": row["activity_kind"],
                "activity_at": row["activity_at"],
                "comment_preview": row.get("comment_body"),
                "post": item,
            }
        )

    if viewer_id and out:
        all_pids = list({str(o["post"]["post_id"]) for o in out})
        lk, rp, sn = await viewer_engagement_sets(viewer_id, all_pids)
        for o in out:
            apply_viewer_engagement(o["post"], lk, rp, sn)
    return out


@router.post("/posts/update")
async def posts_update(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    text_body = body.get("body")
    image_data = body.get("image_data")
    author_headline = body.get("author_headline")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    row = await dbm.fetch_one("SELECT member_id FROM posts WHERE post_id = %s LIMIT 1", (post_id,))
    if not row:
        return JSONResponse(status_code=404, content={"error": "NOT_FOUND", "message": "Post not found"})
    if str(row["member_id"]) != str(member_id):
        return JSONResponse(status_code=403, content={"error": "FORBIDDEN", "message": "Only the author can edit this post"})
    if text_body is None or not str(text_body).strip():
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "body required"})
    fields: list[str] = ["body = %s"]
    vals: list[Any] = [str(text_body).strip()]
    if image_data is not None:
        fields.append("image_data = %s")
        vals.append(image_data)
    if author_headline is not None:
        fields.append("author_headline = %s")
        vals.append(author_headline)
    vals.append(post_id)
    await dbm.execute(f"UPDATE posts SET {', '.join(fields)} WHERE post_id = %s", tuple(vals))
    rows = await dbm.fetch_all(LIST_SQL + " WHERE p.post_id = %s", (post_id,))
    if not rows:
        return {"ok": True, "post_id": post_id}
    r = dict(rows[0])
    item = format_post_row(r, member_id)
    lk, rp, sn = await viewer_engagement_sets(member_id, [post_id])
    apply_viewer_engagement(item, lk, rp, sn)
    return item


@router.post("/posts/like")
async def posts_like(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    await dbm.execute("INSERT IGNORE INTO post_likes (post_id, member_id) VALUES (%s,%s)", (post_id, member_id))
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = %s", (post_id,))
    return {"ok": True, "like_count": int(c["n"]) if c else 0}


@router.post("/posts/unlike")
async def posts_unlike(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    await dbm.execute("DELETE FROM post_likes WHERE post_id = %s AND member_id = %s", (post_id, member_id))
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_likes WHERE post_id = %s", (post_id,))
    return {"ok": True, "like_count": int(c["n"]) if c else 0}


@router.post("/posts/comment")
async def posts_comment(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    author_name = body.get("author_name")
    text_body = body.get("body")
    if not post_id or not member_id or not str(text_body or "").strip():
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id, member_id, body required"})
    cid = new_id("C")
    await dbm.execute(
        "INSERT INTO post_comments (comment_id, post_id, member_id, author_name, body) VALUES (%s,%s,%s,%s,%s)",
        (cid, post_id, member_id, author_name, str(text_body).strip()),
    )
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_comments WHERE post_id = %s", (post_id,))
    return JSONResponse(status_code=201, content={"comment_id": cid, "comment_count": int(c["n"]) if c else 0})


@router.post("/posts/comments/list")
async def posts_comments_list(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    if not post_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id required"})
    rows = await dbm.fetch_all(
        "SELECT comment_id, post_id, member_id, author_name, body, created_at FROM post_comments WHERE post_id = %s ORDER BY created_at ASC LIMIT 200",
        (post_id,),
    )
    return [dict(r) for r in rows]


@router.post("/posts/repost")
async def posts_repost(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    await dbm.execute("INSERT IGNORE INTO post_reposts (post_id, member_id) VALUES (%s,%s)", (post_id, member_id))
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_reposts WHERE post_id = %s", (post_id,))
    return {"ok": True, "repost_count": int(c["n"]) if c else 0, "reposted": True}


@router.post("/posts/unrepost")
async def posts_unrepost(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    await dbm.execute("DELETE FROM post_reposts WHERE post_id = %s AND member_id = %s", (post_id, member_id))
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_reposts WHERE post_id = %s", (post_id,))
    return {"ok": True, "repost_count": int(c["n"]) if c else 0, "reposted": False}


@router.post("/posts/send")
async def posts_send(body: dict):
    await ensure_tables()
    post_id = body.get("post_id")
    member_id = body.get("member_id")
    if not post_id or not member_id:
        return JSONResponse(status_code=400, content={"error": "BAD_REQUEST", "message": "post_id and member_id required"})
    sid = new_id("SEND")
    await dbm.execute("INSERT INTO post_sends (send_id, post_id, member_id) VALUES (%s,%s,%s)", (sid, post_id, member_id))
    c = await dbm.fetch_one("SELECT COUNT(*) AS n FROM post_sends WHERE post_id = %s", (post_id,))
    return {"ok": True, "send_id": sid, "send_count": int(c["n"]) if c else 0}
