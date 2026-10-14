import { createServer } from 'node:http';
import { createHash, randomUUID } from 'node:crypto';
import { Kafka, logLevel } from 'kafkajs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';

const regions = ['eu', 'us', 'apac'];
// Residency is operator-owned, never chosen by a command or its network location.
const tenants = Object.fromEntries([
  ['berlin-shop', 'DE', 'eu'], ['paris-shop', 'FR', 'eu'], ['dublin-shop', 'IE', 'eu'],
  ['new-york-shop', 'US', 'us'], ['toronto-shop', 'CA', 'us'],
  ['singapore-shop', 'SG', 'apac'], ['tokyo-shop', 'JP', 'apac'],
].map(([id, country, region]) => [id, { id, country, region, partition: createHash('sha256').update(id).digest().readUInt32BE(0) % 3 }]));
const role = process.env.ROLE || 'gateway';
const region = process.env.REGION;
if (!['gateway', 'regional', 'global'].includes(role) || (role === 'regional' && !regions.includes(region))) throw new Error('Invalid service role/region');
const topic = role === 'global' ? 'jurisdictions.summaries.v1' : 'jurisdictions.records.v1';
const operations = new Map();
const shards = Array.from({ length: 3 }, (_, partition) => ({ partition, sourceOffset: '-1', count: 0, totalAmount: 0 }));
const summaries = new Map();
let ready = role === 'gateway';
let federation = 'waiting';
let federationError = null;
let log, exportProducer, exportTimer;
let closing = false;
const error = (status, message) => Object.assign(new Error(message), { status });
const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
const kafka = (brokers, clientId) => new Kafka({ brokers: [brokers], clientId, logLevel: logLevel.ERROR, connectionTimeout: 1500, requestTimeout: 4000, retry: { retries: 2, initialRetryTime: 200 } });

function command(input) {
  const tenant = tenants[input.tenantId];
  if (!tenant || !Object.hasOwn(tenants, input.tenantId)) throw error(400, 'Unknown fixture tenant');
  if (typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,100}$/.test(input.id)) throw error(400, 'Supply a stable operation id (letters, digits, underscore, hyphen)');
  if (!Number.isSafeInteger(input.amount) || input.amount < 1 || input.amount > 1000000) throw error(400, 'amount must be integer synthetic units from 1 through 1000000');
  if (typeof input.privateNote !== 'string' || input.privateNote.length > 240) throw error(400, 'privateNote must be a string of at most 240 characters');
  if (input.requestedRegion !== undefined && input.requestedRegion !== tenant.region) throw error(409, `Tenant residency is ${tenant.region}; relocation is not permitted`);
  return { id: input.id, tenantId: tenant.id, country: tenant.country, region: tenant.region, amount: input.amount, privateNote: input.privateNote };
}

