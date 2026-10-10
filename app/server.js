import { createServer } from 'node:http';
import { readFile } from 'node:fs/promises';
import { extname, join, normalize, sep } from 'node:path';
import { randomUUID } from 'node:crypto';
import kafkaClient from '@confluentinc/kafka-javascript';
import client from '@prometheus-io/client';

const { Kafka, logLevel, ErrorCodes } = kafkaClient.KafkaJS;

const TOPIC = 'lab.events';
const GROUP = 'lab-explorer';
const KINDS = new Set(['order.created', 'payment.received', 'sensor.reading']);
const PUBLIC_DIR = join(import.meta.dirname, 'public');
const MAX_RECENT = 100;
const MAX_BODY = 64 * 1024;
const brokers = (process.env.KAFKA_BROKERS ?? 'localhost:9092').split(',');
const links = {
  console: process.env.CONSOLE_URL ?? '',
  grafana: process.env.GRAFANA_URL ?? '',
  prometheus: process.env.PROMETHEUS_URL ?? '',
  registry: process.env.REGISTRY_URL ?? '',
};

// Native delivery retries are bounded by message.timeout.ms, not the broker's ack timeout.
const kafka = new Kafka({
  kafkaJS: {
    clientId: 'redpanda-lab-app', brokers, logLevel: logLevel.WARN, connectionTimeout: 3000, requestTimeout: 10000,
    retry: { initialRetryTime: 300, maxRetryTime: 5000, retries: 10 },
  },
});
let admin;
let producer;
let consumer;
let stopping = false;
let clusterTimer;

function createClients() {
  // Disconnected native clients cannot reconnect; each startup attempt owns fresh instances.
  admin = kafka.admin();
  producer = kafka.producer({
    kafkaJS: { idempotent: true, maxInFlightRequests: 1, acks: -1, timeout: 10000, allowAutoTopicCreation: false },
    'partitioner': 'murmur2_random',
    'message.timeout.ms': 30000,
    'linger.ms': 0,
  });
  consumer = kafka.consumer({
    kafkaJS: {
      groupId: GROUP, sessionTimeout: 15000, heartbeatInterval: 3000,
      fromBeginning: true, autoCommit: true, autoCommitInterval: 1000, allowAutoTopicCreation: false,
    },
    rebalance_cb: (error, assignment, assignmentFns) => {
      if (error.code === ErrorCodes.ERR__ASSIGN_PARTITIONS) {
        assignmentFns.assign(assignment);
        // Reapply the requested pause before any records from the new assignment are processed.
        if (state.paused) consumer.pause([{ topic: TOPIC }]);
        else consumer.resume([{ topic: TOPIC }]);
      } else if (error.code !== ErrorCodes.ERR__REVOKE_PARTITIONS && !stopping) {
        recordError('consume', error);
      }
    },
  });
}

client.collectDefaultMetrics();
const producedTotal = new client.Counter({ name: 'lab_produced_total', help: 'Records acknowledged by all in-sync replicas.', labelNames: ['source'] });
const consumedTotal = new client.Counter({ name: 'lab_consumed_total', help: 'Records processed by the lab consumer.' });
const errorsTotal = new client.Counter({ name: 'lab_errors_total', help: 'Failed lab operations.', labelNames: ['operation'] });
const pausedGauge = new client.Gauge({ name: 'lab_consumer_paused', help: '1 when the shared lab consumer is paused.' });
const lagGauge = new client.Gauge({ name: 'lab_consumer_lag', help: 'Records between partition high watermarks and committed group offsets.' });
const deliverySeconds = new client.Histogram({ name: 'lab_delivery_seconds', help: 'Event creation to consumption latency, including paused backlog time.', buckets: [0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2.5, 5, 10, 30, 60, 300] });
const generatorGauge = new client.Gauge({ name: 'lab_generator_running', help: '1 while the bounded traffic generator runs.' });

const state = {
  ready: false, produced: 0, consumed: 0, paused: false, lag: null, lagError: 'Waiting for the cluster.',
  partitions: [], recent: [], lastError: null, brokers: [],
};
const generator = { running: false, rate: 0, endsAt: 0, timer: null, inFlight: false, due: 0, lastTick: 0 };

