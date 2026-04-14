const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
app.use(express.json());
const producer = kafka.producer();

function env(eventType, traceId, actorId, entityId, payload, idempotencyKey) {
  return {
    event_type: eventType,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    actor_id: actorId || 'system',
    entity: { entity_type: 'job', entity_id: entityId },
    payload,
    idempotency_key: idempotencyKey
  };
}

async function sendJobEvent(payload) {
  await producer.connect();
  await producer.send({
    topic: 'job.events',
    messages: [{ key: payload.entity.entity_id, value: JSON.stringify(payload) }]
  });
}

app.post('/jobs/create', async (req, res) => {
  try {
    const { title, company, location, salary, type, skills, description, recruiter_id } = req.body;
    const jobId = 'J-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    const idempotencyKey = req.headers['idempotency-key'] || crypto.createHash('sha256').update(`job.created-${jobId}-${Date.now()}`).digest('hex');

    const eventPayload = env('job.created', traceId, recruiter_id || 'recruiter', jobId, {
      title, company, location, salary, type, skills, description, recruiter_id: recruiter_id || 'R-default'
    }, idempotencyKey);

    await sendJobEvent(eventPayload);
    res.status(201).json({ message: 'Job creation requested', job_id: jobId, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: String(err.message), trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/search', async (req, res) => {
  try {
    await db.query(`
      CREATE TABLE IF NOT EXISTS jobs (
        job_id VARCHAR(50) PRIMARY KEY,
        title VARCHAR(255),
        company VARCHAR(255),
        location VARCHAR(100),
        salary VARCHAR(100),
        type VARCHAR(50),
        skills JSON,
        description TEXT,
        status VARCHAR(50) DEFAULT 'open',
        recruiter_id VARCHAR(50) DEFAULT 'R-default',
        views_count INT DEFAULT 0,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      )
    `);
    const { keyword, location, type } = req.body;
    let sql = "SELECT * FROM jobs WHERE status = 'open'";
    const params = [];
    if (keyword) {
      sql += ' AND (title LIKE ? OR description LIKE ? OR company LIKE ?)';
      const k = `%${keyword}%`;
      params.push(k, k, k);
    }
    if (location) {
      sql += ' AND location LIKE ?';
      params.push(`%${location}%`);
    }
    if (type) {
      sql += ' AND type = ?';
      params.push(type);
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    const [rows] = await db.query(sql, params);
    const formatted = rows.map((r) => ({
      id: r.job_id,
      title: r.title,
      company: r.company,
      location: r.location,
      salary: r.salary,
      type: r.type,
      postedAt: 'Just now',
      skills: typeof r.skills === 'string' ? JSON.parse(r.skills || '[]') : r.skills,
      description: r.description,
      status: r.status,
      recruiter_id: r.recruiter_id
    }));
    res.status(200).json(formatted);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(200).json([]);
  }
});

app.post('/jobs/get', async (req, res) => {
  try {
    const { job_id, member_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id required', trace_id: crypto.randomUUID() });
    }

    await redisModule.connectRedis();
    const cachedJob = await redisModule.client.get(`job:${job_id}`);
    let job;
    if (cachedJob) {
      job = JSON.parse(cachedJob);
    } else {
      const [rows] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [job_id]);
      if (rows.length === 0) return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found', trace_id: crypto.randomUUID() });
      job = rows[0];
      job.skills = typeof job.skills === 'string' ? JSON.parse(job.skills || '[]') : job.skills;
      await redisModule.client.setEx(`job:${job_id}`, 300, JSON.stringify(job));
    }

    // Async analytics: job.viewed
    const traceId = crypto.randomUUID();
    const idem = crypto.createHash('sha256').update(`view-${job_id}-${traceId}`).digest('hex');
    await producer.connect();
    await producer.send({
      topic: 'job.events',
      messages: [{
        key: job_id,
        value: JSON.stringify(env('job.viewed', traceId, member_id || 'anonymous', job_id, { job_id, viewer: member_id }, idem))
      }]
    });

    let applied = false;
    if (member_id) {
      try {
        const [apps] = await db.query(
          'SELECT 1 FROM applications WHERE job_id = ? AND member_id = ? LIMIT 1',
          [job_id, member_id]
        );
        applied = apps.length > 0;
      } catch {
        /* applications table may not exist yet */
      }
    }

    res.status(200).json({ ...job, applied });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/update', async (req, res) => {
  try {
    const { job_id, ...fields } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id required', trace_id: crypto.randomUUID() });
    }
    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    await sendJobEvent(env('job.updated', traceId, fields.recruiter_id || 'recruiter', job_id, fields, idem));

    await redisModule.connectRedis();
    await redisModule.client.del(`job:${job_id}`);

    res.status(200).json({ message: 'Updated', job_id, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/close', async (req, res) => {
  try {
    const { job_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id required', trace_id: crypto.randomUUID() });
    }
    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    await sendJobEvent(env('job.closed', traceId, 'recruiter', job_id, {}, idem));

    await redisModule.connectRedis();
    await redisModule.client.del(`job:${job_id}`);

    res.status(200).json({ message: 'Closed', job_id, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/byRecruiter', async (req, res) => {
  try {
    const { recruiter_id } = req.body;
    if (!recruiter_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'recruiter_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query(
      'SELECT * FROM jobs WHERE recruiter_id = ? ORDER BY created_at DESC LIMIT 100',
      [recruiter_id]
    );
    res.status(200).json(rows);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => console.log(`Job Service API running on port ${PORT}`));
