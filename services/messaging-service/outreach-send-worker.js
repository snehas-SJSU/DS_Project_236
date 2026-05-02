require('dotenv').config({ path: require('path').join(__dirname, '.env') });

const http = require('http');
const https = require('https');
const { URL } = require('url');
const { Kafka } = require('kafkajs');

const brokers = (process.env.KAFKA_BROKERS || 'localhost:29092').split(',').map((s) => s.trim());
const topic = process.env.OUTREACH_REQUESTS_TOPIC || 'outreach.requests';
const groupId = process.env.OUTREACH_SEND_GROUP || 'outreach-send-worker';
const gatewayBase = (process.env.GATEWAY_API_BASE || 'http://127.0.0.1:4000/api').replace(/\/$/, '');

const seenKeys = new Set();
const SEEN_MAX = 2000;

function rememberKey(key) {
  if (!key) return false;
  if (seenKeys.has(key)) return true;
  seenKeys.add(key);
  if (seenKeys.size > SEEN_MAX) {
    const it = seenKeys.values();
    for (let i = 0; i < SEEN_MAX / 2; i++) seenKeys.delete(it.next().value);
  }
  return false;
}

function postJson(path, body) {
  const urlStr = `${gatewayBase}${path.startsWith('/') ? path : `/${path}`}`;
  const url = new URL(urlStr);
  const payload = JSON.stringify(body);
  const lib = url.protocol === 'https:' ? https : http;
  const options = {
    method: 'POST',
    hostname: url.hostname,
    port: url.port || (url.protocol === 'https:' ? 443 : 80),
    path: `${url.pathname}${url.search || ''}`,
    headers: {
      'Content-Type': 'application/json',
      'Content-Length': Buffer.byteLength(payload),
    },
  };
  return new Promise((resolve, reject) => {
    const req = lib.request(options, (res) => {
      let chunks = '';
      res.on('data', (c) => {
        chunks += c;
      });
      res.on('end', () => {
        let data;
        try {
          data = chunks ? JSON.parse(chunks) : {};
        } catch {
          data = { raw: chunks };
        }
        if (res.statusCode && res.statusCode >= 400) {
          const err = new Error(`${res.statusCode} ${urlStr}: ${chunks.slice(0, 200)}`);
          err.status = res.statusCode;
          err.body = data;
          reject(err);
        } else {
          resolve(data);
        }
      });
    });
    req.on('error', reject);
    req.write(payload);
    req.end();
  });
}

async function deliverOutreach(actorId, candidateId, outreachText, jobId, traceId) {
  const thread = await postJson('/threads/open', {
    participant_a: actorId,
    participant_b: candidateId,
  });
  const threadId = thread.thread_id;
  const prefix = jobId ? `[AI outreach | job ${jobId}] ` : '[AI outreach] ';
  const text = `${prefix}${(outreachText || '').trim() || '(no draft text)'}`;
  await postJson('/messages/send', {
    thread_id: threadId,
    sender_id: actorId,
    text,
  });
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'outreach_delivered',
      trace_id: traceId,
      thread_id: threadId,
      actor_id: actorId,
      candidate_id: candidateId,
    }),
  );
}

async function handleEnvelope(value) {
  let env;
  try {
    env = JSON.parse(value.toString());
  } catch {
    console.error('invalid_json', value.toString().slice(0, 120));
    return;
  }
  if (env.event_type !== 'ai.send.requested') return;

  const idem = env.idempotency_key || '';
  if (rememberKey(idem)) {
    console.log(JSON.stringify({ level: 'info', msg: 'duplicate_skipped', idempotency_key: idem }));
    return;
  }

  const actorId = env.actor_id;
  const traceId = env.trace_id || '';
  const payload = env.payload || {};
  const inner = payload.data || payload;
  const jobId = inner.job_id || '';
  const messages = Array.isArray(inner.messages)
    ? inner.messages.filter((m) => m && (m.candidate_id || m.member_id) && (m.text || m.outreach_text))
    : [];
  const candidateIds = Array.isArray(inner.candidate_ids) ? inner.candidate_ids.filter(Boolean) : [];
  const outreachText = inner.outreach_text || '';

  if (!actorId) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'skip_missing_actor', actor_id: actorId }));
    return;
  }

  if (messages.length) {
    for (const m of messages) {
      const candidateId = m.candidate_id || m.member_id;
      const text = m.text || m.outreach_text || '';
      try {
        await deliverOutreach(actorId, candidateId, text, jobId, traceId);
      } catch (e) {
        console.error(
          JSON.stringify({
            level: 'error',
            msg: 'deliver_failed',
            candidate_id: candidateId,
            error: e.message,
          }),
        );
      }
    }
    return;
  }

  if (!candidateIds.length) {
    console.warn(JSON.stringify({ level: 'warn', msg: 'skip_missing_fields', actor_id: actorId, candidateIds }));
    return;
  }

  for (const candidateId of candidateIds) {
    try {
      await deliverOutreach(actorId, candidateId, outreachText, jobId, traceId);
    } catch (e) {
      console.error(
        JSON.stringify({
          level: 'error',
          msg: 'deliver_failed',
          candidate_id: candidateId,
          error: e.message,
        }),
      );
    }
  }
}

async function main() {
  const kafka = new Kafka({ clientId: 'outreach-send-worker', brokers });
  const consumer = kafka.consumer({ groupId });

  await consumer.connect();
  await consumer.subscribe({ topic, fromBeginning: false });
  console.log(
    JSON.stringify({
      level: 'info',
      msg: 'outreach_send_worker_started',
      brokers,
      topic,
      groupId,
      gatewayBase,
    }),
  );

  await consumer.run({
    eachMessage: async ({ message }) => {
      if (!message.value) return;
      await handleEnvelope(message.value);
    },
  });
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
