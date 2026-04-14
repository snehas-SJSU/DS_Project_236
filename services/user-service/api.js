const express = require('express');
const crypto = require('crypto');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());

const producer = kafka.producer();

app.post('/members/create', async (req, res) => {
  try {
    const { first_name, last_name, email, headline } = req.body;
    
    if (!email || !first_name) {
      return res.status(400).json({ error: 'Missing required fields' });
    }

    await producer.connect();

    const traceId = crypto.randomUUID();
    const eventPayload = {
      event_type: 'member.created',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      actor_id: 'system',
      entity: { entity_type: 'member', entity_id: email },
      payload: { first_name, last_name, email, headline },
      idempotency_key: crypto.createHash('sha256').update(`member.created-${email}`).digest('hex')
    };

    // Publish to Kafka topic 'member.events'
    await producer.send({
      topic: 'member.events',
      messages: [{ key: email, value: JSON.stringify(eventPayload) }]
    });

    res.status(202).json({ 
      message: 'Profile creation request accepted', 
      trace_id: traceId 
    });
  } catch (err) {
    console.error('Failed to publish to Kafka:', err);
    res.status(503).json({ error: 'KAFKA_UNAVAILABLE' });
  }
});

const PORT = process.env.PORT || 4001;
app.listen(PORT, () => {
  console.log(`User Service API (Producer) listening on port ${PORT}`);
});
