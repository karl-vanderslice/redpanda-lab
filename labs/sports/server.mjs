import { createServer } from 'node:http';
import { createReadStream } from 'node:fs';
import { stat, readFile } from 'node:fs/promises';
import { fileURLToPath } from 'node:url';
import { join } from 'node:path';
import { connectLog } from '../common/log.mjs';
import { readJson, sendJson, serveFile, assertLocalMutation } from '../common/http.mjs';
import { fixtures, sports } from './fixtures.mjs';

const topic = 'sports.events.v2';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const matches = new Map(fixtures.map((match) => [match.id, { ...match }]));
const operations = new Map();
const viewers = new Map();
const clients = new Set();
const feed = [];
const totals = { applied: 0, rejected: 0, duplicates: 0, invalid: 0, publishErrors: 0, mediaRequests: 0, play: 0, pause: 0, heartbeat: 0 };
let ready = false;
let lastOffset = null;
const kinds = new Set(['score', 'follow', 'watchlist', 'play', 'pause', 'heartbeat']);
const token = (value) => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
const failure = (status, message) => Object.assign(new Error(message), { status });

function validate(input) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw failure(400, 'Send an event object.');
  if (!token(input.id)) throw failure(400, 'id must be 1–80 letters, digits, underscores or hyphens.');
  if (!kinds.has(input.kind)) throw failure(400, 'Unknown event kind.');
  const match = matches.get(input.matchId);
  if (!match) throw failure(404, 'Unknown matchId.');
  const event = { id: input.id, kind: input.kind, matchId: match.id };
  if (input.kind === 'score') {
    if (!['home', 'away'].includes(input.side)) throw failure(400, 'side must be home or away.');
    if (!sports.find((sport) => sport.id === match.sport).increments.includes(input.delta)) throw failure(400, 'Invalid scoring increment for this sport.');
    if (input.expectedRevision !== undefined && (!Number.isSafeInteger(input.expectedRevision) || input.expectedRevision < 0)) throw failure(400, 'expectedRevision must be a nonnegative integer.');
    Object.assign(event, { side: input.side, delta: input.delta });
    if (input.expectedRevision !== undefined) event.expectedRevision = input.expectedRevision;
  } else {
    if (!token(input.viewerId)) throw failure(400, 'A valid viewerId is required.');
    event.viewerId = input.viewerId;
    if (['follow', 'watchlist'].includes(input.kind)) {
      if (typeof input.enabled !== 'boolean') throw failure(400, 'enabled must be boolean.');
      event.enabled = input.enabled;
      if (input.kind === 'follow') {
        if (!['home', 'away'].includes(input.side)) throw failure(400, 'side must be home or away.');
        event.side = input.side;
      }
    } else {
      if (typeof input.position !== 'number' || !Number.isFinite(input.position) || input.position < 0 || input.position > 86400) throw failure(400, 'position must be seconds between 0 and 86400.');
      event.position = input.position;
    }
  }
  return event;
}
const fingerprint = (event) => JSON.stringify(event);
function viewerState(id) {
  if (!viewers.has(id)) viewers.set(id, { follows: new Set(), watchlist: new Set(), playback: new Map() });
  return viewers.get(id);
}
function snapshot(viewerId) {
  const viewer = viewers.get(viewerId);
  return {
    ready, topic, lastOffset, sports, matches: [...matches.values()], feed,
    metrics: { ...totals, activeViewers: [...viewers.values()].filter((v) => [...v.playback.values()].some((p) => p.playing && Date.now() - p.at < 30000)).length },
    viewer: { id: viewerId, follows: [...(viewer?.follows ?? [])], watchlist: [...(viewer?.watchlist ?? [])], playback: Object.fromEntries(viewer?.playback ?? []) },
  };
}
function notify() {
  for (const client of clients) {
    if (!client.res.write(`event: state\ndata: ${JSON.stringify(snapshot(client.viewerId))}\n\n`)) {
      client.res.end();
      clients.delete(client);
    }
  }
}
function apply(raw, metadata) {
  // Never reinterpret retained outcomes against a different fixture catalog.
  if (raw?.schema === 1 && typeof raw.matchId === 'string' && !matches.has(raw.matchId)) {
    throw new Error('Sports fixture catalog does not match retained history. Preserve prior evidence, then dispose only this lab before using the new catalog. No records were migrated or deleted.');
  }
  let event;
  try {
    if (raw?.schema !== 1 || !Number.isSafeInteger(raw.at) || raw.at < 0) throw new Error('Invalid schema or timestamp.');
    event = validate(raw);
  } catch (error) {
    totals.invalid += 1;
    console.error('Rejected invalid sports log record:', error.message);
    return;
  }
  const signature = fingerprint(event);
  const prior = operations.get(event.id);
  if (prior?.status === 'completed' || prior?.status === 'error') {
    totals.duplicates += 1;
    return;
  }
  const match = matches.get(event.matchId);
  let error = null;
  if (prior && prior.signature !== signature) error = 'Operation ID already belongs to a different event.';
  if (event.kind === 'score' && event.expectedRevision !== undefined && event.expectedRevision !== match.revision) error = 'Score revision changed. Read the scoreboard before submitting a new operation.';
  if (!error) {
    if (event.kind === 'score') {
      match[`${event.side}Score`] += event.delta;
      match.revision += 1;
    } else {
      const viewer = viewerState(event.viewerId);
      if (event.kind === 'follow' || event.kind === 'watchlist') {
        const set = event.kind === 'follow' ? viewer.follows : viewer.watchlist;
        const key = event.kind === 'follow' ? match[event.side] : match.id;
        if (event.enabled) set.add(key); else set.delete(key);
      } else {
        const previous = viewer.playback.get(match.id);
        viewer.playback.set(match.id, { playing: event.kind === 'play' || (event.kind === 'heartbeat' && previous?.playing === true), at: raw.at, position: event.position, lastKind: event.kind });
        totals[event.kind] += 1;
      }
    }
    totals.applied += 1;
  } else totals.rejected += 1;
  lastOffset = String(metadata.offset);
  const operation = { id: event.id, status: error ? 'error' : 'completed', signature, event, error, partition: metadata.partition, offset: lastOffset };
  operations.set(event.id, operation);
  feed.unshift({ ...event, at: raw.at, status: operation.status, error, offset: lastOffset });
  feed.length = Math.min(feed.length, 60);
  if (ready) notify();
}
const log = await connectLog({ topic, group: 'sports-projection', onEvent: apply });
// Projection callbacks alone mutate domain state, including during startup replay.
log.ready.then(() => { ready = true; notify(); }).catch((error) => { console.error('Sports replay failed:', error); });

