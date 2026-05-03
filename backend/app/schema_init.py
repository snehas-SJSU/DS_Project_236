"""MySQL DDL aligned with Node services — runs once at API startup (non-blocking)."""

from __future__ import annotations

import logging
from typing import Any

from app import db as dbm

log = logging.getLogger(__name__)


async def _exec(sql: str, args: tuple | None = None) -> None:
    await dbm.execute(sql, args)


async def _ensure_col(table: str, col: str, ddl: str) -> None:
    row = await dbm.fetch_one(f"SHOW COLUMNS FROM `{table}` LIKE %s", (col,))
    if not row:
        try:
            await _exec(f"ALTER TABLE {table} ADD COLUMN {ddl}")
        except Exception as e:
            if "Duplicate" not in str(e) and "1060" not in str(e):
                log.warning("ensure_col %s.%s: %s", table, col, e)


async def init_all_schemas() -> None:
    await _members_tables()
    await _jobs_tables()
    await _applications_table()
    await _threads_table()
    await _connections_tables()
    await _posts_tables()
    await _recruiters_table()
    await _seed_auth_defaults()
    await _seed_baseline_member()
    await _seed_network_entities()
    await _seed_demo_posts()


async def _members_tables() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS members (
      member_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      title VARCHAR(150),
      headline VARCHAR(150),
      location VARCHAR(100),
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100),
      email VARCHAR(100),
      phone VARCHAR(30),
      about TEXT,
      summary TEXT,
      skills JSON,
      experience JSON,
      education JSON,
      profile_photo_url LONGTEXT,
      cover_photo_url LONGTEXT,
      cover_theme VARCHAR(30) DEFAULT 'blue',
      resume_url TEXT,
      resume_text MEDIUMTEXT,
      connections_count INT DEFAULT 0,
      profile_views INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_email (email)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS auth_users (
      user_id VARCHAR(50) PRIMARY KEY,
      email VARCHAR(120) UNIQUE NOT NULL,
      password_hash VARCHAR(256) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      name VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(512) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      email VARCHAR(120) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (expires_at)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS member_settings (
      member_id VARCHAR(50) PRIMARY KEY,
      profile_visibility TINYINT(1) DEFAULT 1,
      open_to_work TINYINT(1) DEFAULT 1,
      allow_messages TINYINT(1) DEFAULT 1,
      in_app_notifications_enabled TINYINT(1) DEFAULT 1,
      preferred_language VARCHAR(30) DEFAULT 'English',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS premium_memberships (
      member_id VARCHAR(50) PRIMARY KEY,
      plan_name VARCHAR(50) DEFAULT 'Career',
      status VARCHAR(20) DEFAULT 'inactive',
      started_at DATETIME NULL,
      expires_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS network_entities (
      entity_id VARCHAR(60) PRIMARY KEY,
      entity_type VARCHAR(30) NOT NULL,
      title VARCHAR(160) NOT NULL,
      subtitle VARCHAR(160) NULL,
      description TEXT NULL,
      route_path VARCHAR(255) NULL,
      cta_label VARCHAR(40) NULL,
      badge VARCHAR(80) NULL,
      members_count INT DEFAULT 0,
      sort_order INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS member_network_relations (
      member_id VARCHAR(50) NOT NULL,
      entity_id VARCHAR(60) NOT NULL,
      relation_status VARCHAR(20) DEFAULT 'active',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, entity_id),
      INDEX idx_network_member_status (member_id, relation_status)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS notifications (
      notification_id VARCHAR(50) PRIMARY KEY,
      member_id VARCHAR(50) NOT NULL,
      source_key VARCHAR(120) NOT NULL,
      category VARCHAR(20) NOT NULL DEFAULT 'mentions',
      title VARCHAR(160) NOT NULL,
      body TEXT NOT NULL,
      route_path VARCHAR(255) NULL,
      is_read TINYINT(1) DEFAULT 0,
      priority INT DEFAULT 0,
      created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      UNIQUE KEY uk_member_source (member_id, source_key),
      INDEX idx_notifications_member (member_id, is_read, created_at)
    )
    """
    )
    for col, ddl in [
        ("first_name", "first_name VARCHAR(100)"),
        ("last_name", "last_name VARCHAR(100)"),
        ("headline", "headline VARCHAR(150)"),
        ("city", "city VARCHAR(100)"),
        ("state", "state VARCHAR(100)"),
        ("country", "country VARCHAR(100)"),
        ("phone", "phone VARCHAR(30)"),
        ("summary", "summary TEXT"),
        ("profile_photo_url", "profile_photo_url LONGTEXT"),
        ("cover_photo_url", "cover_photo_url LONGTEXT"),
        ("cover_theme", 'cover_theme VARCHAR(30) DEFAULT "blue"'),
        ("resume_url", "resume_url TEXT"),
        ("resume_text", "resume_text MEDIUMTEXT"),
        ("connections_count", "connections_count INT DEFAULT 0"),
        ("profile_views", "profile_views INT DEFAULT 0"),
    ]:
        await _ensure_col("members", col, ddl)


async def _jobs_tables() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS jobs (
      job_id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255),
      company_id VARCHAR(50),
      company VARCHAR(255),
      industry VARCHAR(100),
      location VARCHAR(100),
      remote_mode VARCHAR(20),
      seniority_level VARCHAR(50),
      employment_type VARCHAR(50),
      salary VARCHAR(100),
      type VARCHAR(50),
      skills JSON,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      recruiter_id VARCHAR(50) DEFAULT 'R-default',
      views_count INT DEFAULT 0,
      saves_count INT DEFAULT 0,
      applicants_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS saved_jobs (
      job_id VARCHAR(50),
      member_id VARCHAR(50),
      saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (job_id, member_id),
      INDEX idx_saved_jobs_member_saved (member_id, saved_at)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS job_tracker_notes (
      member_id VARCHAR(50) NOT NULL,
      job_id VARCHAR(50) NOT NULL,
      note TEXT,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, job_id)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS job_tracker_archives (
      member_id VARCHAR(50) NOT NULL,
      job_id VARCHAR(50) NOT NULL,
      archived_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, job_id)
    )
    """
    )


async def _applications_table() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS applications (
      app_id VARCHAR(50) PRIMARY KEY,
      job_id VARCHAR(50),
      member_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'submitted',
      resume_url TEXT,
      resume_text TEXT,
      cover_letter TEXT,
      answers JSON,
      recruiter_note TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_job_member (job_id, member_id),
      INDEX (job_id),
      INDEX (member_id)
    )
    """
    )


async def _threads_table() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS message_threads (
      thread_id VARCHAR(50) PRIMARY KEY,
      participant_a VARCHAR(50),
      participant_b VARCHAR(50),
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_participant (participant_a, participant_b)
    )
    """
    )


async def _connections_tables() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS connection_requests (
      request_id VARCHAR(50) PRIMARY KEY,
      requester_id VARCHAR(50),
      receiver_id VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pair (requester_id, receiver_id)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS connections (
      user_a VARCHAR(50),
      user_b VARCHAR(50),
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_a, user_b)
    )
    """
    )


async def _posts_tables() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS posts (
      post_id VARCHAR(50) PRIMARY KEY,
      member_id VARCHAR(50) NOT NULL,
      author_name VARCHAR(255),
      author_headline VARCHAR(255) NULL,
      body TEXT NOT NULL,
      image_data LONGTEXT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_posts_member (member_id),
      INDEX idx_posts_created (created_at)
    )
    """
    )
    await _ensure_col("posts", "author_headline", "author_headline VARCHAR(255) NULL")
    await _ensure_col("posts", "quoted_post_id", "quoted_post_id VARCHAR(50) NULL")
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS post_likes (
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id),
      INDEX idx_likes_member (member_id)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS post_comments (
      comment_id VARCHAR(50) PRIMARY KEY,
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      author_name VARCHAR(255),
      body TEXT NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_comments_post (post_id)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS post_reposts (
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (post_id, member_id),
      INDEX idx_reposts_member (member_id)
    )
    """
    )
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS post_sends (
      send_id VARCHAR(50) PRIMARY KEY,
      post_id VARCHAR(50) NOT NULL,
      member_id VARCHAR(50) NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX idx_sends_post (post_id)
    )
    """
    )


async def _recruiters_table() -> None:
    await _exec(
        """
    CREATE TABLE IF NOT EXISTS recruiters (
      recruiter_id VARCHAR(50) PRIMARY KEY,
      company_id VARCHAR(50),
      name VARCHAR(100),
      email VARCHAR(100),
      phone VARCHAR(30),
      company_name VARCHAR(150),
      company_industry VARCHAR(100),
      company_size VARCHAR(50),
      access_level VARCHAR(50) DEFAULT 'admin',
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_recruiter_email (email)
    )
    """
    )


async def _seed_auth_defaults() -> None:
    from app.auth_utils import hash_password
    import secrets as sec

    dummy_email = "dummy.user@gmail.com"
    row = await dbm.fetch_one("SELECT user_id FROM auth_users WHERE email = %s LIMIT 1", (dummy_email,))
    if not row:
        salt = sec.token_hex(16)
        h = hash_password("Dummy@123", salt)
        await _exec(
            "INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (%s,%s,%s,%s,%s)",
            ("U-DUMMY01", dummy_email, h, salt, "Dummy User"),
        )

    admin_email = "admin@test.com"
    salt = sec.token_hex(16)
    h = hash_password("admin123", salt)
    row = await dbm.fetch_one("SELECT user_id FROM auth_users WHERE email = %s LIMIT 1", (admin_email,))
    if not row:
        await _exec(
            "INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (%s,%s,%s,%s,%s)",
            ("U-ADMIN01", admin_email, h, salt, "Admin Test"),
        )
    else:
        await _exec(
            "UPDATE auth_users SET password_hash = %s, password_salt = %s WHERE email = %s",
            (h, salt, admin_email),
        )


async def _seed_baseline_member() -> None:
    await _exec(
        """
    INSERT INTO members (
      member_id, name, first_name, last_name, title, headline, location, city, state, country,
      email, about, summary, skills, experience, education, cover_theme, status
    )
    VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,%s,'active')
    ON DUPLICATE KEY UPDATE
      name=VALUES(name), first_name=VALUES(first_name), last_name=VALUES(last_name), title=VALUES(title),
      headline=VALUES(headline), location=VALUES(location), city=VALUES(city), state=VALUES(state), country=VALUES(country),
      email=VALUES(email), about=VALUES(about), summary=VALUES(summary), skills=VALUES(skills),
      experience=VALUES(experience), education=VALUES(education), cover_theme=VALUES(cover_theme), status='active'
    """,
        (
            "M-123",
            "Sneha Singh",
            "Sneha",
            "Singh",
            "Full Stack AI Engineer | Specializing in Distributed Systems",
            "Full Stack AI Engineer | Specializing in Distributed Systems",
            "San Jose, California",
            "San Jose",
            "California",
            "United States",
            "sneha.singh@example.com",
            "Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.",
            "Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.",
            '["Distributed Systems", "React.js", "Kafka & APIs", "Node.js", "Python", "MySQL"]',
            '[{"role":"Software Engineer Intern","company":"LinkedIn","period":"May 2023 - Present","description":"Developed microservices using Node.js and Kafka with Redis-backed caching and event-driven workflows."}]',
            '[{"school":"San Jose State University","degree":"Master of Science - Computer Science","period":"2022 - 2024"}]',
            "blue",
        ),
    )
    await _exec(
        """INSERT IGNORE INTO member_settings
        (member_id, profile_visibility, open_to_work, allow_messages, in_app_notifications_enabled, preferred_language)
        VALUES ('M-123',1,1,1,1,'English')"""
    )


NETWORK_ENTITY_SEED: list[dict[str, Any]] = [
    {"entity_id": "NE-PAGE-ACME", "entity_type": "pages", "title": "Acme Engineering", "subtitle": "Company page", "description": "Product updates, hiring announcements, and engineering articles from Acme.", "route_path": "/company/acme", "cta_label": "Follow", "badge": "Hiring now", "members_count": 1842, "sort_order": 10},
    {"entity_id": "NE-PAGE-NOVA", "entity_type": "pages", "title": "Nova Labs Careers", "subtitle": "Company page", "description": "Follow recruiting updates and featured openings from Nova Labs.", "route_path": "/jobs", "cta_label": "Follow", "badge": "Featured jobs", "members_count": 931, "sort_order": 20},
    {"entity_id": "NE-GROUP-DIST", "entity_type": "groups", "title": "Distributed Systems Group", "subtitle": "Professional group", "description": "Architecture reviews, scalability discussions, and weekly system design prompts.", "route_path": "/network", "cta_label": "Join", "badge": "12 new posts this week", "members_count": 642, "sort_order": 30},
]


async def _seed_network_entities() -> None:
    for e in NETWORK_ENTITY_SEED:
        await _exec(
            """INSERT INTO network_entities
            (entity_id, entity_type, title, subtitle, description, route_path, cta_label, badge, members_count, sort_order)
            VALUES (%s,%s,%s,%s,%s,%s,%s,%s,%s,%s)
            ON DUPLICATE KEY UPDATE
            entity_type=VALUES(entity_type), title=VALUES(title), subtitle=VALUES(subtitle), description=VALUES(description),
            route_path=VALUES(route_path), cta_label=VALUES(cta_label), badge=VALUES(badge),
            members_count=GREATEST(members_count, VALUES(members_count)), sort_order=VALUES(sort_order)""",
            (
                e["entity_id"],
                e["entity_type"],
                e["title"],
                e["subtitle"],
                e["description"],
                e["route_path"],
                e["cta_label"],
                e["badge"],
                e["members_count"],
                e["sort_order"],
            ),
        )


DEMO_SEED_POSTS = [
    ("P-SEED-ALEX", "M-DEMO-01", "Alex Chen", "Senior Engineer at Acme", "Shipped a Kafka retry strategy that cut duplicate writes by 92%.", "https://images.unsplash.com/photo-1518773553398-650c184e0bb3?auto=format&fit=crop&w=1200&q=80"),
    ("P-SEED-PRIYA", "M-DEMO-02", "Priya Kapoor", "Recruiter at Nova Labs", "Hiring for distributed systems and backend interns.", None),
]


async def _seed_demo_posts() -> None:
    for post_id, mid, name, headline, body, img in DEMO_SEED_POSTS:
        await _exec(
            "INSERT IGNORE INTO posts (post_id, member_id, author_name, author_headline, body, image_data) VALUES (%s,%s,%s,%s,%s,%s)",
            (post_id, mid, name, headline, body, img),
        )
