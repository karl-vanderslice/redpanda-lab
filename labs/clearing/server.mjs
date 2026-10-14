import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { policy, fixtures, fail, identifier, command, same, emptyState, initialize, evaluate, consume, view } from './model.mjs';

const topic = 'clearing.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const state = emptyState(), waiters = new Map();
let ready = false, stopping = false, fault = null, lastOffset = null, duplicates = 0, fixtureRecord = null;
let queue = Promise.resolve();
function apply(record, metadata) {
  if (metadata.partition !== 0) throw new Error('Clearing requires one ordered partition.');
  if (record.kind === 'fixtures') {
    if (metadata.key !== 'fixture-v1') throw new Error('Invalid fixture key.');
    if (fixtureRecord) {
      if (!same(fixtureRecord, record)) throw new Error('Conflicting fixture identity.');
      duplicates += 1;
    } else { initialize(state, record); fixtureRecord = record; }
  } else if (!consume(state, record, metadata)) duplicates += 1;
  lastOffset = metadata.offset;
  waiters.get(metadata.key)?.();
}
const log = await connectLog({ topic, group: 'clearing-local-owner', onEvent: apply });
await log.ready;
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
function assertAdmitted() {
  if (!ready || stopping || fault) throw fail(503, fault || 'Clearing ledger is not ready.');
}
async function publish(id, record) {
  if (fault) throw fail(503, fault, { outcomeUnknown: true, operationId: id });
  let deadline;
  const consumed = new Promise(resolve => waiters.set(id, resolve));
  const exists = () => id === 'fixture-v1' ? fixtureRecord !== null : state.operations.has(id);
  try {
    await log.append(id, record);
    if (!exists()) await Promise.race([consumed, new Promise((_, reject) => { deadline = setTimeout(() => reject(new Error('Projection completion unknown')), 30000); })]);
  } catch {
    if (exists()) return;
    ready = false;
    fault = `Append completion unknown for ${id}. Preserve this command and ID, inspect its receipt, and restart the app to replay before resuming. Do not replace the ID.`;
    throw fail(503, fault, { outcomeUnknown: true, operationId: id });
  } finally { clearTimeout(deadline); waiters.delete(id); }
}
if (!state.initialized) await publish('fixture-v1', { schema: 1, kind: 'fixtures', id: 'fixture-v1', policy, accounts: fixtures });
ready = true;
async function submit(cmd) {
  // Admission happens before enqueueing. Shutdown drains admitted commands;
  // an unknown append fences even commands already waiting in this owner queue.
  if (fault) throw fail(503, fault, { outcomeUnknown: true, operationId: cmd.id });
  const prior = state.operations.get(cmd.id);
  if (prior) {
    if (!same(prior.command, cmd)) throw fail(409, 'ID already belongs to a different immutable command.');
    return prior;
  }
  const outcome = evaluate(state, cmd);
  await publish(cmd.id, { schema: 1, kind: 'execution', command: cmd, outcome });
  return state.operations.get(cmd.id);
}
function snapshot() { return { ready, fault, topic, lastOffset, duplicates, ...view(state) }; }
const server = createServer(async (req, res) => {
  try {
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return sendJson(res, ready && !stopping && !fault ? 200 : 503, { ready: ready && !stopping && !fault });
    if (req.method === 'GET' && path === '/api/state') return sendJson(res, 200, snapshot());
    if (req.method === 'GET' && path.startsWith('/api/operations/')) {
      const id = identifier(path.slice('/api/operations/'.length));
      const operation = state.operations.get(id);
      if (!operation) throw fail(404, 'No consumed receipt for this ID. Absence does not prove an in-flight append failed.');
      return sendJson(res, 200, { operation });
    }
    if (req.method === 'POST') {
      assertLocalMutation(req);
      const kind = ({ '/api/transfers': 'transfer', '/api/reviews': 'review', '/api/clearings': 'clear' })[path];
      if (kind) {
        const cmd = command(kind, await readJson(req));
        assertAdmitted();
        const operation = await serialize(() => submit(cmd));
        return sendJson(res, operation.outcome.httpStatus, { operation, outcomeUnknown: false });
      }
    }
    if (req.method === 'GET' && path === '/metrics') {
      const { totals } = view(state);
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end(`clearing_balance_cents ${totals.balanceCents}\nclearing_reserved_cents ${totals.reservedCents}\nclearing_entry_net_cents ${totals.entryNetCents}\nclearing_cleared_total ${totals.clearedCount}\nclearing_duplicates_total ${duplicates}\n`);
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected clearing server error.', outcomeUnknown: error.outcomeUnknown === true, operationId: error.operationId ?? null });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
async function shutdown() {
  if (stopping) return;
  stopping = true; ready = false; server.close();
  await queue; await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(() => { process.exitCode = 1; }); });
process.on('SIGINT', () => { void shutdown().catch(() => { process.exitCode = 1; }); });
