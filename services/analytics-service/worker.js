const kafka = require('../../shared/kafka-client');
const consumer = kafka.consumer({ groupId: 'analytics-service-group' });

async function runWorker() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'analytics.events', fromBeginning: true });
  console.log(`analytics-service Worker listening to 'analytics.events'`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(`Received in worker: ${message.value.toString()}`);
    },
  });
}
runWorker().catch(console.error);