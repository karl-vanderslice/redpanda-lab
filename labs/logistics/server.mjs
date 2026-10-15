import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalRequest, assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { initial, validate, decide, applyResult, fixtureId, fail } from './engine.mjs';

const topic = 'logistics.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const model = initial();
const operations = new Map();
const waiters = new Map();
let ready = false, fault = null, uncertain = null, lastOffset = null, duplicates = 0, stopping = false;
let queue = Promise.resolve();
function apply(record, metadata) {
  if (record.schema !== 1 || record.fixtureId !== fixtureId || metadata.partition !== 0 ||
      !Number.isSafeInteger(record.at) || record.at < 0 || !record.command || metadata.key !== record.command.id) throw new Error('Invalid logistics event envelope');
  const command = validate(record.command, true);
  if (!isDeepStrictEqual(command, record.command)) throw new Error('Invalid logistics command');
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.record, record)) throw new Error('Conflicting duplicate logistics event');
    duplicates += 1; lastOffset = metadata.offset; return;
  }
  applyResult(model, command, record.result, metadata.offset);
  const operation = { id: command.id, command, offset: metadata.offset, at: record.at, result: record.result, record };
  operations.set(command.id, operation);
  lastOffset = metadata.offset;
  waiters.get(command.id)?.(operation);
  if (uncertain === command.id) { uncertain = null; fault = null; ready = !stopping; }
}
const log = await connectLog({ topic, group: 'logistics-owner', onEvent: apply });
await log.ready;
ready = true;
async function publish(command) {
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'Mutation id already belongs to a different command.');
    return prior;
  }
  if (!ready || stopping) throw fail(503, fault || 'The event log is not ready.', { commandId: command.id, outcomeUnknown: uncertain === command.id });
  const record = { schema: 1, fixtureId, command, at: Date.now(), result: decide(model, command) };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (operations.has(command.id)) return operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Projection acknowledgment timed out')), 30000);
    })]);
  } catch (error) {
    if (operations.has(command.id)) return operations.get(command.id);
    ready = false; uncertain = command.id;
    fault = `Outcome unknown for ${command.id}. Look up this id; do not submit a replacement or retry an absent receipt while the old writer can still publish.`;
    console.error(fault, error);
    throw fail(503, fault, { outcomeUnknown: true, commandId: command.id });
  } finally { clearTimeout(deadline); waiters.delete(command.id); }
}
function serialize(action) {
  // Single writer: hold the queue through consumer completion, not producer ACK.
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
if (!operations.has(fixtureId)) await serialize(() => publish({ id: fixtureId, kind: 'fleet' }));
function snapshot() {
  const drivers = [...model.drivers.values()];
  return { ready, fault, uncertainCommandId: uncertain, topic, fixtureId, lastOffset, duplicates,
    drivers, trips: [...model.trips.values()],
    available: drivers.filter(driver => driver.tripId === null).length,
    commands: [...operations.values()].map(({ id, command, offset, result }) => ({ id, kind: command.kind, offset, accepted: result.accepted, reason: result.reason })) };
}
const server = createServer(async (req, res) => {
  try {
    assertLocalRequest(req);
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, ready ? 200 : 503, { ready, fault }); return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { sendJson(res, 200, snapshot()); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/commands/')) {
      const operation = operations.get(url.pathname.slice('/api/commands/'.length));
      if (!operation) throw fail(404, 'No consumed command with that id. Absence does not prove an in-flight publish failed.', { outcomeUnknown: true });
      sendJson(res, 200, operation); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/commands') {
      assertLocalMutation(req);
      const command = validate(await readJson(req));
      const operation = await serialize(() => publish(command));
      sendJson(res, operation.result.accepted ? 200 : 409, operation); return;
    }
    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(`logistics_drivers_available ${snapshot().available}\nlogistics_trips_total ${model.trips.size}\nlogistics_commands_total ${operations.size}\nlogistics_duplicates_total ${duplicates}\n`); return;
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected server error. Inspect app logs.', outcomeUnknown: error.outcomeUnknown === true, commandId: error.commandId ?? null });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
async function shutdown() {
  if (stopping) return;
  stopping = true; ready = false; server.close();
  await queue; await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
