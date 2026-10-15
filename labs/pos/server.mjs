import { createServer } from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectLog } from '../common/log.mjs';
import { assertLocalRequest, assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { catalog, sources, fail, identifier, checkout, refund, empty, requestDetails, same, totals } from './model.mjs';
import { configuration, requireProvider, providerScope, invoke } from './providers.mjs';

const topic = 'pos.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const operations = new Map(), events = new Map(), waiters = new Map();
let ready = false, stopping = false, fault = null, lastOffset = null, duplicates = 0;
let queue = Promise.resolve();
const uuid = value => typeof value === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value);
function check(condition) { if (!condition) throw new Error('Invalid or conflicting POS ledger record'); }
function publicOperation(operation) {
  return { id: operation.command.id, kind: operation.command.kind, command: operation.command, ...operation.details,
    status: operation.status, reason: operation.reason, providerId: operation.providerId, providerKey: operation.providerKey,
    requestedAt: operation.requestedAt, firstAttemptAt: operation.firstAttemptAt, attempts: operation.attempts,
    offset: operation.offset, lastOffset: operation.lastOffset, httpStatus: operation.httpStatus };
}
function snapshot() {
  return { ready, fault, topic, lastOffset, duplicates, catalog, sources, providers: configuration(), totals: totals(operations),
    operations: [...operations.values()].map(publicOperation) };
}
function apply(record, metadata) {
  check(record.schema === 1 && uuid(record.eventId) && Number.isSafeInteger(record.at) && record.at >= 0 && metadata.key === record.operationId);
  identifier(record.operationId);
  const duplicate = events.get(record.eventId);
  if (duplicate) {
    check(same(duplicate, record)); duplicates += 1; lastOffset = metadata.offset;
    waiters.get(record.eventId)?.(); return;
  }
  if (record.kind === 'requested') {
    // Commands in events include kind; HTTP validators deliberately reject extra fields.
    const { kind, ...body } = record.command || {};
    const canonical = kind === 'checkout' ? checkout(body) : kind === 'refund' ? refund(body) : null;
    check(canonical && same(canonical, record.command) && canonical.id === record.operationId && !operations.has(canonical.id));
    const details = requestDetails(canonical, operations);
    check(same(details, record.details));
    const cash = details.tender === 'cash';
    check(cash ? record.scope === null && record.providerKey === null : uuid(record.providerKey) && (canonical.kind === 'checkout' ? record.scope === null : typeof record.scope === 'string' && (details.tender === 'stripe' ? /^acct_[A-Za-z0-9]+$/.test(record.scope) : /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(record.scope))));
    check(canonical.kind !== 'refund' || cash || record.scope === details.scope);
    operations.set(canonical.id, { command: canonical, details, scope: record.scope, providerKey: record.providerKey,
      status: 'pending', reason: 'requested', providerId: null, requestedAt: record.at, firstAttemptAt: null, attempts: 0,
      offset: metadata.offset, lastOffset: metadata.offset, httpStatus: 202, records: [record] });
  } else {
    const operation = operations.get(record.operationId);
    check(operation && !['completed', 'declined'].includes(operation.status));
    if (record.kind === 'bound') {
      check(operation.command.kind === 'checkout' && operation.details.tender !== 'cash' && operation.scope === null
        && typeof record.scope === 'string' && (operation.details.tender === 'stripe' ? /^acct_[A-Za-z0-9]+$/.test(record.scope) : /^[A-Za-z0-9_-]+:[A-Za-z0-9_-]+$/.test(record.scope)));
      operation.scope = record.scope;
    } else if (record.kind === 'attempt') {
      check(operation.details.tender !== 'cash' && operation.scope !== null && record.at >= operation.requestedAt);
      if (operation.firstAttemptAt === null) operation.firstAttemptAt = record.at;
      operation.attempts += 1; operation.status = 'unknown'; operation.reason = 'attempt-not-reconciled'; operation.httpStatus = 502;
    } else if (record.kind === 'observed') {
      const outcome = record.outcome;
      check(outcome && ['completed', 'declined', 'pending', 'unknown'].includes(outcome.status) && typeof outcome.reason === 'string'
        && /^[a-z-]{1,80}$/.test(outcome.reason) && [200, 202, 422, 502].includes(outcome.httpStatus)
        && Number.isInteger(outcome.providerHttpStatus) && outcome.providerHttpStatus >= 0 && outcome.providerHttpStatus <= 599
        && (outcome.providerId === null || (typeof outcome.providerId === 'string' && /^[A-Za-z0-9_-]{1,192}$/.test(outcome.providerId)))
        && (operation.providerId === null || outcome.providerId === operation.providerId));
      check(outcome.httpStatus === ({ completed: 200, declined: 422, pending: 202, unknown: 502 })[outcome.status]);
      if (operation.details.tender === 'cash') check(same(outcome, { status: 'completed', reason: 'cash-ledger-completed', providerId: null, httpStatus: 200, providerHttpStatus: 0 }));
      else check(operation.firstAttemptAt !== null && (outcome.status !== 'completed' || outcome.providerId !== null));
      operation.status = outcome.status; operation.reason = outcome.reason; operation.providerId = outcome.providerId; operation.httpStatus = outcome.httpStatus;
    } else check(false);
    operation.lastOffset = metadata.offset; operation.records.push(record);
  }
  events.set(record.eventId, record); lastOffset = metadata.offset;
  waiters.get(record.eventId)?.();
}
const log = await connectLog({ topic, group: 'pos-effect-owner', onEvent: apply });
await log.ready;
ready = true;
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
function assertReady() { if (!ready || stopping) throw fail(503, fault || 'POS ledger is not ready.'); }
// Shutdown refuses new work but lets the admitted owner record its outcome.
function assertLedgerHealthy(operationId) {
  if (fault) throw fail(503, fault, { outcomeUnknown: true, operationId });
}
async function publish(kind, operationId, value = {}) {
  assertLedgerHealthy(operationId);
  const record = { schema: 1, eventId: randomUUID(), operationId, kind, at: Date.now(), ...value };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(record.eventId, resolve));
  try {
    await log.append(operationId, record);
    if (!events.has(record.eventId)) await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Projection completion unknown')), 30000);
    })]);
  } catch {
    if (events.has(record.eventId)) return;
    ready = false;
    fault = `Ledger completion unknown for ${operationId}. Inspect this ID, then restart the app to replay before resuming. Never use a replacement ID.`;
    throw fail(503, fault, { outcomeUnknown: true, operationId });
  } finally { clearTimeout(deadline); waiters.delete(record.eventId); }
}
async function execute(operation) {
  assertLedgerHealthy(operation.command.id);
  if (['completed', 'declined'].includes(operation.status)) return operation;
  const id = operation.command.id;
  if (operation.details.tender === 'cash') {
    await publish('observed', id, { outcome: { status: 'completed', reason: 'cash-ledger-completed', providerId: null, httpStatus: 200, providerHttpStatus: 0 } });
    return operations.get(id);
  }
  let scope;
  try { scope = await providerScope(operation.details.tender); }
  catch (error) { throw Object.assign(error, { outcomeUnknown: operation.firstAttemptAt !== null, operationId: id }); }
  if (operation.scope === null) await publish('bound', id, { scope });
  if (scope !== operation.scope) throw fail(409, 'Sandbox account/location changed. Restore the original configuration to resume this ID.', { outcomeUnknown: true, operationId: id });
  // Validate the exact timestamp appended, after account lookup and binding.
  const at = Date.now();
  if (at < Math.max(operation.requestedAt, operation.firstAttemptAt ?? 0)) throw fail(409, 'Wall clock moved backwards. Fix the clock and resume this ID.', { outcomeUnknown: operation.firstAttemptAt !== null, operationId: id });
  // Known objects use GET only; creates cannot outlive provider key retention.
  if (!operation.providerId && operation.firstAttemptAt !== null && at - operation.firstAttemptAt >= 23 * 60 * 60 * 1000) throw fail(409, 'Safe retry window expired. Do not create a replacement operation. Reconcile the sandbox dashboard manually.', { outcomeUnknown: true, operationId: id });
  await publish('attempt', id, { at });
  const outcome = await invoke(operations.get(id));
  // An uncertain HTTP request is never rolled back. The observed state is itself
  // durable before the next mutation can inspect the receipt or reserve a refund.
  await publish('observed', id, { outcome });
  return operations.get(id);
}
async function submit(command) {
  assertReady();
  const prior = operations.get(command.id);
  if (prior) {
    if (!same(prior.command, command)) throw fail(409, 'This ID already belongs to a different operation.');
    return prior; // Duplicate POST is a lookup, not authorization to repeat effects.
  }
  const details = requestDetails(command, operations);
  let scope = null, providerKey = null;
  if (details.tender !== 'cash') {
    requireProvider(details.tender);
    if (command.kind === 'refund') scope = details.scope;
    providerKey = randomUUID();
  }
  await publish('requested', command.id, { command, details, scope, providerKey });
  return execute(operations.get(command.id));
}
function respondOperation(res, operation) {
  sendJson(res, operation.httpStatus, { operation: publicOperation(operation), outcomeUnknown: operation.status === 'unknown' });
}
const server = createServer(async (req, res) => {
  try {
    assertLocalRequest(req);
    const path = new URL(req.url, 'http://localhost').pathname;
    if (req.method === 'GET' && path === '/health') return sendJson(res, ready ? 200 : 503, { ready });
    if (req.method === 'GET' && path === '/api/state') return sendJson(res, 200, snapshot());
    if (req.method === 'GET' && path.startsWith('/api/operations/')) {
      const operation = operations.get(identifier(path.slice('/api/operations/'.length)));
      if (!operation) throw fail(404, 'No consumed operation with this ID. Absence does not prove an in-flight append failed.');
      return sendJson(res, 200, { operation: publicOperation(operation), records: operation.records });
    }
    if (req.method === 'POST') {
      assertLocalMutation(req);
      const body = await readJson(req);
      if (path === '/api/checkouts' || path === '/api/refunds') {
        const command = path === '/api/checkouts' ? checkout(body) : refund(body);
        return respondOperation(res, await serialize(() => submit(command)));
      }
      const match = /^\/api\/operations\/([a-zA-Z0-9_-]{1,80})\/resume$/.exec(path);
      if (match) {
        empty(body);
        return respondOperation(res, await serialize(() => {
          assertReady();
          const operation = operations.get(match[1]);
          if (!operation) throw fail(404, 'Operation not found.');
          return execute(operation);
        }));
      }
    }
    if (req.method === 'GET' && path === '/metrics') {
      const total = totals(operations);
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' });
      return res.end(`pos_sales_total ${total.salesCount}\npos_refunds_total ${total.refundsCount}\npos_net_cents ${total.netCents}\npos_cash_balance_cents ${total.cashBalanceCents}\npos_unsettled_operations ${total.unsettledCount}\npos_duplicates_total ${duplicates}\n`);
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    // Provider response bodies and secrets are intentionally never logged.
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected POS server error.',
      outcomeUnknown: error.outcomeUnknown === true, operationId: error.operationId ?? null });
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
