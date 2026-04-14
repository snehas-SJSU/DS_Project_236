const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());
const producer = kafka.producer();

app.post('/applications/apply', async (req, res) => {
  try {
    const { job_id, member_id } = req.body;
    
    if (!job_id || !member_id) {
      return res.status(400).json({ error: 'MISSING_FIELDS' });
    }

    const appId = 'APP-' + crypto.randomUUID().substring(0, 8);
    const traceId = crypto.randomUUID();
    
    await producer.connect();

    const eventPayload = {
      event_type: 'application.submitted',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      actor_id: member_id,
      entity: { entity_type: 'application', entity_id: appId },
      payload: { job_id, member_id, status: 'pending' },
      idempotency_key: crypto.createHash('sha256').update(`app.submitted-${appId}`).digest('hex')
    };

    await producer.send({
      topic: 'application.events',
      messages: [{ key: appId, value: JSON.stringify(eventPayload) }]
    });

    res.status(202).json({ 
      message: 'Application submitted', 
      application_id: appId, 
      trace_id: traceId 
    });
  } catch (err) {
    console.error('Producer error:', err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE' });
  }
});

const PORT = process.env.PORT || 4003;
app.listen(PORT, () => console.log(`application-service API running on port ${PORT}`));