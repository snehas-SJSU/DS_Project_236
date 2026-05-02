const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'linkedin-services',
  brokers: (process.env.KAFKA_BROKERS || 'localhost:29092').split(',').map((s) => s.trim()),
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

module.exports = kafka;