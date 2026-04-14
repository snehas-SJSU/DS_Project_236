const redis = require('redis');

const client = redis.createClient({
  url: process.env.REDIS_URL || 'redis://localhost:6379'
});

client.on('error', (err) => console.log('Redis Client Error', err));

let isConnected = false;
async function connectRedis() {
  if (!isConnected) {
    await client.connect();
    isConnected = true;
  }
}

module.exports = {
  client,
  connectRedis
};
