const express = require('express');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());
const producer = kafka.producer();

app.post('/test', async (req, res) => {
  await producer.connect();
  await producer.send({
    topic: 'message.events',
    messages: [{ value: JSON.stringify({ event_type: 'test', timestamp: new Date().toISOString() }) }]
  });
  res.status(202).json({ message: 'Accepted by messaging-service Producer' });
});

const PORT = process.env.PORT || 4004;
app.listen(PORT, () => console.log(`messaging-service API running on port ${PORT}`));