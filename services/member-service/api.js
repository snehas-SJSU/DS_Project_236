const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
// Default 100kb breaks base64 avatars and large profile payloads (413 Payload Too Large).
// Whole JSON body must hold base64 data URLs (~4/3 size of raw image) + JSON overhead.
app.use(express.json({ limit: '50mb' }));
const producer = kafka.producer();

const CACHE_PREFIX = 'member:';
const CACHE_TTL = 600;
const AUTH_TOKEN_TTL_HOURS = 24;
const JWT_SECRET = process.env.JWT_SECRET || 'linkedin-sim-dev-secret';
const DEFAULT_SETTINGS = {
  profileVisibility: true,
  openToWork: true,
  allowMessages: true,
  inAppNotificationsEnabled: true,
  preferredLanguage: 'English'
};
const NETWORK_ENTITY_SEED = [
  {
    entity_id: 'NE-PAGE-ACME',
    entity_type: 'pages',
    title: 'Acme Engineering',
    subtitle: 'Company page',
    description: 'Product updates, hiring announcements, and engineering articles from Acme.',
    route_path: '/company/acme',
    cta_label: 'Follow',
    badge: 'Hiring now',
    members_count: 1842,
    sort_order: 10
  },
  {
    entity_id: 'NE-PAGE-NOVA',
    entity_type: 'pages',
    title: 'Nova Labs Careers',
    subtitle: 'Company page',
    description: 'Follow recruiting updates and featured openings from Nova Labs.',
    route_path: '/jobs',
    cta_label: 'Follow',
    badge: 'Featured jobs',
    members_count: 931,
    sort_order: 20
  },
  {
    entity_id: 'NE-GROUP-DIST',
    entity_type: 'groups',
    title: 'Distributed Systems Group',
    subtitle: 'Professional group',
    description: 'Architecture reviews, scalability discussions, and weekly system design prompts.',
    route_path: '/network',
    cta_label: 'Join',
    badge: '12 new posts this week',
    members_count: 642,
    sort_order: 30
  },
  {
    entity_id: 'NE-GROUP-DATA',
    entity_type: 'groups',
    title: 'Data Engineering Circle',
    subtitle: 'Professional group',
    description: 'Warehouse design, streaming pipelines, and analytics engineering conversations.',
    route_path: '/network',
    cta_label: 'Join',
    badge: '4 upcoming events',
    members_count: 488,
    sort_order: 40
  },
  {
    entity_id: 'NE-EVENT-KAFKA',
    entity_type: 'events',
    title: 'Kafka Best Practices Webinar',
    subtitle: 'Thu 7:00 PM',
    description: 'A live session on stream design, topic naming, and scaling consumers.',
    route_path: '/network/events',
    cta_label: 'Attend',
    badge: 'Online event',
    members_count: 207,
    sort_order: 50
  },
  {
    entity_id: 'NE-EVENT-FAIR',
    entity_type: 'events',
    title: 'Backend Hiring Fair',
    subtitle: 'Sat 10:00 AM',
    description: 'Meet recruiting teams and discover open backend and platform roles.',
    route_path: '/jobs',
    cta_label: 'Attend',
    badge: 'Career event',
    members_count: 319,
    sort_order: 60
  },
  {
    entity_id: 'NE-NEWS-SDW',
    entity_type: 'newsletters',
    title: 'System Design Weekly',
    subtitle: 'Newsletter',
    description: 'A weekly digest of architecture case studies and system design patterns.',
    route_path: '/profile/activity',
    cta_label: 'Subscribe',
    badge: 'New issue today',
    members_count: 1294,
    sort_order: 70
  },
  {
    entity_id: 'NE-NEWS-CAREER',
    entity_type: 'newsletters',
    title: 'Career Growth Notes',
    subtitle: 'Newsletter',
    description: 'Hiring trends, networking tips, and interview prep guidance each week.',
    route_path: '/profile/activity',
    cta_label: 'Subscribe',
    badge: 'Weekly edition',
    members_count: 874,
    sort_order: 80
  },
  {
    entity_id: 'NE-FOLLOW-CLOUD',
    entity_type: 'following',
    title: 'Cloud Native Weekly',
    subtitle: 'Topic & creator feed',
    description: 'Follow cloud-native updates, container trends, and platform engineering stories.',
    route_path: '/network/newsletters',
    cta_label: 'Follow',
    badge: 'Weekly updates',
    members_count: 1510,
    sort_order: 90
  }
];
const BASELINE_MEMBER = {
  member_id: 'M-123',
  name: 'Sneha Singh',
  first_name: 'Sneha',
  last_name: 'Singh',
  title: 'Full Stack AI Engineer | Specializing in Distributed Systems',
  headline: 'Full Stack AI Engineer | Specializing in Distributed Systems',
  location: 'San Jose, California',
  city: 'San Jose',
  state: 'California',
  country: 'United States',
  email: 'sneha.singh@example.com',
  about:
    'Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.',
  summary:
    'Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows.',
  skills: ['Distributed Systems', 'React.js', 'Kafka & APIs', 'Node.js', 'Python', 'MySQL'],
  experience: [
    {
      role: 'Software Engineer Intern',
      company: 'LinkedIn',
      period: 'May 2023 - Present',
      description: 'Developed microservices using Node.js and Kafka with Redis-backed caching and event-driven workflows.'
    }
  ],
  education: [
    {
      school: 'San Jose State University',
      degree: 'Master of Science - Computer Science',
      period: '2022 - 2024'
    }
  ]
};

