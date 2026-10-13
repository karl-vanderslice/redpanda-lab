import http from 'node:http';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { connectLog } from '../common/log.mjs';
import { readJson, sendJson, serveFile, assertLocalMutation } from '../common/http.mjs';
import { createState, topic, agentFor, validId } from './state.mjs';
import { startInference, infer } from './inference.mjs';

const role = process.env.LAB_ROLE || 'app';
if (!['app', 'planner', 'reviewer'].includes(role)) throw new Error('LAB_ROLE must be app, planner or reviewer');
const instanceId = randomUUID();
const state = createState();
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const listeners = new Map();
const waiters = new Set();
let ready = false; let stopping = false; let busy = false; let child = null;
let inferenceCount = 0; let inferenceFailures = 0;
let log; let relay;
const snapshot = () => ({ ...state.snapshot(), ready, role, agents: ['planner', 'reviewer'] });
function announce() {
  for (const waiter of waiters) waiter();
  const frame = `event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`;
  for (const [res, client] of listeners) {
    // A large frame can exceed highWaterMark even for a fast client.
    // Coalesce pending snapshots and resume only when the socket drains.
    if (res.writableNeedDrain) client.pending = frame;
    else res.write(frame);
  }
}
function observed(predicate, timeout = 15000) {
  if (predicate()) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const finish = () => {
      if (!predicate()) return;
      clearTimeout(timer); waiters.delete(finish); resolve();
    };
    const timer = setTimeout(() => { waiters.delete(finish); reject(new Error('Log outcome is unknown; inspect the task before taking another action.')); }, timeout);
    waiters.add(finish);
    finish();
  });
}
const event = (task, step, type, fields = {}) => ({
  schema: 1, type, eventId: `${step.id}:${type.split('.')[1]}`,
  taskId: task.id, stepId: step.id, stage: step.stage, agentId: role,
  instanceId, at: new Date().toISOString(), ...fields,
});
async function publish(task, step, type, fields) {
  await log.append(task.id, event(task, step, type, fields));
  await observed(() => step.status === (type === 'step.started' ? 'running' : type === 'step.completed' ? 'completed' : 'failed'));
}
function fatal(error) {
  console.error('Agent stopped with uncertain log outcome:', error);
  ready = false; stopping = true; child?.kill('SIGKILL');
  announce();
  // Restart replays the log first; a recorded start without a result is failed,
  // never regenerated. The broker may have accepted an unacknowledged result.
  setTimeout(() => process.exit(1), 100).unref();
}
async function pump() {
  if (!ready || stopping || busy || role === 'app') return;
  busy = true;
  try {
    while (!stopping) {
      let selected;
      for (const task of state.tasks.values()) {
        if (task.status === 'failed' || task.status === 'completed') continue;
        const index = task.steps.findIndex(step => step.status !== 'completed');
        const step = task.steps[index];
        if (step?.status === 'pending' && agentFor(step.stage) === role) { selected = { task, step }; break; }
      }
      if (!selected) break;
      const { task, step } = selected;
      await publish(task, step, 'step.started');
      // Only the instance whose start was accepted may perform inference.
      if (step.instanceId !== instanceId) continue;
      let result;
      try {
        result = await infer(task, step.stage, current => { child = current; });
        inferenceCount++;
      } catch (error) {
        if (stopping) break;
        inferenceFailures++;
        await publish(task, step, 'step.failed', { error: error.message });
        continue;
      }
      if (!stopping) await publish(task, step, 'step.completed', result);
    }
  } catch (error) { fatal(error); }
  finally { busy = false; }
}
const server = http.createServer(async (req, res) => {
  res.setHeader('x-content-type-options', 'nosniff');
  res.setHeader('cache-control', 'no-store');
  res.setHeader('content-security-policy', "default-src 'self'; script-src 'self'; style-src 'self'; connect-src 'self'; img-src 'self'; frame-ancestors 'none'; base-uri 'none'; form-action 'self'");
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') return sendJson(res, ready ? 200 : 503, { ready, role, agentId: role === 'app' ? null : role, instanceId });
    if (req.method === 'GET' && url.pathname === '/metrics') {
      const data = state.snapshot();
      const lines = [
        `agent_messaging_ready{role="${role}"} ${Number(ready)}`,
        `agent_messaging_tasks{role="${role}"} ${state.tasks.size}`,
        `agent_messaging_duplicate_events_total{role="${role}"} ${data.duplicates}`,
        `agent_messaging_rejected_events_total{role="${role}"} ${data.rejected}`,
        `agent_messaging_inference_completed_total{role="${role}"} ${inferenceCount}`,
        `agent_messaging_inference_failed_total{role="${role}"} ${inferenceFailures}`,
        ...['pending', 'running', 'completed', 'failed'].map(status => `agent_messaging_task_states{role="${role}",status="${status}"} ${[...state.tasks.values()].filter(task => task.status === status).length}`),
      ];
      res.writeHead(200, { 'content-type': 'text/plain; version=0.0.4' }); return res.end(`${lines.join('\n')}\n`);
    }
    if (role !== 'app') return sendJson(res, 404, { error: 'Agent exposes only health and metrics.' });
    if (req.method === 'GET' && url.pathname === '/api/tasks') return sendJson(res, 200, snapshot());
    if (req.method === 'GET' && url.pathname.startsWith('/api/tasks/')) {
      const task = state.tasks.get(url.pathname.slice('/api/tasks/'.length));
      return sendJson(res, task ? 200 : 404, task || { error: 'Task not observed in the log.' });
    }
    if (req.method === 'GET' && url.pathname === '/api/events') {
      res.writeHead(200, { 'content-type': 'text/event-stream', 'connection': 'keep-alive' });
      const client = { pending: null };
      listeners.set(res, client);
      res.on('drain', () => {
        if (client.pending && !res.destroyed) {
          const frame = client.pending;
          client.pending = null;
          res.write(frame);
        }
      });
      res.write(`event: snapshot\ndata: ${JSON.stringify(snapshot())}\n\n`);
      req.on('close', () => listeners.delete(res)); return;
    }
    if (req.method === 'POST' && url.pathname === '/api/tasks') {
      assertLocalMutation(req);
      if (!ready) return sendJson(res, 503, { error: 'Log replay is not ready. Wait for readiness before submitting.' });
      const body = await readJson(req);
      if (!body || typeof body !== 'object' || Array.isArray(body) || !validId(body.id) || typeof body.task !== 'string' || !body.task.trim() || body.task.trim().length > 1200) {
        return sendJson(res, 400, { error: 'Provide an 8–80 character task ID and a task of 1–1200 characters.' });
      }
      const text = body.task.trim();
      const existing = state.tasks.get(body.id);
      if (existing && existing.task !== text) return sendJson(res, 409, { error: 'This ID already identifies a different task.' });
      if (existing) return sendJson(res, 200, existing);
      try {
        await log.append(body.id, { schema: 1, type: 'task.submitted', eventId: `${body.id}:submitted`, taskId: body.id, task: text, at: new Date().toISOString() });
        await observed(() => state.tasks.has(body.id));
      } catch (error) {
        console.error('Task submission outcome unknown:', error.message);
        return sendJson(res, 503, { id: body.id, status: 'unknown', error: 'Submission outcome is unknown. Look up this task ID; do not create a new ID for an automatic retry.' });
      }
      const task = state.tasks.get(body.id);
      if (task.task !== text) return sendJson(res, 409, { error: 'Another submission with this ID was accepted first.' });
      return sendJson(res, 202, task);
    }
    if (req.method === 'GET' && await serveFile(req, res, publicRoot)) return;
    sendJson(res, 404, { error: 'Not found.' });
  } catch (error) {
    console.error('HTTP request:', error.message);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'The request failed. Inspect the service logs.' });
    else res.destroy();
  }
});
await new Promise(resolve => server.listen(3000, '0.0.0.0', resolve));
if (role !== 'app') relay = await startInference();
log = await connectLog({ topic, group: `agent-messaging-${role}`, onEvent: async (value, meta) => {
  if (state.apply(value, meta)) announce();
  if (ready) queueMicrotask(() => { void pump(); });
} });
await log.ready;
// No inference or recovery publication before pre-start replay has completed.
if (role !== 'app') {
  for (const task of state.tasks.values()) for (const step of task.steps) {
    if (step.agentId === role && step.status === 'running') {
      await log.append(task.id, { ...event(task, step, 'step.failed', {
        error: 'The owning agent restarted after its start was recorded but before a result was recorded. Outcome is interrupted; no automatic inference retry.',
      }), instanceId: step.instanceId });
      await observed(() => step.status !== 'running');
    }
  }
}
ready = true; announce(); void pump();
console.log(JSON.stringify({ role, instanceId, topic, ready }));
async function shutdown() {
  if (stopping) return;
  stopping = true; ready = false; child?.kill('SIGKILL');
  for (const res of listeners.keys()) res.end();
  server.close();
  await log?.close(); await relay?.close();
  process.exit(0);
}
process.on('SIGTERM', () => { void shutdown(); });
process.on('SIGINT', () => { void shutdown(); });
