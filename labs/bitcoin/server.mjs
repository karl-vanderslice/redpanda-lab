import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { initial, transition, account, averages, quotes, strategy, source, fixtureSha256 } from './engine.mjs';

const topic = 'bitcoin.paper.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const kinds = new Set(['play', 'pause', 'step', 'auto-on', 'auto-off', 'buy', 'sell']);
const operations = new Map(); const waiters = new Map(); const clients = new Map();
const prices = []; const trades = [];
let model = initial(); let ready = false; let lastOffset = null; let duplicates = 0; let fault = null;
let queue = Promise.resolve(); let ticker; let stopping = false;
const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, outcomeUnknown: false, ...details });
function validate(value) {
  if (!value || typeof value.id !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value.id) || !kinds.has(value.kind)) throw fail(400, 'Use a unique 1-80 character id and a supported command kind.');
  return { id: value.id, kind: value.kind };
}
function snapshot() {
  return { ready, fault, topic, lastOffset, duplicates, source, strategy, account: account(model),
    replay: { index: model.index, total: quotes.length, playing: model.playing, automatic: model.automatic, signal: model.signal, ended: model.index === quotes.length - 1 },
    prices, trades, commands: [...operations.values()].map(({ id, kind, at, offset, result }) => ({ id, kind, at, offset, accepted: result.accepted, reason: result.reason })) };
}
function push(res, client) {
  if (client.blocked) { client.dirty = true; return; }
  client.dirty = false;
  // A false write still buffers this frame. Drain only flushes a newer snapshot.
  client.blocked = !res.write(`event: state\ndata: ${JSON.stringify(snapshot())}\n\n`);
}
function notify() { for (const [res, client] of clients) push(res, client); }
function armTicker() {
  clearTimeout(ticker);
  if (!ready || stopping || !model.playing) return;
  ticker = setTimeout(() => {
    void serialize(() => {
      // A queued pause wins before any later timer can consume another quote.
      if (ready && !stopping && model.playing) return publish({ id: `tick-${fixtureSha256.slice(0, 16)}-${model.index + 1}`, kind: 'step' });
    }).catch(error => console.error('Paper quote feed stopped:', error.message));
  }, strategy.intervalMs);
  ticker.unref();
}
function apply(record, metadata) {
  const command = validate(record);
  if (record.schema !== 1 || record.fixtureSha256 !== fixtureSha256 || !Number.isSafeInteger(record.at) || record.at < 0 || metadata.key !== command.id) throw new Error('Invalid or incompatible paper ledger record');
  const prior = operations.get(command.id);
  if (prior) {
    if (prior.kind !== command.kind || !isDeepStrictEqual(prior.result, record.result)) throw new Error('Conflicting duplicate paper command');
    duplicates += 1; lastOffset = metadata.offset; if (ready) notify(); return;
  }
  const expected = transition(model, command.kind);
  if (!isDeepStrictEqual(expected, record.result)) throw new Error('Paper accounting replay disagrees with the recorded outcome');
  lastOffset = metadata.offset;
  model = expected.model;
  const operation = { ...command, at: record.at, offset: metadata.offset, result: expected, record };
  operations.set(command.id, operation);
  if (expected.quote) prices.push({ index: model.index, ...expected.quote, ...averages(model.index), offset: metadata.offset });
  if (expected.trade) trades.push({ id: command.id, ...expected.trade, observedAt: record.at, offset: metadata.offset });
  waiters.get(command.id)?.(operation);
  if (ready) { notify(); armTicker(); }
}
const log = await connectLog({ topic, group: 'bitcoin-paper-owner', onEvent: apply });
await log.ready;
ready = true;

async function publish(command) {
  if (!ready || stopping) throw fail(503, fault || 'The paper ledger is not ready.', { commandId: command.id });
  const prior = operations.get(command.id);
  if (prior) {
    if (prior.kind !== command.kind) throw fail(409, 'This id already belongs to a different command.');
    return prior;
  }
  const record = { schema: 1, fixtureSha256, ...command, at: Date.now(), result: transition(model, command.kind) };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (operations.has(command.id)) return operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Projection acknowledgment timed out')), 30000);
    })]);
  } catch (error) {
    // Observed application is stronger proof than a lost producer acknowledgment.
    if (operations.has(command.id)) return operations.get(command.id);
    ready = false;
    fault = `Outcome unknown for ${command.id}. Look up this id and inspect the log before restarting. Do not submit a replacement command.`;
    clearTimeout(ticker); notify();
    console.error(fault, error);
    throw fail(503, fault, { outcomeUnknown: true, commandId: command.id });
  } finally { clearTimeout(deadline); waiters.delete(command.id); }
}
function serialize(action) {
  // One owner computes and commits each outcome before accepting the next state transition.
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, ready ? 200 : 503, { ready, fault }); return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { sendJson(res, 200, snapshot()); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/commands/')) {
      const operation = operations.get(url.pathname.slice('/api/commands/'.length));
      if (!operation) throw fail(404, 'No consumed command with that id. Absence does not prove an in-flight publish failed.');
      sendJson(res, 200, operation); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/commands') {
      assertLocalMutation(req);
      const command = validate(await readJson(req));
      if (command.id.startsWith('tick-')) throw fail(400, 'tick- IDs belong to the internal quote feed.', { commandId: command.id });
      const operation = await serialize(() => publish(command));
      sendJson(res, operation.result.accepted ? 200 : 409, operation); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/stream') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'cache-control': 'no-store', connection: 'keep-alive' });
      const client = { blocked: false, dirty: false }; clients.set(res, client); push(res, client);
      res.on('drain', () => { if (clients.has(res)) { client.blocked = false; if (client.dirty) push(res, client); } });
      req.on('close', () => clients.delete(res)); return;
    }
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const a = account(model);
      const metrics = [`bitcoin_paper_quotes_total ${prices.length}`, `bitcoin_paper_trades_total{side="buy"} ${trades.filter(t => t.side === 'buy').length}`,
        `bitcoin_paper_trades_total{side="sell"} ${trades.filter(t => t.side === 'sell').length}`, `bitcoin_paper_cash_cents ${a.cashCents}`,
        `bitcoin_paper_position_sats ${a.quantitySats}`, `bitcoin_paper_realized_cents ${a.realizedCents}`, `bitcoin_paper_duplicates_total ${duplicates}`];
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); res.end(metrics.join('\n') + '\n'); return;
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected server error. Inspect app logs.',
      outcomeUnknown: error.outcomeUnknown === true, commandId: error.commandId ?? null });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
armTicker();
const heartbeat = setInterval(notify, 15000); heartbeat.unref();
async function shutdown() {
  if (stopping) return;
  stopping = true; ready = false; clearTimeout(ticker); clearInterval(heartbeat);
  for (const res of clients.keys()) res.end();
  clients.clear();
  server.close(); await queue; await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
