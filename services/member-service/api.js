const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
app.use(express.json());
const producer = kafka.producer();

const CACHE_PREFIX = 'member:';
const CACHE_TTL = 600;

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

// Create Member — duplicate email => 409
app.post('/members/create', async (req, res) => {
  try {
    const { name, title, location, email, skills, about, experience, education } = req.body;
    if (!email) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'email required', trace_id: crypto.randomUUID() });
    }

    const [dup] = await db.query('SELECT member_id FROM members WHERE email = ? AND status != ?', [email, 'deleted']);
    if (dup.length) {
      return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'A member with this email already exists', trace_id: crypto.randomUUID() });
    }

    const memberId = 'M-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    const idempotencyKey = req.headers['idempotency-key'] || crypto.randomUUID();

    await producer.connect();
    const eventPayload = envelope('member.created', traceId, memberId, 'member', memberId, {
      name, title, location, email, skills, about, experience, education
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

    const allowed = ['name', 'title', 'location', 'email', 'about', 'skills', 'experience', 'education'];
    const updates = [];
    const vals = [];
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        updates.push(`${k} = ?`);
        vals.push(['skills', 'experience', 'education'].includes(k) ? JSON.stringify(fields[k]) : fields[k]);
      }
    }
    if (updates.length === 0) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update', trace_id: crypto.randomUUID() });
    }

    if (fields.email) {
      const [e] = await db.query('SELECT member_id FROM members WHERE email = ? AND member_id != ?', [fields.email, member_id]);
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
  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      member_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100),
      title VARCHAR(150),
      location VARCHAR(100),
      email VARCHAR(100),
      about TEXT,
      skills JSON,
      experience JSON,
      education JSON,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_email (email)
    )
  `);
}

const PORT = process.env.PORT || 4001;
// Listen immediately so the gateway never waits on a hung MySQL schema init.
app.listen(PORT, () => {
  console.log(`member-service API running on port ${PORT}`);
  ensureSchema().catch((err) => console.error('members schema init failed:', err));
});