async function connectProjection() {
  const client = kafka(process.env.KAFKA_BROKERS, `jurisdictions-${region || role}`);
  const admin = client.admin();
  const producer = client.producer({ idempotent: true, maxInFlightRequests: 1, allowAutoTopicCreation: false });
  const consumer = client.consumer({ groupId: `jurisdictions-${region || role}-${randomUUID()}`, allowAutoTopicCreation: false });
  await admin.connect();
  const offsets = await admin.fetchTopicOffsets(topic);
  await admin.disconnect();
  if (offsets.length !== 3 || offsets.some((item) => BigInt(item.low) !== 0n)) throw new Error('Expected three partitions with complete retained history; dispose the lab if history expired');
  const outstanding = new Map(offsets.filter((item) => BigInt(item.high) > 0n).map((item) => [item.partition, BigInt(item.high)]));
  await producer.connect();
  await consumer.connect();
  consumer.on(consumer.events.GROUP_JOIN, () => { if (outstanding.size === 0) ready = true; });
  consumer.on(consumer.events.CRASH, ({ payload }) => { ready = false; console.error('Projection failed', payload.error); process.exit(1); });
  await consumer.subscribe({ topic, fromBeginning: true });
  await consumer.run({ eachMessage: async ({ partition, message }) => {
    const value = JSON.parse(message.value.toString());
    if (role === 'regional') {
      const validated = command(value);
      const tenant = tenants[validated.tenantId];
      if (validated.region !== region || tenant.partition !== partition || message.key?.toString() !== tenant.id || JSON.stringify(validated) !== JSON.stringify(value)) throw new Error('Invalid regional record placement/schema');
      const previous = operations.get(value.id);
      if (previous && JSON.stringify(previous.event) !== JSON.stringify(value)) throw new Error('Conflicting operation in authoritative log');
      if (!previous || previous.status !== 'completed') {
        operations.set(value.id, { status: 'completed', event: value, partition, offset: message.offset });
        shards[partition].count += 1;
        shards[partition].totalAmount += value.amount;
        if (!Number.isSafeInteger(shards[partition].totalAmount)) throw new Error('Aggregate exceeds safe integer range');
      }
      shards[partition].sourceOffset = message.offset;
    } else {
      const fields = ['region', 'partition', 'sourceOffset', 'count', 'totalAmount'];
      if (Object.keys(value).length !== fields.length || fields.some((field) => !Object.hasOwn(value, field)) || !regions.includes(value.region) || partition !== regions.indexOf(value.region) || !Number.isInteger(value.partition) || value.partition < 0 || value.partition > 2 || !/^\d+$/.test(value.sourceOffset) || !Number.isSafeInteger(value.count) || value.count < 0 || !Number.isSafeInteger(value.totalAmount) || value.totalAmount < 0 || message.key?.toString() !== `${value.region}:${value.partition}`) throw new Error('Invalid summary schema/placement');
      const key = `${value.region}:${value.partition}`;
      const previous = summaries.get(key);
      if (!previous || BigInt(value.sourceOffset) > BigInt(previous.sourceOffset)) summaries.set(key, value);
    }
    if (outstanding.has(partition) && BigInt(message.offset) + 1n >= outstanding.get(partition)) outstanding.delete(partition);
    if (outstanding.size === 0) ready = true;
  } });
  return { producer, consumer };
}

// The raw log is the outbox. Replay rebuilds snapshots; failed exports never block regional consumption.
async function exportSnapshots() {
  const sent = new Map();
  exportProducer = kafka('broker-global:9092', `export-${region}`).producer({ allowAutoTopicCreation: false });
  while (!closing) {
    try {
      await exportProducer.connect();
      if (ready) {
        for (const shard of shards) {
          if (shard.sourceOffset === '-1' || sent.get(shard.partition) === shard.sourceOffset) continue;
          // Construct the export explicitly. Do not spread a regional record across the boundary.
          const value = { region, partition: shard.partition, sourceOffset: shard.sourceOffset, count: shard.count, totalAmount: shard.totalAmount };
          await exportProducer.send({ topic: 'jurisdictions.summaries.v1', acks: -1, messages: [{ key: `${region}:${shard.partition}`, partition: regions.indexOf(region), value: JSON.stringify(value) }] });
          sent.set(shard.partition, value.sourceOffset);
        }
        federation = 'caught-up'; federationError = null;
      }
    } catch (failure) { federation = 'unavailable'; federationError = failure.message; }
    await new Promise((resolve) => { exportTimer = setTimeout(resolve, 1000); });
  }
}

