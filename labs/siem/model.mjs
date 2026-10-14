import { createHash } from 'node:crypto';
import { isDeepStrictEqual } from 'node:util';

export const rules = Object.freeze({ windowMs: 60000, latenessMs: 30000, maxAdvanceMs: 300000, authFailures: 3, scanPorts: 4 });
export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, ...details });
const identifier = /^[a-zA-Z0-9_-]{1,80}$/;
function object(value, fields) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !fields.includes(key))) throw fail(400, `Expected an object containing only: ${fields.join(', ')}.`);
}
function id(value, field) {
  if (typeof value !== 'string' || !identifier.test(value)) throw fail(400, `${field} must use 1–80 letters, digits, underscores or hyphens.`);
  return value;
}
function address(value) {
  if (typeof value !== 'string' || !/^(192\.0\.2|198\.51\.100|203\.0\.113)\.(?:0|[1-9][0-9]{0,2})$/.test(value) || Number(value.split('.').at(-1)) > 255) throw fail(400, 'Use an RFC 5737 IPv4 documentation address.');
  return value;
}
export function normalize(input) {
  if (input?.format === 'network-json') {
    object(input, ['format', 'event_id', 'timestamp', 'event_type', 'sensor', 'source', 'destination', 'user', 'outcome', 'transport']);
    object(input.source, ['ip']);
    object(input.destination, ['ip', 'port']);
    if (input.event_type === 'authentication') {
      object(input.user, ['name']);
      if (!['failure', 'success'].includes(input.outcome) || input.destination.port !== undefined || input.transport !== undefined) throw fail(400, 'Authentication requires failure/success and no port or transport.');
    } else if (input.event_type === 'connection') {
      if (input.user !== undefined || input.outcome !== undefined) throw fail(400, 'Connections do not contain user or outcome.');
    } else throw fail(400, 'event_type must be authentication or connection.');
    if (typeof input.timestamp !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(input.timestamp)) throw fail(400, 'timestamp must be canonical UTC ISO 8601 with milliseconds.');
    const eventTime = Date.parse(input.timestamp);
    if (!Number.isFinite(eventTime) || new Date(eventTime).toISOString() !== input.timestamp) throw fail(400, 'Invalid timestamp.');
    return normalize({ id: input.event_id, eventTime, sensor: input.sensor, srcIp: input.source.ip, dstIp: input.destination.ip,
      kind: input.event_type === 'authentication' ? `auth.${input.outcome}` : 'flow',
      ...(input.event_type === 'authentication' ? { actor: input['user']['name'] } : { dstPort: input.destination.port, protocol: input.transport }) });
  }
  object(input, ['id', 'eventTime', 'sensor', 'srcIp', 'dstIp', 'kind', 'actor', 'dstPort', 'protocol']);
  const command = { type: 'ingest', id: id(input.id, 'id'), eventTime: input.eventTime, sensor: id(input.sensor, 'sensor'), srcIp: address(input.srcIp), dstIp: address(input.dstIp), kind: input.kind };
  if (!Number.isSafeInteger(command.eventTime) || command.eventTime < 946684800000 || command.eventTime >= 4102444800000) throw fail(400, 'eventTime must be integer Unix milliseconds in [2000, 2100).');
  if (['auth.failure', 'auth.success'].includes(command.kind)) {
    command.actor = id(input.actor, 'actor');
    if (input.dstPort !== undefined || input.protocol !== undefined) throw fail(400, 'Authentication has no port or protocol.');
  } else if (command.kind === 'flow') {
    if (input.actor !== undefined || !Number.isInteger(input.dstPort) || input.dstPort < 1 || input.dstPort > 65535 || !['tcp', 'udp'].includes(input.protocol)) throw fail(400, 'Flows require dstPort 1–65535, tcp/udp protocol, and no actor.');
    command.dstPort = input.dstPort;
    command.protocol = input.protocol;
  } else throw fail(400, 'kind must be auth.failure, auth.success or flow.');
  return command;
}
export function validateCommand(input) {
  if (input?.type === 'ingest') {
    const { type, ...event } = input;
    return normalize(event);
  }
  object(input, ['type', 'id', 'incidentId', 'action', 'expectedRevision', 'analyst']);
  if (input.type !== 'incident' || !['acknowledge', 'resolve', 'reopen'].includes(input.action) || !Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 1) throw fail(400, 'Incident command requires action and positive expectedRevision.');
  return { type: 'incident', id: id(input.id, 'id'), incidentId: id(input.incidentId, 'incidentId'), action: input.action, expectedRevision: input.expectedRevision, analyst: id(input.analyst, 'analyst') };
}
const order = (a, b) => a.eventTime - b.eventTime || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0);
function bucketFor(command) {
  const rule = command.kind === 'flow' ? 'multi-port' : 'brute-force';
  const start = Math.floor(command.eventTime / rules.windowMs) * rules.windowMs;
  const entity = [command.sensor, command.srcIp, command.dstIp, command.kind === 'flow' ? command.protocol : command.actor];
  const key = JSON.stringify([rule, start, ...entity]);
  const incidentId = `inc-${createHash('sha256').update(key).digest('hex').slice(0, 32)}`;
  return { key, rule, start, end: start + rules.windowMs, entity, incidentId };
}
function correlation(bucket, events, previous, command) {
  const sorted = [...events].sort(order);
  const failures = sorted.filter(event => event.kind === 'auth.failure');
  const ports = [...new Set(sorted.map(event => event.dstPort).filter(port => port !== undefined))].sort((a, b) => a - b);
  if ((bucket.rule === 'brute-force' && failures.length < rules.authFailures) || (bucket.rule === 'multi-port' && ports.length < rules.scanPorts)) return null;
  const successes = bucket.rule === 'brute-force' ? sorted.filter(event => event.kind === 'auth.success' && event.eventTime >= failures[rules.authFailures - 1].eventTime) : [];
  const evidence = (bucket.rule === 'brute-force' ? [...failures, ...successes].sort(order) : sorted).map(event => ({ eventId: event.id, eventTime: event.eventTime, href: `/api/events/${event.id}` }));
  const candidate = { id: bucket.incidentId, rule: bucket.rule, entity: bucket.entity, windowStart: bucket.start, windowEnd: bucket.end,
    severity: successes.length ? 'high' : 'medium', failureCount: failures.length, ports, successLinked: successes.length > 0, evidence };
  if (previous && isDeepStrictEqual(candidate, Object.fromEntries(Object.keys(candidate).map(key => [key, previous[key]])))) return null;
  const status = !previous || previous.status === 'resolved' ? 'open' : previous.status;
  return { ...candidate, status, revision: (previous?.revision || 0) + 1,
    transitions: [...(previous?.transitions || []), { commandId: command.id, action: !previous ? 'opened' : previous.status === 'resolved' ? 'reopened-by-evidence' : 'evidence-updated', status, severity: candidate.severity, evidenceIds: evidence.map(item => item.eventId) }] };
}
export function createModel() {
  const operations = new Map();
  const incidents = new Map();
  const buckets = new Map();
  let maxEventTime = null;
  let duplicates = 0;
  let lastOffset = null;
  const watermark = () => maxEventTime === null ? null : maxEventTime - rules.latenessMs;
  function plan(command) {
    const before = watermark();
    if (command.type === 'incident') {
      const previous = incidents.get(command.incidentId);
      const reason = !previous ? 'incident-not-found' : previous.revision !== command.expectedRevision ? 'revision-conflict' : command.action === 'acknowledge' && previous.status !== 'open' ? 'not-open' : command.action === 'resolve' && previous.status === 'resolved' ? 'already-resolved' : command.action === 'reopen' && previous.status !== 'resolved' ? 'not-resolved' : null;
      if (reason) return { accepted: false, reason, watermarkBefore: before, watermarkAfter: before, bucketKey: null, incident: null };
      const status = { acknowledge: 'acknowledged', resolve: 'resolved', reopen: 'open' }[command.action];
      const incident = { ...previous, status, revision: previous.revision + 1, transitions: [...previous.transitions, { commandId: command.id, action: command.action, analyst: command.analyst, status, severity: previous.severity, evidenceIds: previous.evidence.map(item => item.eventId) }] };
      return { accepted: true, reason: null, watermarkBefore: before, watermarkAfter: before, bucketKey: null, incident };
    }
    const reason = before !== null && command.eventTime < before ? 'late-event' : maxEventTime !== null && command.eventTime > maxEventTime + rules.maxAdvanceMs ? 'time-jump' : null;
    if (reason) return { accepted: false, reason, watermarkBefore: before, watermarkAfter: before, bucketKey: null, incident: null };
    const bucket = bucketFor(command);
    const events = [...(buckets.get(bucket.key)?.eventIds || []).map(eventId => operations.get(eventId).command), command];
    return { accepted: true, reason: null, watermarkBefore: before, watermarkAfter: Math.max(maxEventTime ?? command.eventTime, command.eventTime) - rules.latenessMs,
      bucketKey: bucket.key, incident: correlation(bucket, events, incidents.get(bucket.incidentId), command) };
  }
  function apply(record, metadata) {
    object(record, ['schema', 'command', 'outcome']);
    const command = validateCommand(record.command);
    if (record.schema !== 1 || !isDeepStrictEqual(command, record.command) || metadata.key !== command.id || metadata.partition !== 0) throw new Error('Invalid SIEM ledger record.');
    const prior = operations.get(command.id);
    if (prior) {
      if (!isDeepStrictEqual(prior.record, record)) throw new Error('Conflicting SIEM ledger ID.');
      duplicates += 1;
      lastOffset = metadata.offset;
      return prior;
    }
    const outcome = plan(command);
    if (!isDeepStrictEqual(record.outcome, outcome)) throw new Error('SIEM replay outcome does not match correlation state.');
    if (outcome.accepted && command.type === 'ingest') {
      const bucket = bucketFor(command);
      const existing = buckets.get(bucket.key);
      buckets.set(bucket.key, { ...bucket, eventIds: [...(existing?.eventIds || []), command.id] });
      maxEventTime = Math.max(maxEventTime ?? command.eventTime, command.eventTime);
    }
    if (outcome.incident) incidents.set(outcome.incident.id, outcome.incident);
    const receipt = { command, outcome, record, offset: metadata.offset, href: `/api/receipts/${command.id}` };
    operations.set(command.id, receipt);
    lastOffset = metadata.offset;
    return receipt;
  }
  function snapshot() {
    return { rules, maxEventTime, watermark: watermark(), lastOffset, duplicates, buckets: [...buckets.values()], incidents: [...incidents.values()], operations: [...operations.values()] };
  }
  return { operations, incidents, plan, apply, snapshot };
}
