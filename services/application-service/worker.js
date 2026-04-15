const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { alreadyProcessed, markProcessed } = require('../../shared/idempotency');

const consumer = kafka.consumer({ groupId: 'application-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS applications (
      app_id VARCHAR(50) PRIMARY KEY,
      job_id VARCHAR(50),
      member_id VARCHAR(50),
      status VARCHAR(50) DEFAULT 'submitted',
      cover_letter TEXT,
      recruiter_note TEXT,
      applied_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_job_member (job_id, member_id),
      INDEX (job_id),
      INDEX (member_id)
    )
  `);
  console.log('MySQL Applications table ensured');
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  await consumer.subscribe({ topic: 'application.events', fromBeginning: false });
  console.log(`application-service Worker listening to 'application.events'`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const idem = event.idempotency_key;
        if (idem && (await alreadyProcessed(`app-worker:${idem}`))) {
          return;
        }

        if (event.event_type === 'application.submitted') {
          const { job_id, member_id, status, cover_letter } = event.payload;
          const appId = event.entity.entity_id;

          try {
            await db.query(
              'INSERT INTO applications (app_id, job_id, member_id, status, cover_letter) VALUES (?, ?, ?, ?, ?)',
              [appId, job_id, member_id, status || 'submitted', cover_letter || null]
            );
            await db.query('UPDATE jobs SET applicants_count = COALESCE(applicants_count, 0) + 1 WHERE job_id = ?', [job_id]);
          } catch (e) {
            if (e.code === 'ER_DUP_ENTRY') {
              console.log('Duplicate application skipped (idempotent)');
            } else {
              throw e;
            }
          }
          if (idem) await markProcessed(`app-worker:${idem}`);
          console.log(`Saved application ${appId} to MySQL`);
        }

        if (event.event_type === 'application.status_updated') {
          const { application_id, status, recruiter_note } = event.payload;
          await db.query(
            'UPDATE applications SET status = ?, recruiter_note = COALESCE(?, recruiter_note) WHERE app_id = ?',
            [status, recruiter_note || null, application_id]
          );
          if (idem) await markProcessed(`app-worker:${idem}`);
        }
      } catch (err) {
        console.error('Worker processing error:', err);
      }
    },
  });
}

runWorker().catch(console.error);