async function brokerAvailable() {
  try {
    const response = await fetch(`http://${process.env.ADMIN_HOST}:9644/v1/cluster/health_overview`, { signal: AbortSignal.timeout(1200) });
    return response.ok && (await response.json()).is_healthy;
  } catch { return false; }
}
async function upstream(service, path, options = {}) {
  try {
    const response = await fetch(`http://${service}:3000${path}`, { ...options, signal: AbortSignal.timeout(options.method ? 12000 : 2200) });
    return { status: response.status, body: await response.json() };
  } catch (failure) {
    return { status: 503, body: { error: `${service} unavailable: ${failure.message}`, outcome: options.method ? 'unknown' : undefined } };
  }
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, 200, { ready, role, region, brokerAvailable: role === 'gateway' ? undefined : await brokerAvailable() });
    if (role === 'gateway') {
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const [regional, global] = await Promise.all([
          Promise.all(regions.map(async (name) => { const result = await upstream(`region-${name}`, '/api/state'); return { region: name, available: result.status === 200, ...result.body }; })),
          upstream('global', '/api/state'),
        ]);
        return sendJson(res, 200, { tenants: Object.values(tenants), regions: regional, global: { available: global.status === 200, ...global.body } });
      }
      if (req.method === 'POST' && url.pathname === '/api/events') {
        assertLocalMutation(req);
        const event = command(await readJson(req));
        const home = await upstream(`region-${event.region}`, '/health');
        if (home.status !== 200 || !home.body.ready || !home.body.brokerAvailable) return sendJson(res, 503, { error: 'Home region unavailable; no command forwarded and no alternate region used', outcome: 'not-attempted', region: event.region });
        const result = await upstream(`region-${event.region}`, '/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(event) });
        return sendJson(res, result.status, result.body);
      }
      const operation = /^\/api\/operations\/(eu|us|apac)\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
      if (req.method === 'GET' && operation) {
        const result = await upstream(`region-${operation[1]}`, `/api/operations/${operation[2]}`);
        return sendJson(res, result.status, result.body);
      }
      if (await serveFile(req, res, new URL('./public/', import.meta.url).pathname)) return;
    } else {
      if (req.method === 'GET' && url.pathname === '/api/state') {
        const available = await brokerAvailable();
        return sendJson(res, 200, role === 'global' ? { ready, brokerAvailable: available, summaries: [...summaries.values()] } : { region, ready, brokerAvailable: available, federation, federationError, shards, records: [...operations.values()].filter((item) => item.status === 'completed').slice(-40) });
      }
      if (role === 'regional') {
        const operation = /^\/api\/operations\/([a-zA-Z0-9_-]+)$/.exec(url.pathname);
        if (req.method === 'GET' && operation) return sendJson(res, operations.has(operation[1]) ? 200 : 404, operations.get(operation[1]) || { status: 'not-observed', region });
        if (req.method === 'POST' && url.pathname === '/api/events') {
          assertLocalMutation(req);
          const event = command(await readJson(req));
          if (event.region !== region) throw error(409, `Wrong regional endpoint; residency is ${event.region}`);
          // Recheck the id after the asynchronous health probe, before reserving it.
          if (!operations.has(event.id) && (!ready || !await brokerAvailable())) return sendJson(res, 503, { error: 'Home-region broker unavailable; no alternate region is used', outcome: 'not-attempted', region });
          const previous = operations.get(event.id);
          if (previous) {
            if (JSON.stringify(previous.event) !== JSON.stringify(event)) throw error(409, 'Operation id already belongs to different input');
            return sendJson(res, previous.status === 'completed' ? 200 : previous.status === 'unknown' ? 503 : 202, previous);
          }
          const partition = tenants[event.tenantId].partition;
          const operation = { status: 'pending', event, partition };
          operations.set(event.id, operation);
          try {
            const [delivery] = await log.producer.send({ topic, acks: -1, messages: [{ key: event.tenantId, partition, value: JSON.stringify(event) }] });
            if (operation.status !== 'completed') operation.offset = delivery.baseOffset;
          } catch (failure) {
            // A failed acknowledgement is not proof of absence. Lookup/reuse the same id.
            if (operations.get(event.id)?.status !== 'completed') operation.status = 'unknown';
            return sendJson(res, 503, { ...operations.get(event.id), error: failure.message, outcome: 'unknown' });
          }
          for (let i = 0; i < 25 && operations.get(event.id).status !== 'completed'; i += 1) await sleep(100);
          const result = operations.get(event.id);
          return sendJson(res, result.status === 'completed' ? 200 : 202, result);
        }
      }
    }
    sendJson(res, 404, { error: 'Not found' });
  } catch (failure) { sendJson(res, failure.status || 500, { error: failure.message }); }
});
server.listen(3000, '0.0.0.0');
if (role !== 'gateway') {
  log = await connectProjection();
  if (role === 'regional') void exportSnapshots();
}
async function close() {
  closing = true; clearTimeout(exportTimer);
  server.close();
  await Promise.allSettled([log?.consumer.disconnect(), log?.producer.disconnect(), exportProducer?.disconnect()]);
  process.exit(0);
}
process.on('SIGTERM', close); process.on('SIGINT', close);
