import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectLog } from '../common/log.mjs';
import { readJson, sendJson, serveFile, assertLocalMutation } from '../common/http.mjs';
import { createState } from './state.mjs';

const topic = process.env.CHAT_TOPIC || 'agent-chat-events';
const modelUrl = (process.env.MODEL_URL || 'http://model:8080/v1').replace(/\/$/, '');
const model = 'lab-small';
const owner = randomUUID();
const state = createState();
const waiters = new Map();
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const now = () => new Date().toISOString();
let log;
let ready = false;
let closing = false;
let schedulerError = null;
let busy = false;
let timer;
let inferenceController;

function problem(status, message, extra = {}) {
  return Object.assign(new Error(message), { status, extra });
}
function identifier(value, field = 'requestId') {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{8,80}$/.test(value)) {
    throw problem(400, `${field} must contain 8–80 letters, digits, underscores or hyphens`);
  }
  return value;
}
function text(value, field, maximum) {
  if (typeof value !== 'string' || !value.trim() || value.length > maximum) {
    throw problem(400, `${field} must be nonempty text, at most ${maximum} characters`);
  }
  return value.trim();
}
function requireReady() {
  if (!ready || closing || schedulerError) throw problem(503, 'Scheduler is not ready; inspect /api/state', { outcomeUnknown: false });
}
function observe(id, timeout = 10000) {
  if (state.operations.has(id)) return Promise.resolve(state.operations.get(id));
  return new Promise((resolve, reject) => {
    const waiter = { resolve, reject };
    const entries = waiters.get(id) || new Set();
    entries.add(waiter);
    waiters.set(id, entries);
    waiter.timeout = setTimeout(() => {
      entries.delete(waiter);
      if (!entries.size) waiters.delete(id);
      reject(problem(503, 'Log acknowledgment or projection is delayed; inspect this requestId before retrying', {
        requestId: id, outcomeUnknown: true,
      }));
    }, timeout);
  });
}
function onEvent(event, position) {
  state.apply(event, position);
  for (const waiter of waiters.get(event.id) || []) {
    clearTimeout(waiter.timeout);
    waiter.resolve(state.operations.get(event.id));
  }
  waiters.delete(event.id);
}
async function publish(event) {
  const previous = state.operations.get(event.id);
  if (previous) return previous;
  try {
    await log.append(event.conversationId || event.jobId || event.id, event);
  } catch (error) {
    console.error('Log append outcome unknown', event.id, error);
    throw problem(503, 'Publish outcome unknown; inspect this requestId before retrying', {
      requestId: event.id, outcomeUnknown: true,
    });
  }
  return observe(event.id);
}
function envelope(type, fields, id = randomUUID()) {
  return { version: 1, id, type, at: now(), ...fields };
}
async function command(event) {
  const result = await publish(event);
  if (result.signature !== event.signature) throw problem(409, 'requestId already belongs to a different command');
  if (!result.accepted) throw problem(409, result.reason, { requestId: event.id });
  return result;
}
function inputFor(job) {
  // Whole exchanges only: interrupted/failed turns are not model history.
  const conversation = state.conversations.get(job.conversationId);
  const exchanges = [];
  for (let index = conversation.messages.length - 1; index > 0; index -= 1) {
    const assistant = conversation.messages[index];
    const user = conversation.messages[index - 1];
    if (assistant.role === 'assistant' && user.role === 'user' && assistant.jobId === user.jobId) {
      exchanges.unshift([user, assistant]);
      index -= 1;
    }
    if (exchanges.length === 6) break;
  }
  let budget = 6000 - job.prompt.length;
  const history = [];
  for (let index = exchanges.length - 1; index >= 0; index -= 1) {
    const pair = exchanges[index];
    const size = pair[0].content.length + pair[1].content.length;
    if (size > budget) break;
    budget -= size;
    history.unshift(...pair.map(message => ({ role: message.role, content: message.content })));
  }
  return [
    { role: 'system', content: 'You are a helpful assistant. Answer briefly in plain English. You have no tools or access to the outside world.' },
    ...history, { role: 'user', content: job.prompt },
  ];
}
async function infer(job) {
  inferenceController = new AbortController();
  const timeout = setTimeout(() => inferenceController?.abort(), 120000);
  let result;
  try {
    const response = await fetch(`${modelUrl}/chat/completions`, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      signal: inferenceController.signal,
      body: JSON.stringify({ model, messages: job.input, stream: false, max_tokens: 160, temperature: 0.2 }),
    });
    if (!response.ok) {
      result = envelope('job.failed', {
        jobId: job.id, attemptId: job.attemptId, error: `Local model returned HTTP ${response.status}`,
        outcomeUnknown: false,
      });
    } else {
      const data = await response.json();
      const reply = data?.choices?.[0]?.message?.content;
      if (typeof reply !== 'string' || !reply.trim() || reply.length > 16000) {
        throw new Error('Local model returned no usable text');
      }
      result = envelope('job.completed', {
        jobId: job.id, attemptId: job.attemptId, reply: reply.trim(), model,
        usage: data.usage || null, outcomeUnknown: false,
      });
    }
  } catch (error) {
    console.error('Inference did not produce a durable reply', job.id, error);
    result = envelope('job.failed', {
      jobId: job.id, attemptId: job.attemptId,
      error: 'Local inference was interrupted, timed out, or returned invalid data; outcome unknown. Not retried.',
      outcomeUnknown: true,
    });
  } finally {
    clearTimeout(timeout);
    inferenceController = null;
  }
  if (!closing) await publish(result);
}
async function tick() {
  if (!ready || closing || busy || schedulerError) return;
  const job = [...state.jobs.values()]
    .filter(value => value.status === 'pending' && Date.parse(value.dueAt) <= Date.now())
    .sort((a, b) => Date.parse(a.dueAt) - Date.parse(b.dueAt) || a.id.localeCompare(b.id))[0];
  if (!job) return;
  busy = true;
  try {
    const event = envelope('job.started', {
      jobId: job.id, attemptId: randomUUID(), owner, input: inputFor(job),
    });
    const result = await publish(event);
    // A cancellation may have won before this start was consumed. Never infer then.
    if (result.accepted && job.status === 'running' && job.attemptId === event.attemptId) await infer(job);
  } catch (error) {
    console.error('Scheduler stopped after uncertain publication', error);
    schedulerError = 'Log publication is uncertain. Scheduler paused; inspect events and restart to reconcile. No inference retry.';
  } finally {
    busy = false;
  }
}

