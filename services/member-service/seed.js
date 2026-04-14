const kafka = require('../../shared/kafka-client');
const crypto = require('crypto');

const producer = kafka.producer();

async function seed() {
  try {
    console.log('Connecting to Kafka...');
    await producer.connect();

    const memberId = 'M-123';
    const traceId = crypto.randomUUID();

    const profileData = {
      name: 'Sneha Singh',
      title: 'Full Stack AI Engineer | Specializing in Distributed Systems',
      location: 'San Jose, California',
      email: 'sneha.singh@example.com',
      about: 'Passionate software engineer focused on building scalable distributed systems and integrating Agentic AI workflows. Experienced in React, Node.js, and Python FastAPI. Strong background in event-driven architectures utilizing Kafka and multi-database infrastructures (MySQL, MongoDB, Redis).',
      skills: ['Distributed Systems', 'React.js', 'Kafka & APIs', 'Node.js', 'Python', 'MySQL'],
      experience: [
        {
          role: 'Software Engineer Intern',
          company: 'LinkedIn',
          period: 'May 2023 - Present',
          description: 'Developed microservices using Node.js and Kafka. Implemented SQL caching using Redis to reduce P95 latency by 45%.'
        }
      ],
      education: [
        {
          school: 'San Jose State University',
          degree: 'Master of Science - Computer Science',
          period: '2022 - 2024'
        }
      ]
    };

    const eventPayload = {
      event_type: 'member.created',
      trace_id: traceId,
      timestamp: new Date().toISOString(),
      actor_id: memberId,
      entity: { entity_type: 'member', entity_id: memberId },
      payload: profileData,
      idempotency_key: crypto.createHash('sha256').update(`seed-${memberId}`).digest('hex')
    };

    await producer.send({
      topic: 'member.events',
      messages: [{ key: memberId, value: JSON.stringify(eventPayload) }]
    });

    console.log('Profile seed event sent for M-123 (Sneha Singh)');
    process.exit(0);
  } catch (err) {
    console.error('Seed error:', err);
    process.exit(1);
  }
}

seed();
