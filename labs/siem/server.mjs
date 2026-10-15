import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalRequest, assertLocalMutation, decodePath, readJson, sendJson, serveFile } from '../common/http.mjs';
import { createModel, normalize, validateCommand, fail } from './model.mjs';

const topic = 'siem.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const model = createModel();
const waiters = new Map();
let ready = false;
let stopping = false;
let unknown = null;
let queue = Promise.resolve();
const log = await connectLog({ topic, group: 'siem-correlation-owner', onEvent(record, metadata) {
  const receipt = model.apply(record, metadata);
  waiters.get(receipt.command.id)?.(receipt);
} });
await log.ready;
ready = true;
const snapshot = () => ({ ready: ready && !stopping, topic, unknown, ...model.snapshot() });
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
function admissible() {
  if (stopping) throw fail(503, 'Owner is stopping. No new commands admitted.');
}
async function publish(command) {
  const prior = model.operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'ID belongs to a different command.', { commandId: command.id });
    return prior;
  }
  if (!ready) throw fail(503, 'Owner is not accepting writes. Recover the exact unresolved ID before retrying.', { commandId: command.id, outcomeUnknown: unknown?.id === command.id });
  // Wall time is only a pre-publication guard. Recorded event-time decisions replay without it.
  if (command.type === 'ingest' && command.eventTime > Date.now() + 300000) throw fail(400, 'eventTime is more than five minutes ahead of the owner clock.', { commandId: command.id });
  const record = { schema: 1, command, outcome: model.plan(command) };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (model.operations.has(command.id)) return model.operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Consumer completion timed out')), 30000);
    })]);
  } catch (error) {
    if (model.operations.has(command.id)) return model.operations.get(command.id);
    ready = false;
    unknown = { id: command.id, command, message: 'Completion unknown. Keep this exact ID and payload. Look up its receipt; restart the owner for full replay before retrying. Never replace the ID.' };
    console.error('SIEM append completion unknown', command.id, error);
    throw fail(503, unknown.message, { commandId: command.id, outcomeUnknown: true });
  } finally {
    clearTimeout(deadline);
    waiters.delete(command.id);
  }
}
function fixture(input) {
  if (!input || Object.keys(input).some(key => !['id', 'eventTime', 'sensor'].includes(key)) || typeof input.id !== 'string' || !/^[a-zA-Z0-9_-]{1,40}$/.test(input.id) || !Number.isSafeInteger(input.eventTime) || input.eventTime % 60000 !== 0) throw fail(400, 'Fixture requires id (1–40 identifier characters), sensor and minute-aligned eventTime.');
  const common = { sensor: input.sensor, srcIp: '192.0.2.17', dstIp: '198.51.100.24' };
  return [
    ...[0, 1, 2].map(index => ({ ...common, id: `${input.id}-fail-${index + 1}`, eventTime: input.eventTime + index * 1000, kind: 'auth.failure', actor: 'mira-synthetic' })),
    { ...common, id: `${input.id}-success`, eventTime: input.eventTime + 3000, kind: 'auth.success', actor: 'mira-synthetic' },
    ...[22, 80, 443, 8080].map((dstPort, index) => ({ ...common, id: `${input.id}-port-${dstPort}`, eventTime: input.eventTime + 4000 + index * 1000, kind: 'flow', dstPort, protocol: 'tcp' })),
  ].map(normalize);
}
const server = createServer(async (req, res) => {
  try {
    assertLocalRequest(req);
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, ready && !stopping ? 200 : 503, { ready: ready && !stopping });
    if (req.method === 'GET' && url.pathname === '/api/state') return sendJson(res, 200, snapshot());
    if (req.method === 'GET' && /^\/api\/(receipts|events)\//.test(url.pathname)) {
      const eventRoute = url.pathname.startsWith('/api/events/');
      const id = decodePath(url.pathname.split('/').at(-1));
      const receipt = model.operations.get(id);
      if (receipt && (!eventRoute || receipt.command.type === 'ingest')) return sendJson(res, 200, receipt);
      if (unknown?.id === id) return sendJson(res, 503, { ...unknown, outcomeUnknown: true });
      throw fail(404, 'No consumed receipt. Absence is not proof an in-flight command failed.');
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/incidents/')) {
      const incident = model.incidents.get(decodePath(url.pathname.slice('/api/incidents/'.length)));
      if (!incident) throw fail(404, 'Incident not found.');
      return sendJson(res, 200, incident);
    }
    if (req.method === 'POST' && ['/api/telemetry', '/api/incidents/actions', '/api/fixtures'].includes(url.pathname)) {
      assertLocalMutation(req);
      admissible();
      const input = await readJson(req);
      admissible();
      if (url.pathname === '/api/fixtures') {
        const commands = fixture(input);
        // Reject the whole fixture before any prefix can be published.
        if (commands.at(-1).eventTime > Date.now() + 300000) throw fail(400, 'Fixture eventTime is more than five minutes ahead of the owner clock.');
        const receipts = await serialize(async () => {
          const outcomes = [];
          for (const command of commands) outcomes.push(await publish(command));
          return outcomes;
        });
        return sendJson(res, receipts.every(item => item.outcome.accepted) ? 200 : 409, { receipts });
      }
      const command = url.pathname === '/api/telemetry' ? normalize(input) : validateCommand({ ...input, type: 'incident' });
      const receipt = await serialize(() => publish(command));
      return sendJson(res, receipt.outcome.accepted ? 200 : 409, receipt);
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected SIEM owner failure. Inspect app logs.', commandId: error.commandId ?? null, outcomeUnknown: error.outcomeUnknown === true });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
async function shutdown() {
  if (stopping) return;
  stopping = true;
  server.close();
  await queue;
  ready = false;
  await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
