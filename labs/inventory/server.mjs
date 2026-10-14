import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { topic, fixtureId, limit, initial, validate, decide, applyResult, fail } from './model.mjs';

const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const model = initial(), operations = new Map(), waiters = new Map();
let ready = false, stopping = false, fault = null, uncertain = null, lastOffset = null, duplicates = 0;
let queue = Promise.resolve();
function checkRecord(record, key) {
  if (!record || Object.keys(record).sort().join(',') !== 'at,command,fixtureId,result,schema' || record.schema !== 1 || record.fixtureId !== fixtureId ||
      !Number.isSafeInteger(record.at) || record.at < 0 || !record.command || key !== record.command.id) throw new Error('Invalid inventory event envelope');
  return validate(record.command, true);
}
function apply(record, metadata) {
  if (metadata.partition !== 0 || !/^\d+$/.test(metadata.offset) || BigInt(metadata.offset) !== (lastOffset === null ? 0n : BigInt(lastOffset) + 1n)) throw new Error('Inventory log must be a complete ordered prefix');
  const command = checkRecord(record, metadata.key);
  if (lastOffset === null && command.kind !== 'initialize') throw new Error('Inventory history must begin with its catalog');
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.record, record)) throw new Error('Conflicting duplicate inventory event');
    duplicates += 1;
  } else {
    applyResult(model, command, record.result);
    const operation = { id: command.id, command, offset: metadata.offset, at: record.at, result: record.result, record };
    operations.set(command.id, operation);
    waiters.get(command.id)?.(operation);
  }
  lastOffset = metadata.offset;
  if (uncertain === command.id) { uncertain = null; fault = null; ready = true; }
}
const log = await connectLog({ topic, group: 'inventory-owner', onEvent: apply });
await log.ready;
ready = true;
async function publish(command) {
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'Command id belongs to different input.');
    return prior;
  }
  // Shutdown drains commands already admitted; only a log fault blocks that drain.
  if (!ready) throw fail(503, fault || 'The event log is not ready.', { commandId: command.id, outcomeUnknown: uncertain === command.id });
  const record = { schema: 1, fixtureId, at: Date.now(), command, result: decide(model, command) };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (operations.has(command.id)) return operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Consumer acknowledgment timed out')), 30000);
    })]);
  } catch (error) {
    if (operations.has(command.id)) return operations.get(command.id);
    ready = false; uncertain = command.id;
    fault = `Outcome unknown for ${command.id}. Look up this exact id. Do not use a replacement or retry an absent receipt while the old writer can still publish.`;
    console.error(fault, error);
    throw fail(503, fault, { commandId: command.id, outcomeUnknown: true });
  } finally { clearTimeout(deadline); waiters.delete(command.id); }
}
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
if (!operations.has(fixtureId)) await serialize(() => publish({ id: fixtureId, kind: 'initialize' }));
function snapshot() {
  return { ready: ready && !stopping, fault, uncertainCommandId: uncertain, topic, fixtureId, limit, lastOffset, duplicates,
    catalog: model.catalog, stock: [...model.stock.values()], reservations: [...model.reservations.values()], totals: [...model.totals.values()],
    commands: [...operations.values()].map(({ id, command, offset, result }) => ({ id, kind: command.kind, offset, accepted: result.accepted, reason: result.reason })) };
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, ready && !stopping ? 200 : 503, { ready: ready && !stopping, fault }); return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { sendJson(res, 200, snapshot()); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/commands/')) {
      const operation = operations.get(url.pathname.slice('/api/commands/'.length));
      if (!operation) throw fail(404, 'No consumed receipt. Absence does not prove an in-flight append failed.', { outcomeUnknown: true });
      sendJson(res, 200, operation); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/commands') {
      assertLocalMutation(req);
      if (stopping) throw fail(503, 'The writer is shutting down.');
      const command = validate(await readJson(req));
      if (stopping) throw fail(503, 'The writer is shutting down.');
      const operation = await serialize(() => publish(command));
      sendJson(res, operation.result.accepted ? 200 : 409, operation); return;
    }
    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      res.end(`inventory_commands_total ${operations.size}\ninventory_duplicates_total ${duplicates}\n` + [...model.totals.values()].map(total =>
        `inventory_on_hand_units{product="${total.productId}"} ${total.onHand}\ninventory_reserved_units{product="${total.productId}"} ${total.reserved}\ninventory_available_units{product="${total.productId}"} ${total.available}\n`).join('')); return;
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
  stopping = true; server.close();
  await queue; await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
