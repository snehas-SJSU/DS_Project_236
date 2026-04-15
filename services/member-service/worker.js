const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const { alreadyProcessed, markProcessed } = require('../../shared/idempotency');

const consumer = kafka.consumer({ groupId: 'member-service-group' });

async function initDB() {
  const ensureColumn = async (columnName, ddl) => {
    const [rows] = await db.query('SHOW COLUMNS FROM members LIKE ?', [columnName]);
    if (!rows.length) await db.query(`ALTER TABLE members ADD COLUMN ${ddl}`);
  };

  await db.query(`
    CREATE TABLE IF NOT EXISTS members (
      member_id VARCHAR(50) PRIMARY KEY,
      name VARCHAR(100),
      first_name VARCHAR(100),
      last_name VARCHAR(100),
      title VARCHAR(150),
      headline VARCHAR(150),
      location VARCHAR(100),
      city VARCHAR(100),
      state VARCHAR(100),
      country VARCHAR(100),
      email VARCHAR(100),
      phone VARCHAR(30),
      about TEXT,
      summary TEXT,
      skills JSON,
      experience JSON,
      education JSON,
      profile_photo_url MEDIUMTEXT,
      cover_photo_url MEDIUMTEXT,
      cover_theme VARCHAR(30) DEFAULT 'blue',
      resume_url TEXT,
      resume_text MEDIUMTEXT,
      connections_count INT DEFAULT 0,
      profile_views INT DEFAULT 0,
      status VARCHAR(20) DEFAULT 'active',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP,
      UNIQUE KEY uk_email (email)
    )
  `);
  await ensureColumn('first_name', 'first_name VARCHAR(100)');
  await ensureColumn('last_name', 'last_name VARCHAR(100)');
  await ensureColumn('headline', 'headline VARCHAR(150)');
  await ensureColumn('city', 'city VARCHAR(100)');
  await ensureColumn('state', 'state VARCHAR(100)');
  await ensureColumn('country', 'country VARCHAR(100)');
  await ensureColumn('phone', 'phone VARCHAR(30)');
  await ensureColumn('summary', 'summary TEXT');
  await ensureColumn('profile_photo_url', 'profile_photo_url MEDIUMTEXT');
  await ensureColumn('cover_photo_url', 'cover_photo_url MEDIUMTEXT');
  await ensureColumn('cover_theme', 'cover_theme VARCHAR(30) DEFAULT "blue"');
  await ensureColumn('resume_url', 'resume_url TEXT');
  await ensureColumn('resume_text', 'resume_text MEDIUMTEXT');
  await ensureColumn('connections_count', 'connections_count INT DEFAULT 0');
  await ensureColumn('profile_views', 'profile_views INT DEFAULT 0');
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
          const {
            name, first_name, last_name, title, headline, location, city, state, country, email, phone,
            about, summary, skills, experience, education, profile_photo_url, cover_photo_url, cover_theme, resume_url, resume_text
          } = event.payload;
          const memberId = event.entity.entity_id;

          await db.query(
            `INSERT INTO members (
              member_id, name, first_name, last_name, title, headline, location, city, state, country,
              email, phone, about, summary, skills, experience, education, profile_photo_url, cover_photo_url, cover_theme, resume_url, resume_text, status
            )
             VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, 'active')
             ON DUPLICATE KEY UPDATE
             name=VALUES(name), first_name=VALUES(first_name), last_name=VALUES(last_name), title=VALUES(title),
             headline=VALUES(headline), location=VALUES(location), city=VALUES(city), state=VALUES(state), country=VALUES(country),
             email=VALUES(email), phone=VALUES(phone), about=VALUES(about), summary=VALUES(summary), skills=VALUES(skills),
             experience=VALUES(experience), education=VALUES(education), profile_photo_url=VALUES(profile_photo_url),
             cover_photo_url=VALUES(cover_photo_url), cover_theme=VALUES(cover_theme),
             resume_url=VALUES(resume_url), resume_text=VALUES(resume_text)`,
            [
              memberId, name, first_name, last_name, title, headline, location, city, state, country, email, phone, about, summary,
              JSON.stringify(skills || []),
              JSON.stringify(experience || []),
              JSON.stringify(education || []),
              profile_photo_url || null,
              cover_photo_url || null,
              cover_theme || 'blue',
              resume_url || null,
              resume_text || null
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
