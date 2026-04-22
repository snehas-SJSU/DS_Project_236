const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://127.0.0.1:6379',
  socket: {
    connectTimeout: 3000,
    reconnectStrategy: () => false // do not retry forever if Redis is down
  }
});

client.on('error', (err) => console.log('Redis Client Error', err));

let connectPromise = null;
async function connectRedis() {
  if (client.isOpen) return;
  if (!connectPromise) {
    connectPromise = client.connect().finally(() => {
      connectPromise = null;
    });
  }
  await connectPromise;
}

module.exports = {
  client,
  connectRedis
};
