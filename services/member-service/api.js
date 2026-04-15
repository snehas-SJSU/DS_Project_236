const express = require('express');
const crypto = require('crypto');
const jwt = require('jsonwebtoken');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
app.use(express.json());
const producer = kafka.producer();

const CACHE_PREFIX = 'member:';
const CACHE_TTL = 600;
const AUTH_TOKEN_TTL_HOURS = 24;
const JWT_SECRET = process.env.JWT_SECRET || 'linkedin-sim-dev-secret';

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
    let sql = 'SELECT * FROM members WHERE status != ?';
    const params = ['deleted'];
    if (keyword) {
      sql += ' AND (name LIKE ? OR about LIKE ? OR title LIKE ?)';
      const kw = `%${keyword}%`;
      params.push(kw, kw, kw);
    }
    if (location) {
      sql += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }
    if (skill) {
      sql += ' AND CAST(skills AS CHAR) LIKE ?';
      params.push(`%${skill}%`);
    }
    sql += ' LIMIT 50';
    const [rows] = await db.query(sql, params);
    const formatted = rows.map((m) => ({
      ...m,
      skills: typeof m.skills === 'string' ? JSON.parse(m.skills || '[]') : m.skills
    }));
    res.status(200).json(formatted);
  } catch (err) {
    console.error(err);
    res.status(200).json([]);
  }
});

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
      profile_photo_url MEDIUMTEXT,
      cover_photo_url MEDIUMTEXT,
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
  await ensureColumn('profile_photo_url', 'profile_photo_url MEDIUMTEXT');
  await ensureColumn('cover_photo_url', 'cover_photo_url MEDIUMTEXT');
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
}

const PORT = process.env.PORT || 4001;
// Listen immediately so the gateway never waits on a hung MySQL schema init.
app.listen(PORT, () => {
  console.log(`member-service API running on port ${PORT}`);
  ensureSchema().catch((err) => console.error('members schema init failed:', err));
});