function hashPassword(password, salt) {
  return crypto.pbkdf2Sync(password, salt, 100000, 64, 'sha512').toString('hex');
}

function createJwtToken(payload) {
  return jwt.sign(payload, JWT_SECRET, { expiresIn: `${AUTH_TOKEN_TTL_HOURS}h` });
}

function verifyJwtToken(token) {
  try {
    return jwt.verify(token, JWT_SECRET);
  } catch {
    return null;
  }
}

function isValidEmail(email) {
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(String(email || '').trim());
}

function isStrongPassword(password) {
  const val = String(password || '');
  return (
    val.length >= 7 &&
    /[A-Z]/.test(val) &&
    /[a-z]/.test(val) &&
    /\d/.test(val) &&
    /[^A-Za-z0-9]/.test(val)
  );
}

async function ensureBaselineMember() {
  const payload = BASELINE_MEMBER;
  await db.query(
    `INSERT INTO members (
      member_id, name, first_name, last_name, title, headline, location, city, state, country,
      email, about, summary, skills, experience, education, cover_theme, status
    )
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
    ON DUPLICATE KEY UPDATE
      name=VALUES(name),
      first_name=VALUES(first_name),
      last_name=VALUES(last_name),
      title=VALUES(title),
      headline=VALUES(headline),
      location=VALUES(location),
      city=VALUES(city),
      state=VALUES(state),
      country=VALUES(country),
      email=VALUES(email),
      about=VALUES(about),
      summary=VALUES(summary),
      skills=VALUES(skills),
      experience=VALUES(experience),
      education=VALUES(education),
      cover_theme=VALUES(cover_theme),
      status='active'`,
    [
      payload.member_id,
      payload.name,
      payload.first_name,
      payload.last_name,
      payload.title,
      payload.headline,
      payload.location,
      payload.city,
      payload.state,
      payload.country,
      payload.email,
      payload.about,
      payload.summary,
      JSON.stringify(payload.skills),
      JSON.stringify(payload.experience),
      JSON.stringify(payload.education),
      'blue'
    ]
  );
}

async function getSession(token) {
  const [rows] = await db.query(
    'SELECT user_id, email, expires_at FROM auth_sessions WHERE token = ? LIMIT 1',
    [token]
  );
  if (!rows.length) return null;
  const session = rows[0];
  if (new Date(session.expires_at).getTime() < Date.now()) {
    await db.query('DELETE FROM auth_sessions WHERE token = ?', [token]);
    return null;
  }
  return session;
}

function normalizeBool(value, fallback) {
  if (value === undefined || value === null) return fallback;
  return value === true || value === 1 || value === '1' || value === 'true';
}

async function ensureMemberSettingsRow(memberId) {
  await db.query(
    `INSERT IGNORE INTO member_settings
      (member_id, profile_visibility, open_to_work, allow_messages, in_app_notifications_enabled, preferred_language)
     VALUES (?, ?, ?, ?, ?, ?)`,
    [
      memberId,
      DEFAULT_SETTINGS.profileVisibility ? 1 : 0,
      DEFAULT_SETTINGS.openToWork ? 1 : 0,
      DEFAULT_SETTINGS.allowMessages ? 1 : 0,
      DEFAULT_SETTINGS.inAppNotificationsEnabled ? 1 : 0,
      DEFAULT_SETTINGS.preferredLanguage
    ]
  );
}

async function readMemberSettings(memberId) {
  await ensureMemberSettingsRow(memberId);
  const [rows] = await db.query('SELECT * FROM member_settings WHERE member_id = ? LIMIT 1', [memberId]);
  const row = rows[0] || {};
  return {
    member_id: memberId,
    profileVisibility: normalizeBool(row.profile_visibility, DEFAULT_SETTINGS.profileVisibility),
    openToWork: normalizeBool(row.open_to_work, DEFAULT_SETTINGS.openToWork),
    allowMessages: normalizeBool(row.allow_messages, DEFAULT_SETTINGS.allowMessages),
    inAppNotificationsEnabled: normalizeBool(row.in_app_notifications_enabled, DEFAULT_SETTINGS.inAppNotificationsEnabled),
    preferredLanguage: row.preferred_language || DEFAULT_SETTINGS.preferredLanguage
  };
}

async function seedNetworkEntities() {
  for (const entity of NETWORK_ENTITY_SEED) {
    await db.query(
      `INSERT INTO network_entities
        (entity_id, entity_type, title, subtitle, description, route_path, cta_label, badge, members_count, sort_order)
       VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        entity_type = VALUES(entity_type),
        title = VALUES(title),
        subtitle = VALUES(subtitle),
        description = VALUES(description),
        route_path = VALUES(route_path),
        cta_label = VALUES(cta_label),
        badge = VALUES(badge),
        members_count = GREATEST(members_count, VALUES(members_count)),
        sort_order = VALUES(sort_order)`,
      [
        entity.entity_id,
        entity.entity_type,
        entity.title,
        entity.subtitle,
        entity.description,
        entity.route_path,
        entity.cta_label,
        entity.badge,
        entity.members_count,
        entity.sort_order
      ]
    );
  }
}