function recordError(operation, error) {
  errorsTotal.inc({ operation });
  state.lastError = `${new Date().toISOString()} ${operation}: ${error.message}`;
  console.error(state.lastError);
}

async function produce(events, source) {
  const result = await producer.send({
    topic: TOPIC,
    // acks and timeout belong to the producer configuration, not individual sends.
    messages: events.map((event) => ({ key: event.key, value: JSON.stringify(event), headers: { kind: event.kind, source } })),
  });
  producedTotal.inc({ source }, events.length);
  state.produced += events.length;
  return result;
}

function newEvent(key, kind, payload, source) {
  return { id: randomUUID(), key, kind, source, createdAt: new Date().toISOString(), payload };
}

function syntheticEvent() {
  const kinds = [...KINDS];
  const kind = kinds[Math.floor(Math.random() * kinds.length)];
  const n = Math.floor(Math.random() * 10000);
  const payload = kind === 'sensor.reading'
    ? { sensor: `sensor-${n % 12}`, celsius: Number((18 + Math.random() * 12).toFixed(2)) }
    : { amount: Number((Math.random() * 250).toFixed(2)), currency: 'EUR', customer: `customer-${n % 40}` };
  return newEvent(`${kind.split('.')[0]}-${n % 24}`, kind, payload, 'generator');
}

function generatorState() {
  return { running: generator.running, rate: generator.rate, remainingSeconds: generator.running ? Math.max(0, Math.ceil((generator.endsAt - Date.now()) / 1000)) : 0 };
}

function stopGenerator() {
  clearInterval(generator.timer);
  Object.assign(generator, { running: false, rate: 0, endsAt: 0, timer: null, due: 0 });
  generatorGauge.set(0);
}

async function generatorTick() {
  const now = Date.now();
  if (now >= generator.endsAt) return stopGenerator();
  generator.due = Math.min(generator.rate, generator.due + generator.rate * (now - generator.lastTick) / 1000);
  generator.lastTick = now;
  const count = Math.floor(generator.due);
  if (generator.inFlight || count < 1) return;
  generator.due -= count;
  generator.inFlight = true;
  try {
    await produce(Array.from({ length: count }, syntheticEvent), 'generator');
  } catch (error) {
    recordError('generate', error);
  } finally {
    generator.inFlight = false;
  }
}

async function refreshClusterState() {
  try {
    const [metadata, topicOffsets, groupOffsets] = await Promise.all([
      admin.fetchTopicMetadata({ topics: [TOPIC] }),
      admin.fetchTopicOffsets(TOPIC),
      admin.fetchOffsets({ groupId: GROUP, topics: [TOPIC] }),
    ]);
    const topic = metadata.find((entry) => entry.name === TOPIC);
    if (topic?.partitions.length !== 6 || topic.partitions.some((p) => p.leader < 0 || p.replicas.length !== 3)) {
      throw new Error(`${TOPIC} must have six available partitions with replication factor three.`);
    }
    for (const partition of groupOffsets[0]?.partitions ?? []) {
      if (partition.error) throw new Error(`Group offset for partition ${partition.partition}: ${partition.error.message}`);
    }
    const committed = new Map((groupOffsets[0]?.partitions ?? []).map((p) => [p.partition, BigInt(p.offset)]));
    state.partitions = topicOffsets.map((p) => {
      const high = BigInt(p.high);
      const commit = committed.get(p.partition) ?? -1n;
      const position = commit < 0n ? BigInt(p.low) : commit;
      return { partition: p.partition, high: p.high, committed: commit < 0n ? 'none' : commit.toString(), lag: Number(high > position ? high - position : 0n) };
    }).sort((a, b) => a.partition - b.partition);
    state.lag = state.partitions.reduce((sum, p) => sum + p.lag, 0);
    state.lagError = null;
    const nodes = new Map(topic.partitions.flatMap((p) => p.replicaNodes ?? []).map((node) => [node.id, node]));
    state.brokers = [...nodes.values()].map(({ id, host, port }) => ({ nodeId: id, host, port })).sort((a, b) => a.nodeId - b.nodeId);
    lagGauge.set(state.lag);
  } catch (error) {
    state.lag = null;
    state.lagError = error.message;
  }
}

