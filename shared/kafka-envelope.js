const ISO_8601_RE = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(?:\.\d+)?Z$/;

const ALLOWED_ENTITY_TYPES = new Set(['job', 'application', 'thread', 'connection', 'member', 'ai_task']);

/**
 * Validate shared Kafka-style envelope used across services.
 * Returns { ok: boolean, errors: string[] }.
 */
function validateKafkaEnvelope(msg) {
  const errors = [];
  if (!msg || typeof msg !== 'object') return { ok: false, errors: ['body must be JSON object'] };

  if (!msg.event_type || typeof msg.event_type !== 'string') errors.push('event_type required');
  if (!msg.trace_id || typeof msg.trace_id !== 'string') errors.push('trace_id required');
  if (!msg.timestamp || typeof msg.timestamp !== 'string' || !ISO_8601_RE.test(msg.timestamp)) {
    errors.push('timestamp must be ISO-8601 string');
  }
  if (!msg.actor_id || typeof msg.actor_id !== 'string') errors.push('actor_id required');
  if (!msg.idempotency_key || typeof msg.idempotency_key !== 'string') errors.push('idempotency_key required');

  const entity = msg.entity;
  if (!entity || typeof entity !== 'object') {
    errors.push('entity object required');
  } else {
    if (!entity.entity_type || typeof entity.entity_type !== 'string') errors.push('entity.entity_type required');
    if (!entity.entity_id || typeof entity.entity_id !== 'string') errors.push('entity.entity_id required');
    if (entity.entity_type && !ALLOWED_ENTITY_TYPES.has(entity.entity_type)) {
      errors.push(`entity.entity_type invalid: ${entity.entity_type}`);
    }
  }

  if (!Object.prototype.hasOwnProperty.call(msg, 'payload') || typeof msg.payload !== 'object' || msg.payload === null) {
    errors.push('payload object required');
  }

  return { ok: errors.length === 0, errors };
}

module.exports = {
  validateKafkaEnvelope
};
