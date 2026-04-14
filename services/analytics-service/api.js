const express = require('express');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());
const producer = kafka.producer();

app.post('/test', async (req, res) => {
  await producer.connect();
  await producer.send({
    topic: 'analytics.events',
    messages: [{ value: JSON.stringify({ event_type: 'test', timestamp: new Date().toISOString() }) }]
  });
  res.status(202).json({ message: 'Accepted by analytics-service Producer' });
});

const PORT = process.env.PORT || 4005;
app.listen(PORT, () => console.log(`analytics-service API running on port ${PORT}`));