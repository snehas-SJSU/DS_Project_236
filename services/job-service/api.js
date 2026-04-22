const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
app.use(express.json());
const producer = kafka.producer();

async function ensureColumn(table, name, ddl) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.COLUMNS WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND COLUMN_NAME = ?`,
    [table, name]
  );
  if (!rows[0]?.cnt) {
    try {
      await db.query(`ALTER TABLE ${table} ADD COLUMN ${ddl}`);
    } catch (err) {
      if (err && err.code !== 'ER_DUP_FIELDNAME') throw err;
    }
  }
}

async function ensureIndex(table, indexName, ddl) {
  const [rows] = await db.query(
    `SELECT COUNT(*) AS cnt FROM INFORMATION_SCHEMA.STATISTICS
     WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = ? AND INDEX_NAME = ?`,
    [table, indexName]
  );
  if (!rows[0]?.cnt) {
    try {
      await db.query(`ALTER TABLE ${table} ADD INDEX ${ddl}`);
    } catch (err) {
      if (err && err.code !== 'ER_DUP_KEYNAME') throw err;
    }
  }
}

async function ensureJobsSchema() {
  await db.query(`
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
  `);
  await ensureColumn('jobs', 'industry', 'industry VARCHAR(100)');
  await ensureColumn('jobs', 'company_id', 'company_id VARCHAR(50)');
  await ensureColumn('jobs', 'remote_mode', 'remote_mode VARCHAR(20)');
  await ensureColumn('jobs', 'seniority_level', 'seniority_level VARCHAR(50)');
  await ensureColumn('jobs', 'employment_type', 'employment_type VARCHAR(50)');
  await ensureColumn('jobs', 'views_count', 'views_count INT DEFAULT 0');
  await ensureColumn('jobs', 'saves_count', 'saves_count INT DEFAULT 0');
  await ensureColumn('jobs', 'applicants_count', 'applicants_count INT DEFAULT 0');
  // Indexes for job search + recruiter/dashboard query paths.
  await ensureIndex('jobs', 'idx_jobs_status_created', 'idx_jobs_status_created (status, created_at)');
  await ensureIndex('jobs', 'idx_jobs_recruiter_created', 'idx_jobs_recruiter_created (recruiter_id, created_at)');
  await ensureIndex('jobs', 'idx_jobs_company', 'idx_jobs_company (company)');
  await ensureIndex('jobs', 'idx_jobs_location', 'idx_jobs_location (location)');
  await ensureIndex('jobs', 'idx_jobs_type', 'idx_jobs_type (type)');
  await ensureIndex('jobs', 'idx_jobs_employment_type', 'idx_jobs_employment_type (employment_type)');
  await ensureIndex('jobs', 'idx_jobs_industry', 'idx_jobs_industry (industry)');
}

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
    const {
      title, company, company_id, location, salary, type, skills, description, recruiter_id,
      industry, seniority_level, employment_type, remote_mode
    } = req.body;
    const jobId = 'J-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    const idempotencyKey = req.headers['idempotency-key'] || crypto.createHash('sha256').update(`job.created-${jobId}-${Date.now()}`).digest('hex');

    const eventPayload = env('job.created', traceId, recruiter_id || 'recruiter', jobId, {
      title, company, company_id: company_id || null, location, salary, type: type || employment_type, skills, description,
      recruiter_id: recruiter_id || 'R-default', industry: industry || null,
      seniority_level: seniority_level || null, employment_type: employment_type || type || null,
      remote_mode: remote_mode || null
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
    await ensureJobsSchema();
    const { keyword, location, type, industry, remote, company } = req.body;
    let sql = "SELECT * FROM jobs WHERE status = 'open'";
    const params = [];
    if (company) {
      sql += ' AND company = ?';
      params.push(String(company).trim());
    }
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
      sql += ' AND (type = ? OR employment_type = ?)';
      params.push(type, type);
    }
    if (industry) {
      sql += ' AND industry LIKE ?';
      params.push(`%${industry}%`);
    }
    if (remote) {
      sql += ' AND remote_mode = ?';
      params.push(remote);
    }
    sql += ' ORDER BY created_at DESC LIMIT 50';
    const [rows] = await db.query(sql, params);
    const formatted = rows.map((r) => ({
      id: r.job_id,
      job_id: r.job_id,
      company_id: r.company_id || null,
      title: r.title,
      company: r.company,
      location: r.location,
      salary: r.salary,
      type: r.type,
      posted_datetime: r.created_at,
      postedAt: 'Just now',
      skills: typeof r.skills === 'string' ? JSON.parse(r.skills || '[]') : r.skills,
      description: r.description,
      status: r.status,
      recruiter_id: r.recruiter_id,
      industry: r.industry,
      remote_mode: r.remote_mode,
      seniority_level: r.seniority_level,
      employment_type: r.employment_type,
      applicants: r.applicants_count || 0
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
    let saved = false;
    if (member_id) {
      try {
        const [apps] = await db.query(
          'SELECT 1 FROM applications WHERE job_id = ? AND member_id = ? LIMIT 1',
          [job_id, member_id]
        );
        applied = apps.length > 0;
        const [savedRows] = await db.query(
          'SELECT 1 FROM saved_jobs WHERE job_id = ? AND member_id = ? LIMIT 1',
          [job_id, member_id]
        );
        saved = savedRows.length > 0;
      } catch {
        /* applications table may not exist yet */
      }
    }

    res.status(200).json({
      ...job,
      company_id: job.company_id || null,
      posted_datetime: job.created_at,
      applied,
      saved
    });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/save', async (req, res) => {
  try {
    const { job_id, member_id } = req.body;
    if (!job_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id and member_id required', trace_id: crypto.randomUUID() });
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS saved_jobs (
        job_id VARCHAR(50),
        member_id VARCHAR(50),
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (job_id, member_id)
      )
    `);
    await db.query(
      'INSERT IGNORE INTO saved_jobs (job_id, member_id) VALUES (?, ?)',
      [job_id, member_id]
    );
    await db.query('UPDATE jobs SET saves_count = COALESCE(saves_count, 0) + 1 WHERE job_id = ?', [job_id]);

    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    await producer.connect();
    await producer.send({
      topic: 'job.events',
      messages: [{
        key: job_id,
        value: JSON.stringify(env('job.saved', traceId, member_id, job_id, { job_id, member_id }, idem))
      }]
    });

    res.status(200).json({ message: 'Saved', job_id, member_id, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/jobs/unsave', async (req, res) => {
  try {
    const { job_id, member_id } = req.body;
    if (!job_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id and member_id required', trace_id: crypto.randomUUID() });
    }

    await db.query(`
      CREATE TABLE IF NOT EXISTS saved_jobs (
        job_id VARCHAR(50),
        member_id VARCHAR(50),
        saved_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
        PRIMARY KEY (job_id, member_id)
      )
    `);
    const [result] = await db.query(
      'DELETE FROM saved_jobs WHERE job_id = ? AND member_id = ?',
      [job_id, member_id]
    );
    if (result && result.affectedRows > 0) {
      await db.query(
        'UPDATE jobs SET saves_count = GREATEST(COALESCE(saves_count, 0) - 1, 0) WHERE job_id = ?',
        [job_id]
      );
    }

    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    await producer.connect();
    await producer.send({
      topic: 'job.events',
      messages: [{
        key: job_id,
        value: JSON.stringify(env('job.unsaved', traceId, member_id, job_id, { job_id, member_id }, idem))
      }]
    });

    res.status(200).json({ message: 'Unsaved', job_id, member_id, trace_id: traceId });
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
    res.status(200).json(
      rows.map((r) => ({
        ...r,
        company_id: r.company_id || null,
        posted_datetime: r.created_at
      }))
    );
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

async function ensureRecruitersTable() {
  await db.query(`
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
  `);
}

app.post('/recruiters/create', async (req, res) => {
  try {
    await ensureRecruitersTable();
    const {
      recruiter_id = `R-${crypto.randomUUID().slice(0, 8)}`,
      company_id,
      name,
      email,
      phone,
      company_name,
      company_industry,
      company_size,
      access_level = 'admin'
    } = req.body;
    if (!email || !name) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'name and email required', trace_id: crypto.randomUUID() });
    }
    await db.query(
      `INSERT INTO recruiters
      (recruiter_id, company_id, name, email, phone, company_name, company_industry, company_size, access_level)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`,
      [recruiter_id, company_id || null, name, email, phone || null, company_name || null, company_industry || null, company_size || null, access_level]
    );
    res.status(201).json({ recruiter_id, message: 'Recruiter created' });
  } catch (err) {
    if (String(err.message).includes('Duplicate')) {
      return res.status(409).json({ error: 'DUPLICATE_EMAIL', message: 'Recruiter email already exists', trace_id: crypto.randomUUID() });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/recruiters/get', async (req, res) => {
  try {
    await ensureRecruitersTable();
    const { recruiter_id } = req.body;
    if (!recruiter_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'recruiter_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query('SELECT * FROM recruiters WHERE recruiter_id = ? AND status != ?', [recruiter_id, 'deleted']);
    if (!rows.length) return res.status(404).json({ error: 'NOT_FOUND', message: 'Recruiter not found', trace_id: crypto.randomUUID() });
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/recruiters/update', async (req, res) => {
  try {
    await ensureRecruitersTable();
    const { recruiter_id, ...fields } = req.body;
    if (!recruiter_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'recruiter_id required', trace_id: crypto.randomUUID() });
    }
    const allowed = ['company_id', 'name', 'email', 'phone', 'company_name', 'company_industry', 'company_size', 'access_level', 'status'];
    const updates = [];
    const vals = [];
    for (const k of allowed) {
      if (fields[k] !== undefined) {
        updates.push(`${k} = ?`);
        vals.push(fields[k]);
      }
    }
    if (!updates.length) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'No fields to update', trace_id: crypto.randomUUID() });
    }
    vals.push(recruiter_id);
    await db.query(`UPDATE recruiters SET ${updates.join(', ')} WHERE recruiter_id = ?`, vals);
    res.status(200).json({ recruiter_id, message: 'Recruiter updated' });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/recruiters/delete', async (req, res) => {
  try {
    await ensureRecruitersTable();
    const { recruiter_id } = req.body;
    if (!recruiter_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'recruiter_id required', trace_id: crypto.randomUUID() });
    }
    await db.query('UPDATE recruiters SET status = ? WHERE recruiter_id = ?', ['deleted', recruiter_id]);
    res.status(200).json({ recruiter_id, message: 'Recruiter deleted' });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/recruiters/search', async (req, res) => {
  try {
    await ensureRecruitersTable();
    const { keyword } = req.body;
    let sql = 'SELECT * FROM recruiters WHERE status != ?';
    const params = ['deleted'];
    if (keyword) {
      sql += ' AND (name LIKE ? OR company_name LIKE ? OR company_industry LIKE ?)';
      const k = `%${keyword}%`;
      params.push(k, k, k);
    }
    sql += ' ORDER BY created_at DESC LIMIT 100';
    const [rows] = await db.query(sql, params);
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4002;
ensureJobsSchema()
  .then(() => {
    app.listen(PORT, () => console.log(`Job Service API running on port ${PORT}`));
  })
  .catch((err) => {
    console.error('Failed to initialize jobs schema', err);
    process.exit(1);
  });
