const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');

const app = express();
app.use(express.json());
const producer = kafka.producer();

async function ensureSchema() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS connection_requests (
      request_id VARCHAR(50) PRIMARY KEY,
      requester_id VARCHAR(50),
      receiver_id VARCHAR(50),
      status VARCHAR(20) DEFAULT 'pending',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_pair (requester_id, receiver_id)
    )
  `);
  await db.query(`
    CREATE TABLE IF NOT EXISTS connections (
      user_a VARCHAR(50),
      user_b VARCHAR(50),
      connected_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      PRIMARY KEY (user_a, user_b)
    )
  `);
}

function envelope(eventType, traceId, actorId, entityId, payload, idempotencyKey) {
  return {
    event_type: eventType,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    actor_id: actorId,
    entity: { entity_type: 'connection', entity_id: entityId },
    payload,
    idempotency_key: idempotencyKey
  };
}

function pairKey(u1, u2) {
  return u1 < u2 ? [u1, u2] : [u2, u1];
}

app.post('/connections/request', async (req, res) => {
  try {
    await ensureSchema();
    const { requester_id, receiver_id } = req.body;
    if (!requester_id || !receiver_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'requester_id and receiver_id required', trace_id: crypto.randomUUID() });
    }
    const requestId = 'CR-' + crypto.randomUUID().substring(0, 8);
    await db.query(
      'INSERT INTO connection_requests (request_id, requester_id, receiver_id, status) VALUES (?, ?, ?, ?)',
      [requestId, requester_id, receiver_id, 'pending']
    );

    const traceId = crypto.randomUUID();
    await producer.connect();
    await producer.send({
      topic: 'connection.events',
      messages: [{
        key: requestId,
        value: JSON.stringify(envelope('connection.requested', traceId, requester_id, requestId, { requester_id, receiver_id }, crypto.randomUUID()))
      }]
    });

    res.status(201).json({ request_id: requestId, trace_id: traceId });
  } catch (err) {
    if (err.code === 'ER_DUP_ENTRY') {
      return res.status(409).json({ error: 'DUPLICATE_REQUEST', message: 'Request already exists', trace_id: crypto.randomUUID() });
    }
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/connections/accept', async (req, res) => {
  try {
    await ensureSchema();
    const { request_id } = req.body;
    if (!request_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'request_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query('SELECT * FROM connection_requests WHERE request_id = ? AND status = ?', [request_id, 'pending']);
    if (!rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Request not found', trace_id: crypto.randomUUID() });
    }
    const { requester_id, receiver_id } = rows[0];
    const [a, b] = pairKey(requester_id, receiver_id);
    await db.query('UPDATE connection_requests SET status = ? WHERE request_id = ?', ['accepted', request_id]);
    await db.query('INSERT IGNORE INTO connections (user_a, user_b) VALUES (?, ?)', [a, b]);

    const traceId = crypto.randomUUID();
    await producer.connect();
    await producer.send({
      topic: 'connection.events',
      messages: [{
        key: request_id,
        value: JSON.stringify(envelope('connection.accepted', traceId, receiver_id, request_id, { requester_id, receiver_id }, crypto.randomUUID()))
      }]
    });

    res.status(200).json({ message: 'Connected', requester_id, receiver_id, trace_id: traceId });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/connections/reject', async (req, res) => {
  try {
    const { request_id } = req.body;
    if (!request_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'request_id required', trace_id: crypto.randomUUID() });
    }
    await db.query('UPDATE connection_requests SET status = ? WHERE request_id = ?', ['rejected', request_id]);
    res.status(200).json({ message: 'Rejected', request_id });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/connections/list', async (req, res) => {
  try {
    await ensureSchema();
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'user_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS connection_id
       FROM connections WHERE user_a = ? OR user_b = ?`,
      [user_id, user_id, user_id]
    );
    res.status(200).json(rows.map((r) => r.connection_id));
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/connections/requestsByUser', async (req, res) => {
  try {
    await ensureSchema();
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'user_id required', trace_id: crypto.randomUUID() });
    }
    const [incoming] = await db.query(
      'SELECT * FROM connection_requests WHERE receiver_id = ? AND status = ? ORDER BY created_at DESC',
      [user_id, 'pending']
    );
    const [sent] = await db.query(
      'SELECT * FROM connection_requests WHERE requester_id = ? ORDER BY created_at DESC',
      [user_id]
    );
    res.status(200).json({ incoming, sent });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/connections/mutual', async (req, res) => {
  try {
    await ensureSchema();
    const { user_id, other_id } = req.body;
    if (!user_id || !other_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'user_id and other_id required', trace_id: crypto.randomUUID() });
    }
    const [a1] = await db.query(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS cid FROM connections WHERE user_a = ? OR user_b = ?`,
      [user_id, user_id, user_id]
    );
    const [a2] = await db.query(
      `SELECT CASE WHEN user_a = ? THEN user_b ELSE user_a END AS cid FROM connections WHERE user_a = ? OR user_b = ?`,
      [other_id, other_id, other_id]
    );
    const s1 = new Set(a1.map((x) => x.cid));
    const mutual = a2.map((x) => x.cid).filter((id) => s1.has(id) && id !== user_id && id !== other_id);
    res.status(200).json({ mutual });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4006;
app.listen(PORT, () => {
  console.log(`connection-service API running on port ${PORT}`);
  ensureSchema().catch((err) => console.error('connection schema init failed:', err));
});
