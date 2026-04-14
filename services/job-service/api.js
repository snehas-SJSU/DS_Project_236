const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');
const db = require('../../shared/mysql');
const redisModule = require('../../shared/redis');

const app = express();
app.use(express.json());

const producer = kafka.producer();

app.post('/jobs/create', async (req, res) => {
  try {
    const { title, company, location, salary, type, skills, description } = req.body;
    const jobId = 'J-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    
    await producer.connect();

    const eventPayload = {
      event_type: 'job.created',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      actor_id: 'recruiter', // Placeholder
      entity: { entity_type: 'job', entity_id: jobId },
      payload: { title, company, location, salary, type, skills: JSON.stringify(skills), description },
      idempotency_key: crypto.createHash('sha256').update(`job.created-${jobId}`).digest('hex')
    };

    await producer.send({
      topic: 'job.events',
      messages: [{ key: jobId, value: JSON.stringify(eventPayload) }]
    });

    res.status(201).json({ message: 'Job creation requested', job_id: jobId, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE' });
  }
});

app.post('/jobs/search', async (req, res) => {
  console.log('DEBUG: /jobs/search called');
  try {
    // Ensure table exists before querying
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
    console.log('DEBUG: table ensured');
    const [rows] = await db.query('SELECT * FROM jobs ORDER BY created_at DESC LIMIT 50');
    console.log('DEBUG: rows found =', rows.length);
    const formatted = rows.map(r => ({
      id: r.job_id,
      title: r.title,
      company: r.company,
      location: r.location,
      salary: r.salary,
      type: r.type,
      postedAt: 'Just now',
      skills: Array.isArray(r.skills) ? r.skills : JSON.parse(r.skills || '[]'),
      description: r.description
    }));
    res.status(200).json(formatted);
  } catch (err) {
    console.error('Search error:', err.message);
    res.status(200).json([]); // Return empty array so UI doesn't crash
  }
});

app.post('/jobs/get', async (req, res) => {
  try {
    const { job_id } = req.body;
    await redisModule.connectRedis();
    
    // Check Cache First
    const cachedJob = await redisModule.client.get(`job:${job_id}`);
    if (cachedJob) {
      console.log('Cache hit for job:', job_id);
      return res.status(200).json(JSON.parse(cachedJob));
    }

    console.log('Cache miss for job:', job_id);
    const [rows] = await db.query('SELECT * FROM jobs WHERE job_id = ?', [job_id]);
    
    if (rows.length === 0) return res.status(404).json({ error: 'JOB_NOT_FOUND' });

    const job = rows[0];
    job.skills = JSON.parse(job.skills || '[]');
    
    // Store in cache for 5 minutes (300 seconds)
    await redisModule.client.setEx(`job:${job_id}`, 300, JSON.stringify(job));

    res.status(200).json(job);
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'SERVER_ERROR' });
  }
});

const PORT = process.env.PORT || 4002;
app.listen(PORT, () => {
  console.log(`Job Service API running on port ${PORT}`);
});