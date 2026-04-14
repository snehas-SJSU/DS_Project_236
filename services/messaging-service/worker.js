const kafka = require('../../shared/kafka-client');
const consumer = kafka.consumer({ groupId: 'messaging-service-group' });

async function runWorker() {
  await consumer.connect();
  await consumer.subscribe({ topic: 'message.events', fromBeginning: true });
  console.log(`messaging-service Worker listening to 'message.events'`);

  await consumer.run({
    eachMessage: async ({ message }) => {
      console.log(`Received in worker: ${message.value.toString()}`);
    },
  });
}
runWorker().catch(console.error);