async function upsertNotification(memberId, sourceKey, payload) {
  await db.query(
    `INSERT INTO notifications
      (notification_id, member_id, source_key, category, title, body, route_path, created_at, priority)
     VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
     ON DUPLICATE KEY UPDATE
      category = VALUES(category),
      title = VALUES(title),
      body = VALUES(body),
      route_path = VALUES(route_path),
      priority = VALUES(priority)`,
    [
      `N-${crypto.randomUUID().slice(0, 8)}`,
      memberId,
      sourceKey,
      payload.category,
      payload.title,
      payload.body,
      payload.route_path || null,
      payload.created_at || new Date(),
      payload.priority || 0
    ]
  );
}

async function syncNotifications(memberId) {
  await ensureMemberSettingsRow(memberId);
  const safeRows = async (sql, params = []) => {
    try {
      const [rows] = await db.query(sql, params);
      return rows;
    } catch {
      return [];
    }
  };

  const incomingRequests = await safeRows(
    `SELECT request_id, requester_id, created_at
     FROM connection_requests
     WHERE receiver_id = ? AND status = 'pending'
     ORDER BY created_at DESC
     LIMIT 10`,
    [memberId]
  );
  for (const row of incomingRequests) {
    await upsertNotification(memberId, `conn-in-${row.request_id}`, {
      category: 'mentions',
      title: 'New connection request',
      body: `${row.requester_id} sent you a connection request.`,
      route_path: '/network/invitations',
      created_at: row.created_at,
      priority: 2
    });
  }

  const applications = await safeRows(
    `SELECT app_id, job_id, status, applied_at
     FROM applications
     WHERE member_id = ?
     ORDER BY applied_at DESC
     LIMIT 12`,
    [memberId]
  );
  for (const row of applications) {
    await upsertNotification(memberId, `app-${row.app_id}`, {
      category: 'jobs',
      title: 'Application update',
      body: `Application ${String(row.status || 'submitted').toLowerCase()} for job ${row.job_id}.`,
      route_path: '/applications',
      created_at: row.applied_at,
      priority: 2
    });
  }

  const threads = await safeRows(
    `SELECT thread_id, participant_a, participant_b, last_activity
     FROM message_threads
     WHERE participant_a = ? OR participant_b = ?
     ORDER BY last_activity DESC
     LIMIT 8`,
    [memberId, memberId]
  );
  for (const row of threads) {
    const peerId = row.participant_a === memberId ? row.participant_b : row.participant_a;
    await upsertNotification(memberId, `thread-${row.thread_id}`, {
      category: 'mentions',
      title: 'Message activity',
      body: `New activity in your conversation with ${peerId}.`,
      route_path: '/messaging',
      created_at: row.last_activity,
      priority: 1
    });
  }

  const jobs = await safeRows(
    `SELECT job_id, title, company, created_at
     FROM jobs
     WHERE status = 'open'
     ORDER BY created_at DESC
     LIMIT 4`
  );
  for (const row of jobs) {
    await upsertNotification(memberId, `job-alert-${row.job_id}`, {
      category: 'jobs',
      title: 'New job alert',
      body: `${row.title} at ${row.company} is actively hiring.`,
      route_path: '/jobs',
      created_at: row.created_at,
      priority: 0
    });
  }

  const posts = await safeRows(
    `SELECT post_id, created_at
     FROM posts
     WHERE member_id = ?
     ORDER BY created_at DESC
     LIMIT 4`,
    [memberId]
  );
  for (const row of posts) {
    await upsertNotification(memberId, `post-${row.post_id}`, {
      category: 'posts',
      title: 'Your post is live',
      body: 'Your recent post is visible in the feed and ready for engagement.',
      route_path: '/profile/activity',
      created_at: row.created_at,
      priority: 0
    });
  }

  const premiumRows = await safeRows(
    'SELECT plan_name, status, expires_at, started_at FROM premium_memberships WHERE member_id = ? LIMIT 1',
    [memberId]
  );
  if (premiumRows.length && premiumRows[0].status === 'active') {
    await upsertNotification(memberId, 'premium-active', {
      category: 'mentions',
      title: `${premiumRows[0].plan_name} Premium active`,
      body: 'Your premium membership is active and premium-only insights are unlocked.',
      route_path: '/premium',
      created_at: premiumRows[0].started_at,
      priority: 1
    });
  }
}

function envelope(eventType, traceId, actorId, entityType, entityId, payload, idempotencyKey) {
  return {
    event_type: eventType,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    actor_id: actorId || 'system',
    entity: { entity_type: entityType, entity_id: entityId },
    payload,
    idempotency_key: idempotencyKey
  };
}

