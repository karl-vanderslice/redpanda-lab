import { createServer } from 'node:http';
import { fileURLToPath } from 'node:url';
import { isDeepStrictEqual } from 'node:util';
import { connectLog } from '../common/log.mjs';
import { assertLocalMutation, readJson, sendJson, serveFile } from '../common/http.mjs';
import { createModel, validate, fixtureCommand, fail } from './model.mjs';

const topic = 'activity.events.v1';
const publicRoot = fileURLToPath(new URL('./public/', import.meta.url));
const model = createModel(), waiters = new Map();
let ready = false, stopping = false, unknown = null, queue = Promise.resolve();
const log = await connectLog({ topic, group: 'activity-owner', onEvent(record, metadata) {
  const operation = model.apply(record, metadata);
  waiters.get(operation.command.id)?.(operation);
} });
await log.ready;
ready = true;

async function publish(command) {
  const prior = model.operations.get(command.id);
  if (prior) {
    if (!isDeepStrictEqual(prior.command, command)) throw fail(409, 'This ID belongs to a different command.', { commandId: command.id });
    return prior;
  }
  // Shutdown blocks admission, not work already admitted into this queue.
  if (!ready) throw fail(503, 'Writes stopped. Inspect the unresolved receipt and restart to replay before retrying its exact payload.', { outcomeUnknown: unknown?.id === command.id, commandId: command.id });
  const record = { schema: 1, command, at: Date.now(), outcome: model.outcome(command) };
  let deadline;
  const consumed = new Promise(resolve => waiters.set(command.id, resolve));
  try {
    await log.append(command.id, record);
    if (model.operations.has(command.id)) return model.operations.get(command.id);
    return await Promise.race([consumed, new Promise((_, reject) => {
      deadline = setTimeout(() => reject(new Error('Consumer completion timed out.')), 30000);
    })]);
  } catch (error) {
    if (model.operations.has(command.id)) return model.operations.get(command.id);
    ready = false;
    unknown = { id: command.id, command, message: 'Completion unknown. Preserve this ID and payload. Inspect its receipt; restart to replay before retrying exactly. Do not replace the ID.' };
    console.error('Activity completion unknown:', command.id, error);
    throw fail(503, unknown.message, { commandId: command.id, outcomeUnknown: true });
  } finally {
    clearTimeout(deadline); waiters.delete(command.id);
  }
}
function serialize(action) {
  const result = queue.then(action);
  queue = result.catch(() => {});
  return result;
}
// Authored content has no interactions. Installation itself is a durable event.
const fixture = await serialize(() => publish(validate(fixtureCommand, true)));
if (!fixture.accepted) throw new Error('Activity fixture could not be installed.');

const limitations = { authentication: false, privateMessages: false, privatePosts: false, identity: 'Caller-selected public profiles. Anyone with lab access can act as any profile.', reads: 'Article-open events, not proof of human attention. Retry IDs deduplicate; a new ID represents a new open.' };
const server = createServer(async (req, res) => {
  try {
    const url = new URL(req.url, 'http://localhost');
    if (req.method === 'GET' && url.pathname === '/health') {
      sendJson(res, ready && !stopping ? 200 : 503, { ready: ready && !stopping }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/state') {
      sendJson(res, 200, { ready: ready && !stopping, topic, unknown, limitations, ...model.snapshot() }); return;
    }
    if (req.method === 'GET' && url.pathname === '/api/feed') {
      sendJson(res, 200, model.feed(url.searchParams.get('viewerId'))); return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/articles/')) {
      const postId = url.pathname.slice('/api/articles/'.length);
      const state = model.snapshot(), post = state.posts.find(item => item.postId === postId);
      if (!post) throw fail(404, 'Article does not exist.');
      sendJson(res, 200, { post, author: state.profiles.find(item => item.profileId === post.authorId), readRecorded: false }); return;
    }
    if (req.method === 'GET' && url.pathname.startsWith('/api/commands/')) {
      const id = url.pathname.slice('/api/commands/'.length), operation = model.operations.get(id);
      if (operation) { sendJson(res, 200, operation); return; }
      if (unknown?.id === id) { sendJson(res, 503, { ...unknown, outcomeUnknown: true }); return; }
      throw fail(404, 'No consumed receipt. Absence alone does not prove an in-flight append failed.');
    }
    if (req.method === 'POST' && url.pathname === '/api/commands') {
      assertLocalMutation(req);
      if (stopping) throw fail(503, 'The app is shutting down. No new work is admitted.');
      const command = validate(await readJson(req));
      const operation = await serialize(() => publish(command));
      sendJson(res, operation.accepted ? 200 : 409, operation); return;
    }
    if (await serveFile(req, res, publicRoot)) return;
    throw fail(404, 'Not found.');
  } catch (error) {
    if (!error.status) console.error(error);
    if (!res.headersSent) sendJson(res, error.status || 500, { error: error.status ? error.message : 'Unexpected activity error. Inspect app logs.', commandId: error.commandId ?? null, outcomeUnknown: error.outcomeUnknown === true });
    else res.destroy();
  }
});
server.listen(3000, '0.0.0.0');
async function shutdown() {
  if (stopping) return;
  stopping = true;
  const closed = new Promise(resolve => server.close(resolve));
  await closed;
  await queue;
  await log.close();
}
process.on('SIGTERM', () => { void shutdown().catch(console.error); });
process.on('SIGINT', () => { void shutdown().catch(console.error); });
