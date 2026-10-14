import { createServer } from 'node:http';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { initial, validate, decide, applyResult, fail } from './model.mjs';

const topic = 'event-log.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
let model = initial();
const operations = new Map(), waiters = new Map();
let ledger = [], log = null, ready = false, rebuilding = false, stopping = false;
let fault = null, uncertain = null, lastOffset = null, duplicates = 0, lastRebuild = null;
let queue = Promise.resolve();
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
function projection() {
  return { items: [...model.items.values()], commands: [...operations.values()], ledger, lastOffset, duplicates };
}
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
function status() {
  return { ready: ready && !stopping, rebuilding, stopping, fault, uncertainCommandId: uncertain, topic };
}
function snapshot() { return { ...status(), projection: projection(), lastRebuild }; }
function consume(record, metadata) {
  if (!record || record.schema !== 1 || !Number.isSafeInteger(record.at) || record.at < 0 ||
      metadata.partition !== 0 || metadata.key !== record.command?.id ||
      Object.keys(record).sort().join(',') !== 'at,command,result,schema') throw new Error('Invalid event ledger envelope');
  const command = validate(record.command);
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.record, record)) throw new Error('Conflicting duplicate event ledger record');
    duplicates += 1;
  } else {
    applyResult(model, command, record.result);
    const receipt = { id: command.id, command, at: record.at, offset: metadata.offset, result: record.result, record };
    operations.set(command.id, receipt);
    waiters.get(command.id)?.(receipt);
  }
  ledger.push({ offset: metadata.offset, commandId: command.id, duplicate: Boolean(prior) });
  lastOffset = metadata.offset;
  if (uncertain === command.id) {
    uncertain = null; fault = null; ready = !rebuilding;
  }
}
async function openOwner() {
  log = await connectLog({ topic, group: 'event-log-owner', onEvent: consume });
  await log.ready;
}
async function publish(command) {
  const prior = operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'Command id already belongs to different input.', { commandId: command.id });
    return prior;
  }
  if (!ready) throw fail(503, fault || 'Log owner is not ready. Check status and the exact command id.', { commandId: command.id, outcomeUnknown: uncertain === command.id });
  const at = Date.now();
  if (!Number.isSafeInteger(at) || at < 0) throw fail(503, 'System clock cannot supply a valid audit timestamp.');
  const record = { schema: 1, at, command, result: decide(model, command) };
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
    fault = `Outcome unknown for ${command.id}. Look up that id. Do not replace it or retry an absent receipt while the old writer can still publish. Rebuild closes that owner before recovery.`;
    console.error(fault, error);
    throw fail(503, fault, { outcomeUnknown: true, commandId: command.id });
  } finally { clearTimeout(deadline); waiters.delete(command.id); }
}
async function rebuild() {
  ready = false; rebuilding = true; fault = null;
  const before = structuredClone(projection());
  try {
    // The old producer and consumer must be closed before dropping any state.
    if (log) { await log.close(); log = null; }
    model = initial(); operations.clear(); waiters.clear(); ledger = [];
    lastOffset = null; duplicates = 0; uncertain = null;
    await openOwner();
    const after = projection();
    lastRebuild = { beforeDigest: digest(before), afterDigest: digest(after),
      equal: isDeepStrictEqual(before, after), records: ledger.length, commands: operations.size, lastOffset };
    rebuilding = false; ready = true;
    return { ...status(), replay: lastRebuild };
  } catch (error) {
    rebuilding = false; ready = false;
    fault = 'Rebuild failed. Inspect app logs and restore the full unmodified log prefix before restarting.';
    console.error(fault, error);
    throw fail(503, fault);
  }
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, ready && !stopping ? 200 : 503, status()); return; }
    if (req.method === 'GET' && url.pathname === '/api/status') { sendJson(res, 200, status()); return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { sendJson(res, 200, snapshot()); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/commands/')) {
      const id = decodeURIComponent(url.pathname.slice('/api/commands/'.length));
      const receipt = operations.get(id);
      if (!receipt) throw fail(404, 'No consumed receipt for that id. Absence does not prove a publish failed, especially during replay.', { commandId: id, outcomeUnknown: true });
      sendJson(res, 200, receipt); return;
    }
    if (req.method === 'POST' && ['/api/commands', '/api/rebuild'].includes(url.pathname)) {
      assertLocalMutation(req);
      const body = await readJson(req);
      if (stopping) throw fail(503, 'Owner is stopping. Look up any previously submitted id after restart.');
      if (url.pathname === '/api/rebuild') {
        if (Object.keys(body).length) throw fail(400, 'Rebuild accepts an empty JSON object.');
        sendJson(res, 200, await serialize(rebuild)); return;
      }
      const command = validate(body);
      const receipt = await serialize(() => publish(command));
      sendJson(res, receipt.result.accepted ? 200 : 409, receipt); return;
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
queue = openOwner().then(() => { ready = true; }).catch(error => {
  fault = 'Startup replay failed. Inspect app logs; the topic must retain its complete valid prefix.';
  console.error(fault, error);
});
async function shutdown() {
  if (stopping) return;
  stopping = true; server.close();
  // Already admitted commands retain readiness while their queued work drains.
  await queue; ready = false;
  if (log) await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