function normalizeMemberPayload(body, partial = false) {
  const has = (key) => Object.prototype.hasOwnProperty.call(body, key);
  const firstName =
    has('first_name') ? body.first_name :
    has('firstName') ? body.firstName :
    (!partial && body.name ? String(body.name).split(' ')[0] : undefined);
  const lastName =
    has('last_name') ? body.last_name :
    has('lastName') ? body.lastName :
    (!partial && body.name ? String(body.name).split(' ').slice(1).join(' ') : undefined);
  const headline = has('headline') ? body.headline : has('title') ? body.title : undefined;
  const city = has('city') ? body.city : undefined;
  const state = has('state') ? body.state : undefined;
  const country = has('country') ? body.country : undefined;
  const location = has('location') ? body.location : (!partial ? [city, state, country].filter(Boolean).join(', ') || null : undefined);
  const about = has('about') ? body.about : has('summary') ? body.summary : undefined;
  const fullName = has('name') ? body.name : (!partial ? [firstName, lastName].filter(Boolean).join(' ').trim() : undefined);
  return {
    first_name: firstName,
    last_name: lastName,
    name: fullName,
    email: has('email') ? body.email : undefined,
    phone: has('phone') ? body.phone : undefined,
    city,
    state,
    country,
    location,
    headline,
    title: headline !== undefined ? headline : undefined,
    about,
    summary: about !== undefined ? about : undefined,
    skills: has('skills') ? body.skills : undefined,
    experience: has('experience') ? body.experience : undefined,
    education: has('education') ? body.education : undefined,
    profile_photo_url: has('profile_photo_url') ? body.profile_photo_url : undefined,
    cover_photo_url: has('cover_photo_url') ? body.cover_photo_url : undefined,
    cover_theme: has('cover_theme') ? body.cover_theme : undefined,
    resume_url: has('resume_url') ? body.resume_url : undefined,
    resume_text: has('resume_text') ? body.resume_text : undefined
  };
}

