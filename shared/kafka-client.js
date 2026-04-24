const { Kafka } = require('kafkajs');

const kafka = new Kafka({
  clientId: 'linkedin-services',
  brokers: [process.env.KAFKA_BROKER || '127.0.0.1:9093'],
  retry: {
    initialRetryTime: 100,
    retries: 8
  }
});

module.exports = kafka;
