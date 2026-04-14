const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');

const consumer = kafka.consumer({ groupId: 'user-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      member_id VARCHAR(255) PRIMARY KEY,
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      email VARCHAR(255) UNIQUE,
      headline VARCHAR(255),
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  // We subscribe to the topic created by the API
  await consumer.subscribe({ topic: 'member.events', fromBeginning: true });

  console.log("User Service Worker (Consumer) started. Listening to 'member.events'");

  await consumer.run({
    eachMessage: async ({ topic, partition, message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        
        if (event.event_type === 'member.created') {
          const { first_name, last_name, email, headline } = event.payload;
          
          await db.query(
            `INSERT INTO members (member_id, first_name, last_name, email, headline) 
             VALUES (?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE 
             first_name=VALUES(first_name), last_name=VALUES(last_name), headline=VALUES(headline)`,
            [event.entity.entity_id, first_name, last_name, email, headline]
          );
          
          console.log(`Worker successfully processed member.created for ${email} (Trace: ${event.trace_id})`);
        }
      } catch (err) {
        console.error("Worker failed to process message", err);
      }
    },
  });
}

runWorker().catch(console.error);
