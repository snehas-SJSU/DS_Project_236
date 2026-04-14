const fs = require('fs');
const path = require('path');

const services = [
  { name: 'job-service', port: 4002, topic: 'job.events' },
  { name: 'application-service', port: 4003, topic: 'application.events' },
  { name: 'messaging-service', port: 4004, topic: 'message.events' },
  { name: 'analytics-service', port: 4005, topic: 'analytics.events' }
];

services.forEach(svc => {
  const dir = path.join(__dirname, 'services', svc.name);
  if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });

  // package.json
  fs.writeFileSync(path.join(dir, 'package.json'), JSON.stringify({
    name: svc.name,
    version: "1.0.0",
    main: "api.js",
    scripts: {
      "start:api": "node api.js",
      "start:worker": "node worker.js"
    },
    dependencies: {
      "express": "^4.18.2",
      "kafkajs": "^2.2.4",
      "mysql2": "^3.6.1",
      "dotenv": "^16.3.1"
    }
  }, null, 2));

  // api.js
  fs.writeFileSync(path.join(dir, 'api.js'), `
const express = require('express');
const kafka = require('../../shared/kafka-client');

const app = express();
app.use(express.json());
const producer = kafka.producer();

app.post('/test', async (req, res) => {
  await producer.connect();
  await producer.send({
    topic: '${svc.topic}',
    messages: [{ value: JSON.stringify({ event_type: 'test', timestamp: new Date().toISOString() }) }]
  });
  res.status(202).json({ message: 'Accepted by ${svc.name} Producer' });
});

const PORT = process.env.PORT || ${svc.port};
app.listen(PORT, () => console.log(\`${svc.name} API running on port \${PORT}\`));
  `.trim());

  // worker.js
  fs.writeFileSync(path.join(dir, 'worker.js'), `
const kafka = require('../../shared/kafka-client');
const consumer = kafka.consumer({ groupId: '${svc.name}-group' });

async function runWorker() {
  await consumer.connect();
  await consumer.subscribe({ topic: '${svc.topic}', fromBeginning: true });
  console.log(\`${svc.name} Worker listening to '${svc.topic}'\`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(\`Received in worker: \${message.value.toString()}\`);
    },
  });
}
runWorker().catch(console.error);
  `.trim());
});
console.log('Successfully scaffolded 4 microservices.');
