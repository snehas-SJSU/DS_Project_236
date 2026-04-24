const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');

const app = express();
app.use(express.json({ limit: '15mb' }));
const producer = kafka.producer();

function mapApplicationRow(r) {
  return {
    ...r,
    application_id: r.app_id,
    application_datetime: r.applied_at
  };
}

async function ensureApplicationsTable() {
  await db.query(`
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
  `);
  const ensureColumn = async (columnName, ddl) => {
    const [rows] = await db.query('SHOW COLUMNS FROM applications LIKE ?', [columnName]);
    if (!rows.length) await db.query(`ALTER TABLE applications ADD COLUMN ${ddl}`);
  };
  await ensureColumn('answers', 'answers JSON');
  await ensureColumn('resume_url', 'resume_url TEXT');
  await ensureColumn('resume_text', 'resume_text TEXT');
}

function envelope(eventType, traceId, actorId, entityId, payload, idempotencyKey) {
  return {
    event_type: eventType,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    actor_id: actorId,
    entity: { entity_type: 'application', entity_id: entityId },
    payload,
    idempotency_key: idempotencyKey
  };
}

async function submitHandler(req, res) {
  try {
    await ensureApplicationsTable();
    const { job_id, member_id, resume_url, resume_text, cover_letter, answers } = req.body;

    if (!job_id || !member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id and member_id required', trace_id: crypto.randomUUID() });
    }

    const [jobs] = await db.query('SELECT status FROM jobs WHERE job_id = ?', [job_id]);
    if (!jobs.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Job not found', trace_id: crypto.randomUUID() });
    }
    if (jobs[0].status === 'closed') {
      return res.status(422).json({ error: 'JOB_CLOSED', message: 'Cannot apply to a closed job', trace_id: crypto.randomUUID() });
    }

    const [existing] = await db.query(
      'SELECT app_id FROM applications WHERE job_id = ? AND member_id = ?',
      [job_id, member_id]
    );
    if (existing.length) {
      return res.status(409).json({ error: 'DUPLICATE_APPLICATION', message: 'Already applied to this job', trace_id: crypto.randomUUID() });
    }

    const appId = 'APP-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    const idempotencyKey = req.headers['idempotency-key'] || crypto.createHash('sha256').update(`${job_id}-${member_id}-${traceId}`).digest('hex');

    await db.query(
      'INSERT INTO applications (app_id, job_id, member_id, status, resume_url, resume_text, cover_letter, answers) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
      [
        appId,
        job_id,
        member_id,
        'submitted',
        resume_url || null,
        resume_text || null,
        cover_letter || null,
        answers ? JSON.stringify(answers) : null
      ]
    );

    const eventPayload = envelope('application.submitted', traceId, member_id, appId, {
      job_id,
      member_id,
      status: 'submitted',
      resume_url: resume_url || null,
      resume_text: resume_text || null,
      cover_letter: cover_letter || null,
      answers: answers || null
    }, idempotencyKey);

    await producer.connect();
    await producer.send({
      topic: 'application.events',
      messages: [{ key: appId, value: JSON.stringify(eventPayload) }]
    });

    res.status(201).json({
      message: 'Application submitted',
      application_id: appId,
      trace_id: traceId
    });
  } catch (err) {
    console.error('Producer error:', err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: String(err.message), trace_id: crypto.randomUUID() });
  }
}

app.post('/applications/submit', submitHandler);
app.post('/applications/apply', submitHandler);

app.post('/applications/get', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { application_id } = req.body;
    if (!application_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'application_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query('SELECT * FROM applications WHERE app_id = ?', [application_id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Application not found', trace_id: crypto.randomUUID() });
    }
    res.status(200).json(mapApplicationRow(rows[0]));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/applications/byJob', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { job_id } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query('SELECT * FROM applications WHERE job_id = ? ORDER BY applied_at DESC', [job_id]);
    res.status(200).json(rows.map(mapApplicationRow));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/applications/byMember', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { member_id } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query('SELECT * FROM applications WHERE member_id = ? ORDER BY applied_at DESC', [member_id]);
    res.status(200).json(rows.map(mapApplicationRow));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/applications/updateStatus', async (req, res) => {
  try {
    const { application_id, status, recruiter_note } = req.body;
    if (!application_id || !status) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'application_id and status required', trace_id: crypto.randomUUID() });
    }
    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    const eventPayload = envelope('application.status_updated', traceId, 'recruiter', application_id, {
      application_id,
      status,
      recruiter_note: recruiter_note || null
    }, idem);

    await producer.connect();
    await producer.send({
      topic: 'application.events',
      messages: [{ key: application_id, value: JSON.stringify(eventPayload) }]
    });

    res.status(200).json({ message: 'Status update queued', trace_id: traceId });
  } catch (err) {
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/applications/addNote', async (req, res) => {
  try {
    const { application_id, note } = req.body;
    if (!application_id || note === undefined) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'application_id and note required', trace_id: crypto.randomUUID() });
    }
    await ensureApplicationsTable();
    await db.query('UPDATE applications SET recruiter_note = ? WHERE app_id = ?', [note, application_id]);
    res.status(200).json({ message: 'Note saved', application_id });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => console.log(`application-service API running on port ${PORT}`));
