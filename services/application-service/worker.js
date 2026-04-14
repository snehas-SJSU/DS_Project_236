const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');

const consumer = kafka.consumer({ groupId: 'application-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS applications (
      app_id VARCHAR(50) PRIMARY KEY,
      job_id VARCHAR(50),
      member_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'pending',
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      INDEX (job_id),
      INDEX (member_id)
    )
  `);
  console.log('MySQL Applications table ensured');
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  await consumer.subscribe({ topic: 'application.events', fromBeginning: true });
  console.log(`application-service Worker listening to 'application.events'`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        console.log(`Processing event: ${event.event_type} for ${event.entity.entity_id}`);

        if (event.event_type === 'application.submitted') {
          const { job_id, member_id, status } = event.payload;
          const appId = event.entity.entity_id;

          await db.query(
            'INSERT INTO applications (app_id, job_id, member_id, status) VALUES (?, ?, ?, ?)',
            [appId, job_id, member_id, status]
          );
          console.log(`Saved application ${appId} to MySQL`);
        }
      } catch (err) {
        console.error('Worker processing error:', err);
      }
    },
  });
}

runWorker().catch(console.error);