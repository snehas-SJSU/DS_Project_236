const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { alreadyProcessed, markProcessed } = require('../../shared/idempotency');

const consumer = kafka.consumer({ groupId: 'job-service-group' });

async function initDB() {
  await db.query(`
    CREATE TABLE IF NOT EXISTS jobs (
      job_id VARCHAR(50) PRIMARY KEY,
      title VARCHAR(255),
      company VARCHAR(255),
      industry VARCHAR(100),
      location VARCHAR(100),
      remote_mode VARCHAR(20),
      seniority_level VARCHAR(50),
      employment_type VARCHAR(50),
      salary VARCHAR(100),
      type VARCHAR(50),
      skills JSON,
      description TEXT,
      status VARCHAR(50) DEFAULT 'open',
      recruiter_id VARCHAR(50) DEFAULT 'R-default',
      views_count INT DEFAULT 0,
      saves_count INT DEFAULT 0,
      applicants_count INT DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    )
  `);
}

async function runWorker() {
  await initDB();
  await consumer.connect();
  await consumer.subscribe({ topic: 'job.events', fromBeginning: false });

  console.log("Job Service Worker listening to 'job.events'");

  await consumer.run({
    eachMessage: async ({ message }) => {
      try {
        const event = JSON.parse(message.value.toString());
        const idem = event.idempotency_key;
        if (idem && (await alreadyProcessed(`job-worker:${idem}`))) {
          return;
        }

        if (event.event_type === 'job.created') {
          const {
            title, company, industry, location, remote_mode, seniority_level,
            employment_type, salary, type, skills, description, recruiter_id
          } = event.payload;
          await db.query(
            `INSERT INTO jobs (
              job_id, title, company, industry, location, remote_mode, seniority_level, employment_type,
              salary, type, skills, description, recruiter_id, status
            )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'open')
             ON DUPLICATE KEY UPDATE title=VALUES(title), company=VALUES(company), location=VALUES(location),
             industry=VALUES(industry), remote_mode=VALUES(remote_mode), seniority_level=VALUES(seniority_level),
             employment_type=VALUES(employment_type), salary=VALUES(salary), type=VALUES(type), skills=VALUES(skills),
             description=VALUES(description), recruiter_id=VALUES(recruiter_id)`,
            [
              event.entity.entity_id, title, company, industry || null, location, remote_mode || null,
              seniority_level || null, employment_type || type || null, salary, type || employment_type || null,
              typeof skills === 'string' ? skills : JSON.stringify(skills || []), description, recruiter_id || 'R-default'
            ]
          );
          if (idem) await markProcessed(`job-worker:${idem}`);
          console.log(`Job Worker saved ${event.entity.entity_id} to MySQL.`);
        }

        if (event.event_type === 'job.viewed') {
          await db.query(
            'UPDATE jobs SET views_count = views_count + 1 WHERE job_id = ?',
            [event.entity.entity_id]
          );
          if (idem) await markProcessed(`job-worker:${idem}`);
        }

        if (event.event_type === 'job.saved') {
          await db.query(
            'UPDATE jobs SET saves_count = COALESCE(saves_count, 0) + 1 WHERE job_id = ?',
            [event.entity.entity_id]
          );
          if (idem) await markProcessed(`job-worker:${idem}`);
        }

        if (event.event_type === 'job.updated' || event.event_type === 'job.closed') {
          const jid = event.entity.entity_id;
          const p = event.payload || {};
          if (event.event_type === 'job.closed') {
            await db.query("UPDATE jobs SET status = 'closed' WHERE job_id = ?", [jid]);
          } else {
            const sets = [];
            const vals = [];
            ['title', 'company', 'location', 'salary', 'type', 'description'].forEach((k) => {
              if (p[k] !== undefined) {
                sets.push(`${k} = ?`);
                vals.push(p[k]);
              }
            });
            if (p.skills !== undefined) {
              sets.push('skills = ?');
              vals.push(JSON.stringify(p.skills));
            }
            if (sets.length) {
              vals.push(jid);
              await db.query(`UPDATE jobs SET ${sets.join(', ')} WHERE job_id = ?`, vals);
            }
          }
          if (idem) await markProcessed(`job-worker:${idem}`);
        }
      } catch (err) {
        console.error('Worker generic fail', err);
      }
    },
  });
}
runWorker().catch(console.error);
