const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { alreadyProcessed, markProcessed } = require('../../shared/idempotency');

const consumer = kafka.consumer({ groupId: 'member-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      member_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100),
      title VARCHAR(150),
      location VARCHAR(100),
      email VARCHAR(100),
      about TEXT,
      skills JSON,
      experience JSON,
      education JSON,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_email (email)
    )
  `);
  console.log('MySQL Members table ensured');
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  await consumer.subscribe({ topic: 'member.events', fromBeginning: false });
  console.log(`member-service Worker listening to 'member.events'`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const idem = event.idempotency_key;
        if (idem && (await alreadyProcessed(`member-worker:${idem}`))) {
          return;
        }

        if (event.event_type === 'member.created' || event.event_type === 'member.updated') {
          const { name, title, location, email, about, skills, experience, education } = event.payload;
          const memberId = event.entity.entity_id;

          await db.query(
            `INSERT INTO members (member_id, name, title, location, email, about, skills, experience, education, status)
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
             ON DUPLICATE KEY UPDATE
             name=VALUES(name), title=VALUES(title), location=VALUES(location),
             email=VALUES(email), about=VALUES(about), skills=VALUES(skills),
             experience=VALUES(experience), education=VALUES(education)`,
            [
              memberId, name, title, location, email, about,
              JSON.stringify(skills || []),
              JSON.stringify(experience || []),
              JSON.stringify(education || [])
            ]
          );
          if (idem) await markProcessed(`member-worker:${idem}`);
          console.log(`Saved member ${memberId} to MySQL`);
        }
      } catch (err) {
        console.error('Worker processing error:', err);
      }
    },
  });
}

runWorker().catch(console.error);
