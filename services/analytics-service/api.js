const express = require('express');
const crypto = require('crypto');
const db = require('../../shared/mysql');
const { getMongoDb } = require('../../shared/mongo');

const app = express();
app.use(express.json());

async function ensureApplicationsTable() {
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
}

app.post('/events/ingest', async (req, res) => {
  try {
    const body = req.body;
    const mongo = await getMongoDb();
    await mongo.collection('events').insertOne({
      event_type: body.event_type || 'unknown',
      trace_id: body.trace_id || crypto.randomUUID(),
      timestamp: body.timestamp || new Date().toISOString(),
      actor_id: body.actor_id,
      entity: body.entity,
      payload: body.payload || {},
      ingested_at: new Date().toISOString()
    });
    res.status(202).json({ accepted: true });
  } catch (err) {
    console.error(err);
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/analytics/jobs/top', async (req, res) => {
  try {
    const { metric = 'applications', window_days = 30 } = req.body;
    const mongo = await getMongoDb();
    const since = new Date();
    since.setDate(since.getDate() - Number(window_days));

    if (metric === 'applications') {
      await ensureApplicationsTable();
      const wd = Number(window_days);
      const [rows] = await db.query(
        `SELECT job_id, COUNT(*) AS c FROM applications
         WHERE applied_at >= DATE_SUB(NOW(), INTERVAL ${wd} DAY)
         GROUP BY job_id ORDER BY c DESC LIMIT 10`
      );
      return res.status(200).json({ metric, window_days, jobs: rows });
    }

    const agg = await mongo.collection('events').aggregate([
      { $match: { event_type: 'job.viewed', timestamp: { $gte: since.toISOString() } } },
      { $group: { _id: '$payload.job_id', views: { $sum: 1 } } },
      { $sort: { views: -1 } },
      { $limit: 10 }
    ]).toArray();

    res.status(200).json({ metric, window_days, jobs: agg });
  } catch (err) {
    res.status(200).json({ metric: req.body.metric, jobs: [], error: err.message });
  }
});

app.post('/analytics/funnel', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { job_id, window_days = 30 } = req.body;
    if (!job_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'job_id required', trace_id: crypto.randomUUID() });
    }
    const mongo = await getMongoDb();
    const since = new Date();
    since.setDate(since.getDate() - Number(window_days));

    const events = await mongo.collection('events').find({
      'payload.job_id': job_id,
      timestamp: { $gte: since.toISOString() }
    }).toArray();

    const counts = { view: 0, save: 0, apply_start: 0, submit: 0 };
    events.forEach((e) => {
      const t = e.event_type || e.raw?.event_type;
      if (t === 'job.viewed') counts.view++;
      if (t === 'job.saved') counts.save++;
      if (t === 'apply.start') counts.apply_start++;
      if (t === 'application.submitted') counts.submit++;
    });

    const [appCount] = await db.query(
      'SELECT COUNT(*) AS c FROM applications WHERE job_id = ? AND applied_at >= DATE_SUB(NOW(), INTERVAL ? DAY)',
      [job_id, Number(window_days)]
    );
    counts.submit = appCount[0]?.c || counts.submit;

    res.status(200).json({ job_id, window_days, funnel: counts });
  } catch (err) {
    res.status(503).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

app.post('/analytics/geo', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { job_id } = req.body;
    const [rows] = await db.query(
      `SELECT COALESCE(m.location, 'unknown') AS location, COUNT(*) AS applicants
       FROM applications a LEFT JOIN members m ON a.member_id = m.member_id
       WHERE a.job_id = ?
       GROUP BY m.location`,
      [job_id]
    );
    res.status(200).json({ job_id, distribution: rows });
  } catch (err) {
    res.status(200).json({ job_id: req.body.job_id, distribution: [] });
  }
});

app.post('/analytics/member/dashboard', async (req, res) => {
  try {
    await ensureApplicationsTable();
    const { member_id } = req.body;
    if (!member_id) {
      return res.status(400).json({ error: 'BAD_REQUEST', message: 'member_id required', trace_id: crypto.randomUUID() });
    }
    const mongo = await getMongoDb();
    const since = new Date();
    since.setDate(since.getDate() - 30);

    const views = await mongo.collection('events').countDocuments({
      event_type: 'profile.viewed',
      'payload.member_id': member_id,
      timestamp: { $gte: since.toISOString() }
    });

    const [statusRows] = await db.query(
      'SELECT status, COUNT(*) AS c FROM applications WHERE member_id = ? GROUP BY status',
      [member_id]
    );

    res.status(200).json({
      member_id,
      profile_views_30d: views,
      applications_by_status: statusRows
    });
  } catch (err) {
    res.status(500).json({ error: 'INTERNAL_ERROR', message: err.message, trace_id: crypto.randomUUID() });
  }
});

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => console.log(`analytics-service API running on port ${PORT}`));
