const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');

const consumer = kafka.consumer({ groupId: 'job-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255),
      company VARCHAR(255),
      location VARCHAR(100),
      salary VARCHAR(100),
      type VARCHAR(50),
      skills JSON,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  await consumer.subscribe({ topic: 'job.events', fromBeginning: true });

  console.log("Job Service Worker listening to 'job.events'");

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        
        if (event.event_type === 'job.created') {
          const { title, company, location, salary, type, skills, description } = event.payload;
          
          await db.query(
            `INSERT INTO jobs (job_id, title, company, location, salary, type, skills, description) 
             VALUES (?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE title=VALUES(title)`,
            [event.entity.entity_id, title, company, location, salary, type, skills, description]
          );
          
          console.log(`Job Worker saved ${event.entity.entity_id} to MySQL.`);
        }
      } catch (err) {
        console.error("Worker generic fail", err);
      }
    },
  });
}
runWorker().catch(console.error);