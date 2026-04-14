const { MongoClient } = require('mongodb');

const uri = process.env.MONGO_URL || 'mongodb://127.0.0.1:27017';
let client;
let db;

async function getMongoDb() {
  if (!db) {
    client = new MongoClient(uri);
    await client.connect();
    db = client.db(process.env.MONGO_DB || 'linkedin_sim');
  }
  return db;
}

module.exports = { getMongoDb };