async function start() {
  for (let attempt = 1; !stopping; attempt += 1) {
    try {
      createClients();
      await admin.connect();
      await admin.createTopics({ topics: [{ topic: TOPIC, numPartitions: 6, replicationFactor: 3, configEntries: [{ name: 'retention.ms', value: String(6 * 60 * 60 * 1000) }] }] });
      await producer.connect();
      await consumer.connect();
      await consumer.subscribe({ topics: [TOPIC] });
      // run() starts the loop and returns before joining the group; readiness waits for assignment below.
      await consumer.run({
        eachMessage: async ({ partition, message }) => {
          let event;
          try {
            event = JSON.parse(message.value.toString());
          } catch {
            event = { id: `invalid-${partition}-${message.offset}`, key: message.key?.toString() ?? '', kind: 'invalid.json', source: 'unknown', createdAt: new Date(Number(message.timestamp)).toISOString(), payload: {} };
            errorsTotal.inc({ operation: 'decode' });
          }
          const consumedAt = new Date();
          const created = Date.parse(event.createdAt);
          if (Number.isFinite(created)) deliverySeconds.observe(Math.max(0, consumedAt - created) / 1000);
          consumedTotal.inc();
          state.consumed += 1;
          state.recent.unshift({ ...event, partition, offset: message.offset, consumedAt: consumedAt.toISOString() });
          state.recent.length = Math.min(state.recent.length, MAX_RECENT);
        },
      });
      const deadline = Date.now() + 30000;
      while (!stopping && consumer.assignment().filter((p) => p.topic === TOPIC).length !== 6) {
        if (Date.now() >= deadline) throw new Error('Consumer did not join the group and acquire all six partitions.');
        await new Promise((resolve) => setTimeout(resolve, 100));
      }
      if (stopping) return;
      await refreshClusterState();
      if (state.lag === null || state.brokers.length !== 3) throw new Error(state.lagError ?? 'Waiting for all three broker nodes.');
      state.ready = true;
      state.lastError = null;
      // Schedule after completion so slow admin requests cannot overlap or overwrite newer lag.
      const refresh = async () => {
        await refreshClusterState();
        if (!stopping) clusterTimer = setTimeout(refresh, 2000).unref();
      };
      clusterTimer = setTimeout(refresh, 2000).unref();
      console.log(`Ready: ${TOPIC} on ${brokers.join(',')}`);
      return;
    } catch (error) {
      state.lastError = `${new Date().toISOString()} startup attempt ${attempt}: ${error.message}`;
      console.error(state.lastError);
      state.ready = false;
      await Promise.allSettled([consumer?.disconnect(), producer?.disconnect(), admin?.disconnect()]);
      if (!stopping) await new Promise((resolve) => setTimeout(resolve, Math.min(10000, attempt * 1000)));
    }
  }
}

class HttpError extends Error {
  constructor(status, message) { super(message); this.status = status; }
}

async function readJson(req) {
  if (!(req.headers['content-type'] ?? '').startsWith('application/json')) throw new HttpError(415, 'Send JSON with Content-Type: application/json.');
  let size = 0;
  const chunks = [];
  for await (const chunk of req) {
    size += chunk.length;
    if (size > MAX_BODY) throw new HttpError(413, 'Request body exceeds 64 KiB.');
    chunks.push(chunk);
  }
  try {
    return JSON.parse(Buffer.concat(chunks).toString('utf8'));
  } catch {
    throw new HttpError(400, 'Request body is not valid JSON.');
  }
}