function summary() {
  return {
    ready: ready && !closing && !schedulerError, topic, model, owner, revision: state.revision,
    scheduler: { ownerCount: 1, busy, error: schedulerError, tickMs: 250 },
    serverTime: now(), conversations: [...state.conversations.values()].map(value => ({
      id: value.id, title: value.title, createdAt: value.createdAt, messageCount: value.messages.length,
    })), jobs: [...state.jobs.values()],
  };
}
const server = http.createServer(async (req, res) => {
  res.setHeader('cache-control', 'no-store');
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('content-security-policy', "default-src 'self'; style-src 'self'; script-src 'self'; connect-src 'self'; img-src 'self'; base-uri 'none'; frame-ancestors 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET') {
      if (url.pathname === '/health') return sendJson(res, summary().ready ? 200 : 503, {
        ready: summary().ready, schedulerError,
      });
      if (url.pathname === '/api/state') return sendJson(res, 200, summary());
      if (url.pathname === '/api/conversations') return sendJson(res, 200, { conversations: summary().conversations });
      if (url.pathname === '/api/jobs') return sendJson(res, 200, { jobs: [...state.jobs.values()] });
      const conversationMatch = url.pathname.match(/^\/api\/conversations\/([a-zA-Z0-9_-]+)$/);
      if (conversationMatch) {
        const value = state.conversation(conversationMatch[1]);
        if (!value) throw problem(404, 'Conversation not found');
        return sendJson(res, 200, value);
      }
      const jobMatch = url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)$/);
      if (jobMatch) {
        const value = state.jobs.get(jobMatch[1]);
        if (!value) throw problem(404, 'Job not found');
        return sendJson(res, 200, value);
      }
      const operationMatch = url.pathname.match(/^\/api\/operations\/([a-zA-Z0-9_-]+)$/);
      if (operationMatch) {
        const value = state.operations.get(operationMatch[1]);
        if (!value) throw problem(404, 'Request not observed in the retained log');
        return sendJson(res, 200, value);
      }
      if (url.pathname === '/api/events') {
        const after = url.searchParams.get('after');
        if (after !== null && !/^\d+$/.test(after)) throw problem(400, 'after must be a nonnegative offset');
        return sendJson(res, 200, {
          topic, events: state.events.filter(event => after === null || BigInt(event.offset) > BigInt(after)),
        });
      }
      if (await serveFile(req, res, publicRoot)) return;
      throw problem(404, 'Endpoint not found');
    }
    if (req.method !== 'POST') throw problem(405, 'Use GET or POST');
    assertLocalMutation(req);
    requireReady();
    const body = await readJson(req);
    if (!body || typeof body !== 'object' || Array.isArray(body)) throw problem(400, 'Expected a JSON object');
    const requestId = identifier(body.requestId);
    if (url.pathname === '/api/conversations') {
      const title = text(body.title, 'title', 80);
      const event = envelope('conversation.created', {
        conversationId: requestId, title, signature: JSON.stringify(['conversation.created', title]),
      }, requestId);
      await command(event);
      return sendJson(res, 201, state.conversation(requestId));
    }
    const submitMatch = url.pathname.match(/^\/api\/conversations\/([a-zA-Z0-9_-]+)\/prompts$/);
    if (submitMatch) {
      const prompt = text(body.prompt, 'prompt', 2000);
      const conversationId = identifier(submitMatch[1], 'conversationId');
      if (!state.conversations.has(conversationId)) throw problem(404, 'Conversation not found');
      let dueAt;
      let mode = 'now';
      if (body.dueAt !== undefined) {
        if (typeof body.dueAt !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}(\.\d{1,3})?(Z|[+-]\d{2}:\d{2})$/.test(body.dueAt)) {
          throw problem(400, 'dueAt must be an ISO 8601 instant including seconds and timezone');
        }
        const instant = Date.parse(body.dueAt);
        const calendar = new Date(`${body.dueAt.slice(0, 19)}Z`);
        if (!Number.isFinite(instant) || !Number.isFinite(calendar.getTime())
          || calendar.toISOString().slice(0, 19) !== body.dueAt.slice(0, 19)) {
          throw problem(400, 'dueAt is not a valid calendar instant');
        }
        const previous = state.operations.get(requestId);
        if (!previous && (instant <= Date.now() || instant > Date.now() + 7 * 86400000)) {
          throw problem(400, 'dueAt must be in the future and within seven days');
        }
        dueAt = new Date(instant).toISOString();
        mode = 'scheduled';
      } else dueAt = now();
      const event = envelope('job.submitted', {
        conversationId, jobId: requestId, prompt, mode, dueAt,
        signature: JSON.stringify(['job.submitted', conversationId, prompt, mode, mode === 'scheduled' ? dueAt : null]),
      }, requestId);
      await command(event);
      return sendJson(res, 202, state.jobs.get(requestId));
    }
    const cancelMatch = url.pathname.match(/^\/api\/jobs\/([a-zA-Z0-9_-]+)\/cancel$/);
    if (cancelMatch) {
      const jobId = identifier(cancelMatch[1], 'jobId');
      if (!state.jobs.has(jobId)) throw problem(404, 'Job not found');
      await command(envelope('job.cancelled', {
        jobId, signature: JSON.stringify(['job.cancelled', jobId]),
      }, requestId));
      return sendJson(res, 200, state.jobs.get(jobId));
    }
    throw problem(404, 'Endpoint not found');
  } catch (error) {
    if (!error.status) console.error('HTTP request failed', error);
    if (!res.headersSent) sendJson(res, error.status || 500, {
      error: error.status ? error.message : 'Internal request failure', ...error.extra,
    });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');

async function boot() {
  log = await connectLog({ topic, group: `agent-chat-${owner}`, onEvent });
  await log.ready;
  if (closing) return;
  // No effects during replay. Old running attempts cannot safely be rerun.
  for (const job of state.jobs.values()) {
    if (job.status === 'running') await publish(envelope('job.failed', {
      jobId: job.id, attemptId: job.attemptId,
      error: 'Scheduler restarted with an unfinished attempt. Inference outcome unknown; not retried.',
      outcomeUnknown: true,
    }));
  }
  while (!closing) {
    try {
      const response = await fetch(`${modelUrl.replace(/\/v1$/, '')}/health`, { signal: AbortSignal.timeout(3000) });
      if (response.ok) break;
    } catch (error) {
      console.error('Waiting for local model', error.message);
    }
    await new Promise(resolve => setTimeout(resolve, 1000));
  }
  if (closing) return;
  ready = true;
  timer = setInterval(() => { void tick(); }, 250);
  console.log(`Chat ready: topic=${topic} owner=${owner} model=${model}`);
}
void boot().catch(error => {
  console.error('Chat initialization failed', error);
  schedulerError = 'Initialization failed; inspect service logs and restart.';
});
async function shutdown() {
  if (closing) return;
  closing = true;
  ready = false;
  clearInterval(timer);
  inferenceController?.abort();
  server.close();
  for (const entries of waiters.values()) for (const waiter of entries) {
    clearTimeout(waiter.timeout);
    waiter.reject(problem(503, 'Scheduler shutting down; inspect requestId after restart', { outcomeUnknown: true }));
  }
  waiters.clear();
  const deadline = setTimeout(() => process.exit(0), 5000);
  await log?.close();
  clearTimeout(deadline);
  process.exit(0);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
