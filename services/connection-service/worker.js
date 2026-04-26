const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { alreadyProcessed, markProcessed } = require('../../shared/idempotency');

const consumer = kafka.consumer({ groupId: 'connection-service-group' });

function pairKey(u1, u2) {
  return u1 < u2 ? [u1, u2] : [u2, u1];
}

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

async function handleRequested(event) {
  const requestId = event.entity?.entity_id;
  const { requester_id, receiver_id } = event.payload || {};
  if (!requestId || !requester_id || !receiver_id) return;

  await db.query(
    `INSERT INTO connection_requests (request_id, requester_id, receiver_id, status)
     VALUES (?, ?, ?, 'pending')
     ON DUPLICATE KEY UPDATE requester_id = VALUES(requester_id), receiver_id = VALUES(receiver_id)`,
    [requestId, requester_id, receiver_id]
  );
}

async function handleAccepted(event) {
  const requestId = event.entity?.entity_id;
  const { requester_id, receiver_id } = event.payload || {};
  if (!requestId || !requester_id || !receiver_id) return;

  const [a, b] = pairKey(requester_id, receiver_id);
  await db.query('UPDATE connection_requests SET status = ? WHERE request_id = ?', ['accepted', requestId]);
  await db.query('INSERT IGNORE INTO connections (user_a, user_b) VALUES (?, ?)', [a, b]);
}

async function handleRejected(event) {
  const requestId = event.entity?.entity_id;
  if (!requestId) return;
  await db.query('UPDATE connection_requests SET status = ? WHERE request_id = ?', ['rejected', requestId]);
}

async function runWorker() {
  await ensureSchema();
  await consumer.connect();
  await consumer.subscribe({ topic: 'connection.events', fromBeginning: false });
  console.log("connection-service Worker listening to 'connection.events'");

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const idem = event.idempotency_key;
        if (idem && (await alreadyProcessed(`connection-worker:${idem}`))) {
          return;
        }

        switch (event.event_type) {
          case 'connection.requested':
            await handleRequested(event);
            break;
          case 'connection.accepted':
            await handleAccepted(event);
            break;
          case 'connection.rejected':
            await handleRejected(event);
            break;
          default:
            return;
        }

        if (idem) await markProcessed(`connection-worker:${idem}`);
      } catch (err) {
        console.error('connection worker processing error:', err);
      }
    }
  });
}

runWorker().catch(console.error);