// Auth: Signup
app.post('/auth/signup', async (req, res) => {
  try {
    const { email, password, name } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!isValidEmail(emailNorm)) {
      return res.status(400).json({ error: 'INVALID_EMAIL', message: 'Please enter a valid email address.', trace_id: crypto.randomUUID() });
    }
    if (!isStrongPassword(password)) {
      return res.status(400).json({
        error: 'WEAK_PASSWORD',
        message: 'Password must be at least 7 characters and include uppercase, lowercase, number, and special character.',
        trace_id: crypto.randomUUID()
      });
    }

    const [existing] = await db.query('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1', [emailNorm]);
    if (existing.length) {
      return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'An account with this email already exists.', trace_id: crypto.randomUUID() });
    }

    const userId = 'U-' + crypto.randomUUID().substring(0, 8);
    const salt = crypto.randomBytes(16).toString('hex');
    const passwordHash = hashPassword(password, salt);
    await db.query(
      'INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (?, ?, ?, ?, ?)',
      [userId, emailNorm, passwordHash, salt, name || null]
    );

    const token = createJwtToken({ user_id: userId, email: emailNorm });
    await db.query(
      'INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
      [token, userId, emailNorm, AUTH_TOKEN_TTL_HOURS]
    );

    return res.status(201).json({
      token,
      user: { user_id: userId, email: emailNorm, name: name || null },
      message: 'Signup successful'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Auth: Login
app.post('/auth/login', async (req, res) => {
  try {
    const { email, password } = req.body || {};
    const emailNorm = String(email || '').trim().toLowerCase();
    if (!isValidEmail(emailNorm) || !password) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'Valid email and password are required.', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query(
      'SELECT user_id, email, password_hash, password_salt, name FROM auth_users WHERE email = ? LIMIT 1',
      [emailNorm]
    );
    if (!rows.length) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', trace_id: crypto.randomUUID() });
    }
    const user = rows[0];
    const incomingHash = hashPassword(password, user.password_salt);
    if (incomingHash !== user.password_hash) {
      return res.status(401).json({ error: 'INVALID_CREDENTIALS', message: 'Invalid email or password.', trace_id: crypto.randomUUID() });
    }

    const token = createJwtToken({ user_id: user.user_id, email: user.email });
    await db.query(
      'INSERT INTO auth_sessions (token, user_id, email, expires_at) VALUES (?, ?, ?, DATE_ADD(NOW(), INTERVAL ? HOUR))',
      [token, user.user_id, user.email, AUTH_TOKEN_TTL_HOURS]
    );
    return res.status(200).json({
      token,
      user: { user_id: user.user_id, email: user.email, name: user.name || null },
      message: 'Login successful'
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Auth: Me
app.get('/auth/me', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing token', trace_id: crypto.randomUUID() });
    }
    const decoded = verifyJwtToken(token);
    if (!decoded) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Missing or expired JWT token', trace_id: crypto.randomUUID() });
    }
    const session = await getSession(token);
    if (!session) {
      return res.status(401).json({ error: 'UNAUTHORIZED', message: 'Session expired or invalid', trace_id: crypto.randomUUID() });
    }
    const [users] = await db.query('SELECT user_id, email, name FROM auth_users WHERE user_id = ? LIMIT 1', [decoded.user_id]);
    if (!users.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'User not found', trace_id: crypto.randomUUID() });
    }
    return res.status(200).json({ user: users[0] });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Auth: Logout
app.post('/auth/logout', async (req, res) => {
  try {
    const authHeader = req.headers.authorization || '';
    const token = authHeader.startsWith('Bearer ') ? authHeader.slice(7) : '';
    if (!token) return res.status(200).json({ message: 'Logged out' });
    await db.query('DELETE FROM auth_sessions WHERE token = ?', [token]);
    return res.status(200).json({ message: 'Logged out' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/settings/get', async (req, res) => {
  try {
    const { member_id } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    return res.status(200).json(await readMemberSettings(member_id));
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/settings/update', async (req, res) => {
  try {
    const { member_id } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    const current = await readMemberSettings(member_id);
    const next = {
      profileVisibility: normalizeBool(req.body?.profileVisibility, current.profileVisibility),
      openToWork: normalizeBool(req.body?.openToWork, current.openToWork),
      allowMessages: normalizeBool(req.body?.allowMessages, current.allowMessages),
      inAppNotificationsEnabled: normalizeBool(req.body?.inAppNotificationsEnabled, current.inAppNotificationsEnabled),
      preferredLanguage: String(req.body?.preferredLanguage || current.preferredLanguage || DEFAULT_SETTINGS.preferredLanguage).trim() || DEFAULT_SETTINGS.preferredLanguage
    };
    await db.query(
      `INSERT INTO member_settings
        (member_id, profile_visibility, open_to_work, allow_messages, in_app_notifications_enabled, preferred_language)
       VALUES (?, ?, ?, ?, ?, ?)
       ON DUPLICATE KEY UPDATE
        profile_visibility = VALUES(profile_visibility),
        open_to_work = VALUES(open_to_work),
        allow_messages = VALUES(allow_messages),
        in_app_notifications_enabled = VALUES(in_app_notifications_enabled),
        preferred_language = VALUES(preferred_language)`,
      [
        member_id,
        next.profileVisibility ? 1 : 0,
        next.openToWork ? 1 : 0,
        next.allowMessages ? 1 : 0,
        next.inAppNotificationsEnabled ? 1 : 0,
        next.preferredLanguage
      ]
    );
    return res.status(200).json({ message: 'Settings saved', settings: { member_id, ...next } });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/premium/status', async (req, res) => {
  try {
    const { member_id } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query(
      'SELECT member_id, plan_name, status, started_at, expires_at FROM premium_memberships WHERE member_id = ? LIMIT 1',
      [member_id]
    );
    if (!rows.length) {
      return res.status(200).json({ member_id, status: 'inactive', is_active: false, plan_name: null });
    }
    const row = rows[0];
    const isActive = row.status === 'active' && (!row.expires_at || new Date(row.expires_at).getTime() > Date.now());
    return res.status(200).json({
      member_id,
      plan_name: row.plan_name,
      status: isActive ? 'active' : row.status,
      is_active: isActive,
      started_at: row.started_at,
      expires_at: row.expires_at
    });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/premium/activate', async (req, res) => {
  try {
    const { member_id, plan_name = 'Career' } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    await db.query(
      `INSERT INTO premium_memberships (member_id, plan_name, status, started_at, expires_at)
       VALUES (?, ?, 'active', NOW(), DATE_ADD(NOW(), INTERVAL 30 DAY))
       ON DUPLICATE KEY UPDATE
        plan_name = VALUES(plan_name),
        status = 'active',
        started_at = NOW(),
        expires_at = DATE_ADD(NOW(), INTERVAL 30 DAY)`,
      [member_id, String(plan_name || 'Career')]
    );
    await upsertNotification(member_id, 'premium-active', {
      category: 'mentions',
      title: `${plan_name} Premium activated`,
      body: 'Premium-only insights and controls are now available on your account.',
      route_path: '/premium',
      created_at: new Date(),
      priority: 2
    });
    return res.status(200).json({ member_id, status: 'active', is_active: true, plan_name: String(plan_name || 'Career') });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/network/catalog', async (req, res) => {
  try {
    const { member_id, type } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    await seedNetworkEntities();
    let sql = `
      SELECT e.*, r.relation_status, r.joined_at
      FROM network_entities e
      LEFT JOIN member_network_relations r
        ON r.entity_id = e.entity_id AND r.member_id = ?
    `;
    const params = [member_id];
    if (type) {
      sql += ' WHERE e.entity_type = ?';
      params.push(String(type));
    }
    sql += ' ORDER BY e.sort_order ASC, e.title ASC';
    const [rows] = await db.query(sql, params);
    return res.status(200).json(
      rows.map((row) => ({
        entity_id: row.entity_id,
        entity_type: row.entity_type,
        title: row.title,
        subtitle: row.subtitle,
        description: row.description,
        route_path: row.route_path,
        badge: row.badge,
        members_count: Number(row.members_count || 0),
        is_active: row.relation_status === 'active',
        action_label:
          row.entity_type === 'groups' || row.entity_type === 'events'
            ? row.relation_status === 'active' ? 'Leave' : 'Join'
            : row.relation_status === 'active' ? 'Following' : 'Follow',
        joined_at: row.joined_at
      }))
    );
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/network/update', async (req, res) => {
  try {
    const { member_id, entity_id, is_active } = req.body || {};
    if (!member_id || !entity_id || typeof is_active !== 'boolean') {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id, entity_id and is_active required', trace_id: crypto.randomUUID() });
    }
    const [entities] = await db.query('SELECT entity_id FROM network_entities WHERE entity_id = ? LIMIT 1', [entity_id]);
    if (!entities.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Network item not found', trace_id: crypto.randomUUID() });
    }
    await db.query(
      `INSERT INTO member_network_relations (member_id, entity_id, relation_status, joined_at)
       VALUES (?, ?, ?, NOW())
       ON DUPLICATE KEY UPDATE
        relation_status = VALUES(relation_status),
        joined_at = CASE WHEN VALUES(relation_status) = 'active' THEN NOW() ELSE joined_at END`,
      [member_id, entity_id, is_active ? 'active' : 'inactive']
    );
    await db.query(
      `UPDATE network_entities
       SET members_count = GREATEST(COALESCE(members_count, 0) + ?, 0)
       WHERE entity_id = ?`,
      [is_active ? 1 : -1, entity_id]
    );
    return res.status(200).json({ member_id, entity_id, is_active });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/notifications/list', async (req, res) => {
  try {
    const { member_id, category = 'all', limit = 50 } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    await syncNotifications(member_id);
    const params = [member_id];
    let sql = `
      SELECT notification_id, category, title, body, route_path, is_read, created_at, priority
      FROM notifications
      WHERE member_id = ?
    `;
    if (category && category !== 'all') {
      sql += ' AND category = ?';
      params.push(String(category));
    }
    sql += ' ORDER BY is_read ASC, priority DESC, created_at DESC LIMIT ?';
    params.push(Math.min(Math.max(Number(limit) || 20, 1), 100));
    const [rows] = await db.query(sql, params);
    return res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/notifications/markRead', async (req, res) => {
  try {
    const { member_id, notification_ids } = req.body || {};
    if (!member_id || !Array.isArray(notification_ids) || !notification_ids.length) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id and notification_ids required', trace_id: crypto.randomUUID() });
    }
    await db.query(
      `UPDATE notifications
       SET is_read = 1
       WHERE member_id = ? AND notification_id IN (${notification_ids.map(() => '?').join(',')})`,
      [member_id, ...notification_ids]
    );
    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/members/notifications/markAllRead', async (req, res) => {
  try {
    const { member_id, category = 'all' } = req.body || {};
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    if (category && category !== 'all') {
      await db.query('UPDATE notifications SET is_read = 1 WHERE member_id = ? AND category = ?', [member_id, String(category)]);
    } else {
      await db.query('UPDATE notifications SET is_read = 1 WHERE member_id = ?', [member_id]);
    }
    return res.status(200).json({ message: 'Notifications marked as read' });
  } catch (err) {
    console.error(err);
    return res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Create Member — duplicate email => 409
app.post('/members/create', async (req, res) => {
  try {
    const normalized = normalizeMemberPayload(req.body || {});
    if (!normalized.email) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'email required', trace_id: crypto.randomUUID() });
    }

    const [dup] = await db.query('SELECT member_id FROM members WHERE email = ? AND status != ?', [normalized.email, 'deleted']);
    if (dup.length) {
      return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'A member with this email already exists', trace_id: crypto.randomUUID() });
    }

    const memberId = 'M-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    const idempotencyKey = req.headers['idempotency-key'] || crypto.randomUUID();

    await producer.connect();
    const eventPayload = envelope('member.created', traceId, memberId, 'member', memberId, {
      ...normalized
    }, idempotencyKey);

    await producer.send({
      topic: 'member.events',
      messages: [{ key: memberId, value: JSON.stringify(eventPayload) }]
    });

    res.status(201).json({ message: 'Member creation requested', member_id: memberId, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: String(err.message), trace_id: crypto.randomUUID() });
  }
});

// Get Member — Redis cache (optional: if Redis is down, still serve from MySQL)
app.post('/members/get', async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }

    let redisUsable = false;
    try {
      await redisModule.connectRedis();
      redisUsable = true;
      const cached = await redisModule.client.get(CACHE_PREFIX + member_id);
      if (cached) {
        return res.status(200).json(JSON.parse(cached));
      }
    } catch (e) {
      console.warn('Redis unavailable for member get, using MySQL only:', e.message);
    }

    const [rows] = await db.query('SELECT * FROM members WHERE member_id = ? AND status != ?', [member_id, 'deleted']);
    if (rows.length === 0) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Member not found', trace_id: crypto.randomUUID() });
    }

    const member = rows[0];
    const formatted = {
      ...member,
      profile_views_daily: member.profile_views,
      skills: typeof member.skills === 'string' ? JSON.parse(member.skills || '[]') : member.skills,
      experience: typeof member.experience === 'string' ? JSON.parse(member.experience || '[]') : member.experience,
      education: typeof member.education === 'string' ? JSON.parse(member.education || '[]') : member.education
    };

    if (redisUsable) {
      try {
        await redisModule.client.setEx(CACHE_PREFIX + member_id, CACHE_TTL, JSON.stringify(formatted));
      } catch (e) {
        console.warn('Redis setEx skipped:', e.message);
      }
    }
    res.status(200).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Partial update + cache invalidation
app.post('/members/update', async (req, res) => {
  try {
    const { member_id, ...fields } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }

    const mapped = normalizeMemberPayload(fields, true);
    const merged = { ...fields, ...mapped };
    const allowed = [
      'name', 'first_name', 'last_name', 'title', 'headline', 'location',
      'city', 'state', 'country', 'email', 'phone', 'about', 'summary',
      'skills', 'experience', 'education', 'profile_photo_url', 'cover_photo_url', 'cover_theme', 'resume_url', 'resume_text'
    ];
    const updates = [];
    const vals = [];
    for (const k of allowed) {
      if (merged[k] !== undefined) {
        updates.push(`${k} = ?`);
        vals.push(['skills', 'experience', 'education'].includes(k) ? JSON.stringify(merged[k]) : merged[k]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update', trace_id: crypto.randomUUID() });
    }

    if (merged.email) {
      const [e] = await db.query('SELECT member_id FROM members WHERE email = ? AND member_id != ?', [merged.email, member_id]);
      if (e.length) {
        return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'Email already in use', trace_id: crypto.randomUUID() });
      }
    }

    vals.push(member_id);
    await db.query(`UPDATE members SET ${updates.join(', ')} WHERE member_id = ?`, vals);

    try {
      await redisModule.connectRedis();
      await redisModule.client.del(CACHE_PREFIX + member_id);
    } catch (e) {
      console.warn('Redis cache delete skipped:', e.message);
    }

    res.status(200).json({ message: 'Updated', member_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Soft delete
app.post('/members/delete', async (req, res) => {
  try {
    const { member_id } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }

    await db.query('UPDATE members SET status = ? WHERE member_id = ?', ['deleted', member_id]);
    try {
      await redisModule.connectRedis();
      await redisModule.client.del(CACHE_PREFIX + member_id);
    } catch (e) {
      console.warn('Redis cache delete skipped:', e.message);
    }

    res.status(200).json({ message: 'Soft-deleted', member_id });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

// Search
app.post('/members/search', async (req, res) => {
  try {
    const { keyword, location, skill } = req.body;
    const normalizedKeyword = String(keyword || '').trim().toLowerCase();
    const normalizedLocation = String(location || '').trim().toLowerCase();
    const normalizedSkill = String(skill || '').trim().toLowerCase();
    let sql = 'SELECT * FROM members WHERE status != ?';
    const params = ['deleted'];
    if (normalizedKeyword) {
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(about) LIKE ? OR LOWER(title) LIKE ? OR LOWER(headline) LIKE ?)';
      const kw = `%${normalizedKeyword}%`;
      params.push(kw, kw, kw, kw);
    }
    if (normalizedLocation) {
      sql += ' AND LOWER(location) LIKE ?';
      params.push(`%${normalizedLocation}%`);
    }
    if (normalizedSkill) {
      sql += ' AND LOWER(CAST(skills AS CHAR)) LIKE ?';
      params.push(`%${normalizedSkill}%`);
    }
    sql += ' LIMIT 50';
    const [rows] = await db.query(sql, params);
    const formatted = rows.map((m) => ({
      ...m,
      profile_views_daily: m.profile_views,
      skills: typeof m.skills === 'string' ? JSON.parse(m.skills || '[]') : m.skills
    }));
    res.status(200).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(200).json([]);
  }
});

app.post('/members/suggest', async (req, res) => {
  try {
    const keyword = String(req.body?.keyword || '').trim().toLowerCase();
    const skill = String(req.body?.skill || '').trim().toLowerCase();
    const location = String(req.body?.location || '').trim().toLowerCase();
    const limit = Math.min(Math.max(Number(req.body?.limit) || 8, 1), 20);
    if (!keyword && !skill && !location) return res.status(200).json([]);

    let sql = `
      SELECT member_id, name, headline, title, location
      FROM members
      WHERE status != ?
    `;
    const params = ['deleted'];
    if (keyword) {
      sql += ' AND (LOWER(name) LIKE ? OR LOWER(headline) LIKE ? OR LOWER(title) LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    if (location) {
      sql += ' AND LOWER(location) LIKE ?';
      params.push(`%${location}%`);
    }
    if (skill) {
      sql += ' AND LOWER(CAST(skills AS CHAR)) LIKE ?';
      params.push(`%${skill}%`);
    }
    sql += ' ORDER BY created_at DESC LIMIT ?';
    params.push(limit);
    const [rows] = await db.query(sql, params);
    res.status(200).json(
      rows.map((row) => ({
        type: 'member',
        member_id: row.member_id,
        value: row.name || row.member_id,
        label: row.name || row.member_id,
        subtitle: row.headline || row.title || row.location || 'Member'
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(200).json([]);
  }
});

/** Base64 data URLs exceed TEXT (~64KB) and can exceed MEDIUMTEXT (~16MB); widen legacy DBs. */
async function widenPhotoUrlColumnsToLongtext() {
  for (const col of ['profile_photo_url', 'cover_photo_url']) {
    try {
      const [rows] = await db.query('SHOW COLUMNS FROM members LIKE ?', [col]);
      if (!rows.length) continue;
      const t = String(rows[0].Type || '').toLowerCase();
      const isLongtext = t.includes('longtext');
      if (isLongtext) continue;
      const needsWiden =
        t.includes('text') ||
        t.includes('varchar') ||
        t.includes('char') ||
        t.includes('mediumtext') ||
        t.includes('tinytext');
      if (needsWiden) {
        await db.query(`ALTER TABLE members MODIFY COLUMN ${col} LONGTEXT NULL`);
        console.log(`members.${col} widened to LONGTEXT (was ${rows[0].Type})`);
      }
    } catch (e) {
      console.warn(`widenPhotoUrlColumnsToLongtext ${col}:`, e.message);
    }
  }
}

async function ensureSchema() {
  const ensureColumn = async (columnName, ddl) => {
    const [rows] = await db.query('SHOW COLUMNS FROM members LIKE ?', [columnName]);
    if (!rows.length) await db.query(`ALTER TABLE members ADD COLUMN ${ddl}`);
  };

  await db.query(`
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
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_users (
      user_id VARCHAR(50) PRIMARY KEY,
      email VARCHAR(120) UNIQUE NOT NULL,
      password_hash VARCHAR(256) NOT NULL,
      password_salt VARCHAR(64) NOT NULL,
      name VARCHAR(120),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS auth_sessions (
      token VARCHAR(512) PRIMARY KEY,
      user_id VARCHAR(50) NOT NULL,
      email VARCHAR(120) NOT NULL,
      expires_at DATETIME NOT NULL,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (user_id),
      INDEX (expires_at)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_settings (
      member_id VARCHAR(50) PRIMARY KEY,
      profile_visibility TINYINT(1) DEFAULT 1,
      open_to_work TINYINT(1) DEFAULT 1,
      allow_messages TINYINT(1) DEFAULT 1,
      in_app_notifications_enabled TINYINT(1) DEFAULT 1,
      preferred_language VARCHAR(30) DEFAULT 'English',
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS premium_memberships (
      member_id VARCHAR(50) PRIMARY KEY,
      plan_name VARCHAR(50) DEFAULT 'Career',
      status VARCHAR(20) DEFAULT 'inactive',
      started_at DATETIME NULL,
      expires_at DATETIME NULL,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP
    )
  `);
  await db.query(`
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
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS member_network_relations (
      member_id VARCHAR(50) NOT NULL,
      entity_id VARCHAR(60) NOT NULL,
      relation_status VARCHAR(20) DEFAULT 'active',
      joined_at DATETIME DEFAULT CURRENT_TIMESTAMP,
      updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      PRIMARY KEY (member_id, entity_id),
      INDEX idx_network_member_status (member_id, relation_status)
    )
  `);
  await db.query(`
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
  `);
  // JWT tokens are longer than opaque random strings; keep column large enough.
  await db.query('ALTER TABLE auth_sessions MODIFY COLUMN token VARCHAR(512) NOT NULL');
  await ensureColumn('first_name', 'first_name VARCHAR(100)');
  await ensureColumn('last_name', 'last_name VARCHAR(100)');
  await ensureColumn('headline', 'headline VARCHAR(150)');
  await ensureColumn('city', 'city VARCHAR(100)');
  await ensureColumn('state', 'state VARCHAR(100)');
  await ensureColumn('country', 'country VARCHAR(100)');
  await ensureColumn('phone', 'phone VARCHAR(30)');
  await ensureColumn('summary', 'summary TEXT');
  await ensureColumn('profile_photo_url', 'profile_photo_url LONGTEXT');
  await ensureColumn('cover_photo_url', 'cover_photo_url LONGTEXT');
  await widenPhotoUrlColumnsToLongtext();
  await ensureColumn('cover_theme', 'cover_theme VARCHAR(30) DEFAULT "blue"');
  await ensureColumn('resume_url', 'resume_url TEXT');
  await ensureColumn('resume_text', 'resume_text MEDIUMTEXT');
  await ensureColumn('connections_count', 'connections_count INT DEFAULT 0');
  await ensureColumn('profile_views', 'profile_views INT DEFAULT 0');

  const dummyEmail = 'dummy.user@gmail.com';
  const [dummyRows] = await db.query('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1', [dummyEmail]);
  if (!dummyRows.length) {
    const dummySalt = crypto.randomBytes(16).toString('hex');
    const dummyHash = hashPassword('Dummy@123', dummySalt);
    await db.query(
      'INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (?, ?, ?, ?, ?)',
      ['U-DUMMY01', dummyEmail, dummyHash, dummySalt, 'Dummy User']
    );
    console.log('Seeded auth dummy user:', dummyEmail);
  }

  const adminEmail = 'admin@test.com';
  const adminSalt = crypto.randomBytes(16).toString('hex');
  const adminHash = hashPassword('admin123', adminSalt);
  const [adminRows] = await db.query('SELECT user_id FROM auth_users WHERE email = ? LIMIT 1', [adminEmail]);
  if (!adminRows.length) {
    await db.query(
      'INSERT INTO auth_users (user_id, email, password_hash, password_salt, name) VALUES (?, ?, ?, ?, ?)',
      ['U-ADMIN01', adminEmail, adminHash, adminSalt, 'Admin Test']
    );
    console.log('Seeded auth admin user:', adminEmail);
  } else {
    await db.query(
      'UPDATE auth_users SET password_hash = ?, password_salt = ? WHERE email = ?',
      [adminHash, adminSalt, adminEmail]
    );
    console.log('Updated auth admin password for:', adminEmail);
  }

  await ensureBaselineMember();
  await ensureMemberSettingsRow(BASELINE_MEMBER.member_id);
  await seedNetworkEntities();
}

const PORT = process.env.PORT || 4001;
// Listen immediately so the gateway never waits on a hung MySQL schema init.
app.listen(PORT, () => {
  console.log(`member-service API running on port ${PORT}`);
  ensureSchema().catch((err) => console.error('members schema init failed:', err));
});