async function media(req, res, pathname) {
  const name = pathname.slice('/media/'.length);
  if (!sports.some((sport) => name === `${sport.id}.mp4`)) throw failure(404, 'Unknown media.');
  const path = join(publicRoot, 'media', name);
  let info;
  try { info = await stat(path); } catch { throw failure(503, 'Local media is missing. Build the sports Nix image.'); }
  let start = 0;
  let end = info.size - 1;
  let status = 200;
  if (req.headers.range) {
    const range = /^bytes=(\d*)-(\d*)$/.exec(req.headers.range);
    if (!range || (!range[1] && !range[2])) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    if (!range[1]) start = Math.max(0, info.size - Number(range[2]));
    else { start = Number(range[1]); if (range[2]) end = Math.min(end, Number(range[2])); }
    if (!Number.isSafeInteger(start) || !Number.isSafeInteger(end) || start > end || start >= info.size) { res.writeHead(416, { 'Content-Range': `bytes */${info.size}` }); res.end(); return; }
    status = 206;
  }
  totals.mediaRequests += 1;
  const headers = { 'Content-Type': 'video/mp4', 'Content-Length': end - start + 1, 'Accept-Ranges': 'bytes', 'Cache-Control': 'public, max-age=3600' };
  if (status === 206) headers['Content-Range'] = `bytes ${start}-${end}/${info.size}`;
  res.writeHead(status, headers);
  if (req.method === 'HEAD') { res.end(); return; }
  const stream = createReadStream(path, { start, end });
  stream.on('error', (error) => { console.error('Media read failed:', error); res.destroy(); });
  res.on('close', () => stream.destroy());
  stream.pipe(res);
}
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    res.setHeader('X-Content-Type-Options', 'nosniff');
    if (['GET', 'HEAD'].includes(req.method) && url.pathname.startsWith('/media/')) { await media(req, res, url.pathname); return; }
    res.setHeader('Cache-Control', 'no-store');
    if (req.method === 'GET' && url.pathname === '/captions.vtt') {
      res.setHeader('Content-Type', 'text/vtt; charset=utf-8');
      res.end(await readFile(join(publicRoot, 'captions.vtt'))); return;
    }
    if (req.method === 'GET' && url.pathname === '/health') { sendJson(res, ready ? 200 : 503, { ready }); return; }
    if (req.method === 'GET' && url.pathname === '/api/state') { sendJson(res, 200, snapshot(url.searchParams.get('viewer') ?? 'guest')); return; }
    if (req.method === 'GET' && url.pathname.startsWith('/api/operations/')) {
      const operation = operations.get(url.pathname.slice('/api/operations/'.length));
      sendJson(res, operation ? 200 : 404, operation ?? { error: 'Operation not observed. Do not assume it failed.' }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/feed') {
      if (clients.size >= 100) throw failure(503, 'Live feed is full. Refresh shortly.');
      res.writeHead(200, { 'Content-Type': 'text/event-stream', Connection: 'keep-alive', 'X-Accel-Buffering': 'no' });
      const client = { res, viewerId: url.searchParams.get('viewer') ?? 'guest' };
      clients.add(client);
      res.write(`event: state\ndata: ${JSON.stringify(snapshot(client.viewerId))}\n\n`);
      res.on('close', () => clients.delete(client)); return;
    }
    if (req.method === 'GET' && url.pathname === '/metrics') {
      res.setHeader('Content-Type', 'text/plain; version=0.0.4');
      res.end(Object.entries(snapshot('guest').metrics).map(([name, value]) => `sports_${name.replace(/[A-Z]/g, (letter) => `_${letter.toLowerCase()}`)}${name === 'activeViewers' ? '' : '_total'} ${value}\n`).join('')); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/events') {
      assertLocalMutation(req);
      if (!ready) throw failure(503, 'Scoreboard is replaying. Wait for readiness.');
      const event = validate(await readJson(req));
      const signature = fingerprint(event);
      const existing = operations.get(event.id);
      if (existing) {
        if (existing.signature !== signature) throw failure(409, 'Operation ID already belongs to a different event.');
        sendJson(res, existing.status === 'completed' || existing.status === 'error' ? 200 : 202, existing); return;
      }
      // Register synchronously before append, so concurrent identical requests cannot publish twice.
      operations.set(event.id, { id: event.id, signature, event, status: 'pending', error: null });
      try { await log.append(event.matchId, { schema: 1, ...event, at: Date.now() }); }
      catch (error) {
        totals.publishErrors += 1;
        console.error('Sports append outcome unknown:', error);
        const current = operations.get(event.id);
        if (current.status === 'pending') { current.status = 'unknown'; current.error = 'Publish outcome unknown. Inspect this operation and the topic; do not blindly retry.'; }
      }
      const operation = operations.get(event.id);
      sendJson(res, operation.status === 'unknown' ? 503 : operation.status === 'pending' ? 202 : 200, operation); return;
    }
    if (req.method === 'GET' && (url.pathname.startsWith('/match/') || url.pathname.startsWith('/sport/'))) {
      req.url = '/';
    }
    if (req.method === 'GET' && await serveFile(req, res, publicRoot)) return;
    throw failure(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status ?? 500, { error: error.status ? error.message : 'Unexpected server error. Inspect app logs.' });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
const pulse = setInterval(() => { if (ready) notify(); }, 10000);
pulse.unref();
let stopping = false;
async function shutdown() {
  if (stopping) return;
  stopping = true;
  ready = false;
  clearInterval(pulse);
  for (const { res } of clients) res.end();
  server.close();
  await log.close();
}
process.on('SIGTERM', () => { shutdown().catch(console.error); });
process.on('SIGINT', () => { shutdown().catch(console.error); });
