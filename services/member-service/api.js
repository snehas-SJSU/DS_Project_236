const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());
const producer = kafka.producer();

// Create Member
app.post('/members/create', async (req, res) => {
  try {
    const { name, title, location, email, skills, about, experience, education } = req.body;
    const memberId = 'M-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();

    await producer.connect();
    
    const eventPayload = {
      event_type: 'member.created',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      entity: { entity_type: 'member', entity_id: memberId },
      payload: { name, title, location, email, skills, about, experience, education }
    };

    await producer.send({
      topic: 'member.events',
      messages: [{ key: memberId, value: JSON.stringify(eventPayload) }]
    });

    res.status(201).json({ message: 'Member creation requested', member_id: memberId, trace_id: traceId });
  } catch (err) {
    console.error(err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE' });
  }
});

const db = require('../../shared/mysql');

// Get Member
app.post('/members/get', async (req, res) => {
  try {
    const { member_id } = req.body;
    console.log(`DEBUG: Fetching member ${member_id}`);
    
    const [rows] = await db.query('SELECT * FROM members WHERE member_id = ?', [member_id]);
    
    if (rows.length === 0) {
      console.log(`DEBUG: Member ${member_id} not found`);
      return res.status(404).json({ error: 'MEMBER_NOT_FOUND' });
    }

    const member = rows[0];
    console.log('DEBUG: Member row found:', member);

    // Parse JSON fields safely
    const formatted = {
      ...member,
      skills: Array.isArray(member.skills) ? member.skills : JSON.parse(member.skills || '[]'),
      experience: Array.isArray(member.experience) ? member.experience : JSON.parse(member.experience || '[]'),
      education: Array.isArray(member.education) ? member.education : JSON.parse(member.education || '[]')
    };
    
    res.status(200).json(formatted);
  } catch (err) {
    console.error('DEBUG ERROR:', err);
    res.status(500).json({ error: 'DATABASE_ERROR', details: err.message });
  }
});

// Keep Search placeholder for Swagger compliance
app.post('/members/search', async (req, res) => {
  res.status(200).json([]);
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => console.log(`member-service API running on port ${PORT}`));
