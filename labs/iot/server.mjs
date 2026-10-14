import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';

const topic = 'iot.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const fixtures = [
  { id: 'freezer-1', label: 'Freezer', minC: -25, maxC: -15, normalC: -20 },
  { id: 'cooler-1', label: 'Cooler', minC: 2, maxC: 8, normalC: 4 },
  { id: 'dock-1', label: 'Loading dock', minC: 0, maxC: 15, normalC: 10 },
];
const devices = new Map(fixtures.map(fixture => [fixture.id, {
  ...fixture, lowBatteryBelow: 20, last: null, history: [], activeAlerts: { temperature: null, battery: null },
}]));
const operations = new Map();
const alerts = new Map();
const waiters = new Map();
let ready = false;
let stopping = false;
let lastOffset = null;
let duplicates = 0;
let unknown = null;
let queue = Promise.resolve();
const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, ...details });

function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw fail(400, 'Expected a telemetry object.');
  if (typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id)) throw fail(400, 'id must use 1–80 letters, digits, underscores or hyphens.');
  if (typeof value.deviceId !== 'string' || !devices.has(value.deviceId)) throw fail(404, 'Unknown fixture device.');
  if (!Number.isSafeInteger(value.sequence) || value.sequence < 1) throw fail(400, 'sequence must be a positive safe integer.');
  if (typeof value.temperatureC !== 'number' || !Number.isFinite(value.temperatureC) || value.temperatureC < -100 || value.temperatureC > 100) throw fail(400, 'temperatureC must be finite, between -100 and 100.');
  if (typeof value.batteryPercent !== 'number' || !Number.isFinite(value.batteryPercent) || value.batteryPercent < 0 || value.batteryPercent > 100) throw fail(400, 'batteryPercent must be finite, between 0 and 100.');
  return { id: value.id, deviceId: value.deviceId, sequence: value.sequence, temperatureC: value.temperatureC, batteryPercent: value.batteryPercent };
}

function apply(record, metadata) {
  const command = validate(record);
  if (record.schema !== 1 || !Number.isSafeInteger(record.at) || record.at < 0 || metadata.key !== command.id) throw new Error('Invalid telemetry ledger record');
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw new Error('Conflicting telemetry ledger id');
    duplicates += 1;
    lastOffset = metadata.offset;
    return;
  }
  const device = devices.get(command.deviceId);
  const accepted = !device.last || command.sequence > device.last.sequence;
  const changes = [];
  if (accepted) {
    const reading = { ...command, at: record.at, offset: metadata.offset };
    device.last = reading;
    device.history.push(reading);
    const conditions = {
      temperature: command.temperatureC < device.minC || command.temperatureC > device.maxC,
      battery: command.batteryPercent < device.lowBatteryBelow,
    };
    for (const [type, active] of Object.entries(conditions)) {
      const existing = device.activeAlerts[type];
      if (active && !existing) {
        const id = `${command.id}:${type}`;
        alerts.set(id, { id, deviceId: device.id, type, openedBy: command.id, openedAt: record.at,
          openedOffset: metadata.offset, closedBy: null, closedAt: null, closedOffset: null });
        device.activeAlerts[type] = id;
        changes.push({ type, action: 'opened', alertId: id });
      } else if (!active && existing) {
        Object.assign(alerts.get(existing), { closedBy: command.id, closedAt: record.at, closedOffset: metadata.offset });
        device.activeAlerts[type] = null;
        changes.push({ type, action: 'closed', alertId: existing });
      }
    }
  }
  const operation = { command, record, offset: metadata.offset, accepted,
    reason: accepted ? null : 'Sequence must be greater than the last accepted sequence.',
    lastSequence: device.last.sequence, alerts: changes };
  operations.set(command.id, operation);
  lastOffset = metadata.offset;
  waiters.get(command.id)?.(operation);
}

function snapshot() {
  return { ready, topic, lastOffset, duplicates, unknown,
    devices: [...devices.values()], alerts: [...alerts.values()], operations: [...operations.values()] };
}

const log = await connectLog({ topic, group: 'iot-gateway-owner', onEvent: apply });
await log.ready;
ready = true;

async function publish(command) {
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'This id belongs to different telemetry.', { commandId: command.id });
    return prior;
  }
  if (!ready || stopping) throw fail(503, 'Gateway is not accepting new readings. Inspect state and recover the unresolved id first.',
    { outcomeUnknown: unknown?.id === command.id, commandId: command.id });
  const record = { schema: 1, ...command, at: Date.now() };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (operations.has(command.id)) return operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Consumer completion timed out')), 30000);
    })]);
  } catch (error) {
    // A consumed receipt is stronger evidence than a missing producer ACK.
    if (operations.has(command.id)) return operations.get(command.id);
    ready = false;
    unknown = { id: command.id, command,
      message: 'Completion unknown. Keep this exact id and payload; inspect its receipt. Restart to replay before retrying the same command. Do not send a replacement.' };
    console.error('Telemetry completion unknown:', command.id, error);
    throw fail(503, unknown.message, { commandId: command.id, outcomeUnknown: true });
  } finally {
    clearTimeout(deadline);
    waiters.delete(command.id);
  }
}

function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}

const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, ready && !stopping ? 200 : 503, { ready: ready && !stopping }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, snapshot()); return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/readings/')) {
      const id = url.pathname.slice('/api/readings/'.length);
      const operation = operations.get(id);
      if (operation) { sendJson(res, 200, operation); return; }
      if (unknown?.id === id) { sendJson(res, 503, { ...unknown, outcomeUnknown: true }); return; }
      throw fail(404, 'No consumed receipt for this id. Absence alone does not prove an in-flight write failed.');
    }
    if (req.method === 'POST' && url.pathname === '/api/readings') {
      assertLocalMutation(req);
      const command = validate(await readJson(req));
      const operation = await serialize(() => publish(command));
      sendJson(res, operation.accepted ? 200 : 409, operation); return;
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, {
      error: error.status ? error.message : 'Unexpected gateway error. Inspect app logs.',
      outcomeUnknown: error.outcomeUnknown === true, commandId: error.commandId ?? null,
    });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
async function shutdown() {
  if (stopping) return;
  stopping = true;
  ready = false;
  server.close();
  await queue;
  await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