function send(res, status, body, type = 'application/json; charset=utf-8') {
  res.writeHead(status, { 'content-type': type, 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(typeof body === 'string' || Buffer.isBuffer(body) ? body : JSON.stringify(body));
}

function requireReady() {
  if (!state.ready) throw new HttpError(503, 'The cluster is still starting. Wait for the ready status.');
}

const isObject = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
const contentTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml' };

async function route(req, res) {
  const url = new URL(req.url, 'http://localhost');
  if (req.method === 'GET' && url.pathname === '/api/stats') {
    return send(res, 200, { ...state, topic: TOPIC, group: GROUP, generator: generatorState(), links });
  }
  if (req.method === 'GET' && url.pathname === '/metrics') return send(res, 200, await client.register.metrics(), client.register.contentType);
  if (req.method === 'POST' && url.pathname === '/api/produce') {
    requireReady();
    const body = await readJson(req);
    if (typeof body.key !== 'string' || body.key.length < 1 || body.key.length > 200) throw new HttpError(400, 'Key must contain 1 to 200 characters.');
    if (!KINDS.has(body.kind)) throw new HttpError(400, `Kind must be one of: ${[...KINDS].join(', ')}.`);
    if (!isObject(body.payload)) throw new HttpError(400, 'Payload must be a JSON object.');
    const event = newEvent(body.key, body.kind, body.payload, 'manual');
    try {
      const [ack] = await produce([event], 'manual');
      return send(res, 201, { id: event.id, partition: ack.partition, offset: ack.baseOffset });
    } catch (error) {
      recordError('produce', error);
      throw new HttpError(504, `Delivery outcome is unknown (${error.message}). Search Console for event ${event.id} before sending it again.`);
    }
  }
  if (req.method === 'POST' && url.pathname === '/api/consumer') {
    requireReady();
    const body = await readJson(req);
    if (typeof body.paused !== 'boolean') throw new HttpError(400, 'paused must be true or false.');
    // During a rebalance there may be no assignment: retain intent and reapply it on assignment.
    if (consumer.assignment().some((p) => p.topic === TOPIC)) {
      if (body.paused) consumer.pause([{ topic: TOPIC }]);
      else consumer.resume([{ topic: TOPIC }]);
    }
    state.paused = body.paused;
    pausedGauge.set(body.paused ? 1 : 0);
    return send(res, 200, { paused: state.paused });
  }
  if (req.method === 'POST' && url.pathname === '/api/generator') {
    requireReady();
    const body = await readJson(req);
    if (!Number.isInteger(body.rate) || body.rate < 1 || body.rate > 100) throw new HttpError(400, 'Rate must be an integer from 1 through 100 records per second.');
    if (!Number.isInteger(body.duration) || body.duration < 1 || body.duration > 300) throw new HttpError(400, 'Duration must be an integer from 1 through 300 seconds.');
    if (generator.running) throw new HttpError(409, 'The generator is already running. Stop it before starting another run.');
    Object.assign(generator, { running: true, rate: body.rate, endsAt: Date.now() + body.duration * 1000, due: 0, lastTick: Date.now() });
    generator.timer = setInterval(generatorTick, 100);
    generatorGauge.set(1);
    return send(res, 202, generatorState());
  }
  if (req.method === 'POST' && url.pathname === '/api/generator/stop') {
    stopGenerator();
    return send(res, 200, generatorState());
  }
  if (req.method !== 'GET' && req.method !== 'HEAD') throw new HttpError(405, 'Method not allowed.');
  const relative = normalize(decodeURIComponent(url.pathname === '/' ? '/index.html' : url.pathname)).replace(/^([/\\])+/, '');
  const file = join(PUBLIC_DIR, relative);
  if (!file.startsWith(PUBLIC_DIR + sep) || !contentTypes[extname(file)]) throw new HttpError(404, 'Not found.');
  try {
    return send(res, 200, await readFile(file), contentTypes[extname(file)]);
  } catch {
    throw new HttpError(404, 'Not found.');
  }
}

const server = createServer((req, res) => {
  route(req, res).catch((error) => {
    const status = error instanceof HttpError ? error.status : 500;
    if (status === 500) recordError('http', error);
    if (!res.headersSent) send(res, status, { error: status === 500 ? 'Unexpected server error. Check ./lab logs app.' : error.message });
  });
});

async function shutdown() {
  stopping = true;
  state.ready = false;
  clearTimeout(clusterTimer);
  stopGenerator();
  server.close();
  await Promise.allSettled([consumer?.disconnect(), producer?.disconnect(), admin?.disconnect()]);
  process.exit(0);
}
process.once('SIGTERM', shutdown);
process.once('SIGINT', shutdown);

server.listen(3000, '0.0.0.0', () => console.log('HTTP listening on :3000'));
start();
