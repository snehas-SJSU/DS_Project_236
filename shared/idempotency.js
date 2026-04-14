const redisModule = require('./redis');

const TTL_SEC = 86400; // 24h — aligns with API doc

async function alreadyProcessed(idempotencyKey) {
  if (!idempotencyKey) return false;
  await redisModule.connectRedis();
  const k = `idem:${idempotencyKey}`;
  const v = await redisModule.client.get(k);
  return !!v;
}

async function markProcessed(idempotencyKey) {
  if (!idempotencyKey) return;
  await redisModule.connectRedis();
  await redisModule.client.setEx(`idem:${idempotencyKey}`, TTL_SEC, '1');
}

module.exports = { alreadyProcessed, markProcessed };
