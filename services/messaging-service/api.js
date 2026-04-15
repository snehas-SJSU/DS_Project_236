const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { getMongoDb } = require('../../shared/mongo');

const app = express();
app.use(express.json());
const producer = kafka.producer();

async function ensureThreadsTable() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS message_threads (
      thread_id VARCHAR(50) PRIMARY KEY,
      participant_a VARCHAR(50),
      participant_b VARCHAR(50),
      last_activity TIMESTAMP DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
      INDEX idx_participant (participant_a, participant_b)
    )
  `);
}

async function resolveReceiverId(threadId, senderId) {
  const [rows] = await db.query('SELECT participant_a, participant_b FROM message_threads WHERE thread_id = ?', [threadId]);
  if (!rows.length) return null;
  const t = rows[0];
  return t.participant_a === senderId ? t.participant_b : t.participant_a;
}

function envelope(eventType, traceId, actorId, entityId, payload, idempotencyKey) {
  return {
    event_type: eventType,
    trace_id: traceId,
    timestamp: new Date().toISOString(),
    actor_id: actorId,
    entity: { entity_type: 'thread', entity_id: entityId },
    payload,
    idempotency_key: idempotencyKey
  };
}

async function sendKafkaWithRetry(payload, maxAttempts = 3) {
  let lastError = null;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    try {
      await producer.connect();
      await producer.send(payload);
      return;
    } catch (error) {
      lastError = error;
      await new Promise((resolve) => setTimeout(resolve, 200 * attempt));
    }
  }
  throw lastError;
}

app.post('/threads/open', async (req, res) => {
  try {
    await ensureThreadsTable();
    const { participant_a, participant_b } = req.body;
    if (!participant_a || !participant_b) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'participant_a and participant_b required', trace_id: crypto.randomUUID() });
    }
    if (participant_a === participant_b) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'participants must be different', trace_id: crypto.randomUUID() });
    }

    const [existing] = await db.query(
      `SELECT thread_id FROM message_threads
       WHERE (participant_a = ? AND participant_b = ?)
          OR (participant_a = ? AND participant_b = ?)
       ORDER BY last_activity DESC
       LIMIT 1`,
      [participant_a, participant_b, participant_b, participant_a]
    );
    if (existing.length) {
      return res.status(200).json({ thread_id: existing[0].thread_id, reused: true });
    }

    const threadId = 'T-' + crypto.randomUUID().substring(0, 8);
    await db.query(
      'INSERT INTO message_threads (thread_id, participant_a, participant_b) VALUES (?, ?, ?)',
      [threadId, participant_a, participant_b]
    );
    res.status(201).json({ thread_id: threadId });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/threads/get', async (req, res) => {
  try {
    await ensureThreadsTable();
    const { thread_id } = req.body;
    const [rows] = await db.query('SELECT * FROM message_threads WHERE thread_id = ?', [thread_id]);
    if (!rows.length) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Thread not found', trace_id: crypto.randomUUID() });
    }
    res.status(200).json(rows[0]);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/threads/byUser', async (req, res) => {
  try {
    await ensureThreadsTable();
    const { user_id } = req.body;
    if (!user_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'user_id required', trace_id: crypto.randomUUID() });
    }
    const [rows] = await db.query(
      'SELECT * FROM message_threads WHERE participant_a = ? OR participant_b = ? ORDER BY last_activity DESC',
      [user_id, user_id]
    );
    res.status(200).json(rows);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/messages/send', async (req, res) => {
  try {
    const { thread_id, sender_id, text } = req.body;
    if (!thread_id || !sender_id || !text) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'thread_id, sender_id, text required', trace_id: crypto.randomUUID() });
    }
    await ensureThreadsTable();
    const receiver_id = await resolveReceiverId(thread_id, sender_id);
    if (!receiver_id) {
      return res.status(404).json({ error: 'NOT_FOUND', message: 'Thread not found', trace_id: crypto.randomUUID() });
    }
    const mongo = await getMongoDb();
    const msgId = 'MSG-' + crypto.randomUUID().substring(0, 8);
    const doc = {
      message_id: msgId,
      thread_id,
      sender_id,
      receiver_id,
      message_text: text,
      timestamp: new Date().toISOString()
    };
    await mongo.collection('messages').insertOne(doc);

    await db.query(
      'UPDATE message_threads SET last_activity = CURRENT_TIMESTAMP WHERE thread_id = ?',
      [thread_id]
    );

    const traceId = crypto.randomUUID();
    const idem = crypto.randomUUID();
    await sendKafkaWithRetry({
      topic: 'message.events',
      messages: [{
        key: thread_id,
        value: JSON.stringify(envelope('message.sent', traceId, sender_id, thread_id, { thread_id, message_id: msgId, sender_id, receiver_id, text }, idem))
      }]
    });

    res.status(201).json({ message_id: msgId, thread_id });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'MESSAGE_SEND_FAILED', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/messages/list', async (req, res) => {
  try {
    const { thread_id, limit = 50 } = req.body;
    if (!thread_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'thread_id required', trace_id: crypto.randomUUID() });
    }
    const mongo = await getMongoDb();
    const msgs = await mongo.collection('messages')
      .find({ thread_id })
      .sort({ timestamp: 1 })
      .limit(Number(limit))
      .toArray();
    res.status(200).json(msgs);
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4004;
app.listen(PORT, () => console.log(`messaging-service API running on port ${PORT}`));
