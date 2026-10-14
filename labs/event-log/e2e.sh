#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
APP=$("$root/labs/run" event-log urls --json | jq -er '.app')
export APP LAB_ROOT="$root"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { createHash } from 'node:crypto';
const app = process.env.APP;
const run = (args, input = '') => new Promise((resolve, reject) => {
  const child = execFile(`${process.env.LAB_ROOT}/labs/run`, ['event-log', ...args], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr })); else resolve(stdout);
  });
  child.stdin.end(input);
});
async function get(path) {
  const response = await fetch(app + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response.json();
}
async function send(path, body, expected = 200, headers = {}) {
  const response = await fetch(app + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(120000) });
  const result = await response.json();
  assert.equal(response.status, expected, JSON.stringify(result));
  return result;
}
const post = (command, expected = 200, headers = {}) => send('/api/commands', command, expected, headers);
const state = () => get('/api/state');
const digest = value => createHash('sha256').update(JSON.stringify(value)).digest('hex');
async function until(predicate, label) {
  const end = Date.now() + 120000;
  while (Date.now() < end) { if (await predicate()) return; await new Promise(resolve => setTimeout(resolve, 250)); }
  assert.fail(`Timed out: ${label}`);
}
const expectedItems = new Map(), receipts = [];
async function verifyReceipt(receipt, command, code, accepted) {
  const before = expectedItems.get(command.itemId) ?? null;
  let after = null;
  if (accepted) {
    if (command.kind === 'create') after = { id: command.itemId, title: command.title, status: 'open', assignee: null, revision: 1, lastCommandId: command.id, note: null };
    else {
      after = { ...before, revision: before.revision + 1, lastCommandId: command.id };
      if (command.kind === 'assign') after.assignee = command.assignee;
      else { after.status = command.kind === 'close' ? 'closed' : 'open'; after.note = command.note; }
    }
  }
  assert.deepEqual(receipt.command, command);
  assert.equal(receipt.id, command.id);
  assert.equal(receipt.offset, String(receipts.length));
  assert.ok(Number.isSafeInteger(receipt.at) && receipt.at >= 0);
  const result = { accepted, code, before, after };
  assert.deepEqual(receipt.result, result);
  assert.deepEqual(receipt.record, { schema: 1, at: receipt.at, command, result });
  if (accepted) expectedItems.set(command.itemId, after);
  receipts.push(receipt);
  const current = await state();
  assert.deepEqual(current.projection.items, [...expectedItems.values()]);
  assert.deepEqual(current.projection.commands, receipts);
  assert.deepEqual(current.projection.ledger, receipts.map((value, index) => ({ offset: String(index), commandId: value.id, duplicate: false })));
  assert.equal(current.projection.lastOffset, receipt.offset);
  assert.equal(current.projection.duplicates, 0);
  assert.deepEqual(await get(`/api/commands/${command.id}`), receipt);
  return receipt;
}
async function execute(command, code, accepted = true) { return verifyReceipt(await post(command, accepted ? 200 : 409), command, code, accepted); }
const create = (id, itemId, title) => ({ id, kind: 'create', itemId, title });
const assign = (id, itemId, expectedRevision, assignee) => ({ id, kind: 'assign', itemId, expectedRevision, assignee });
const transition = (id, kind, itemId, expectedRevision, note) => ({ id, kind, itemId, expectedRevision, note });
assert.equal((await get('/health')).ready, true);
const start = await state();
assert.deepEqual(start.projection, { items: [], commands: [], ledger: [], lastOffset: null, duplicates: 0 }, 'Use a fresh owned lab; this scenario appends durable records.');
await post(create('invalid-title', 'a', ' '), 400);
await post({ ...create('extra-field', 'a', 'A'), extra: true }, 400);
await post(assign('fraction', 'a', 1.5, 'Mira'), 400);
await post(create('foreign', 'a', 'A'), 403, { origin: 'http://foreign.invalid' });
await post(create('media', 'a', 'A'), 415, { 'content-type': 'text/plain' });
await send('/api/rebuild', { generation: 2 }, 400);
assert.deepEqual(await state(), start);
const first = await execute(create('create-a', 'a', 'Harbor correspondence'), 'created');
const identicalCommand = assign('assign-a', 'a', 1, 'Mira');
const concurrent = await Promise.all(Array.from({ length: 6 }, () => post(identicalCommand)));
for (const receipt of concurrent) assert.deepEqual(receipt, concurrent[0]);
await verifyReceipt(concurrent[0], identicalCommand, 'assigned', true);
const beforeConflict = await state();
await post(assign('assign-a', 'a', 1, 'Different archivist'), 409);
assert.deepEqual(await state(), beforeConflict);
await execute(transition('close-a', 'close', 'a', 2, 'Index and condition notes complete.'), 'closed');
await execute(transition('reopen-a', 'reopen', 'a', 3, 'Additional folio received.'), 'reopened');
await execute(create('create-b', 'b', 'Dock plans'), 'created');
const rejectedCommand = transition('unassigned-b', 'close', 'b', 1, 'Not yet assigned.');
const rejected = await execute(rejectedCommand, 'close-requires-assignee', false);
await execute(assign('assign-b', 'b', 1, 'Rowan'), 'assigned');
await execute(transition('close-b', 'close', 'b', 2, 'Plans indexed.'), 'closed');
await execute(assign('closed-assignment', 'b', 3, 'Mira'), 'assignment-requires-open', false);
await execute(transition('double-close', 'close', 'b', 3, 'Again.'), 'close-requires-open', false);
await execute(transition('open-reopen', 'reopen', 'a', 4, 'Already open.'), 'reopen-requires-closed', false);
await execute(assign('stale-a', 'a', 1, 'Rowan'), 'revision-conflict', false);
await execute(create('existing-a', 'a', 'Overwrite attempt'), 'item-exists', false);
await execute(transition('missing-item', 'close', 'missing', 1, 'Unknown item.'), 'item-missing', false);
await execute(transition('reopen-b', 'reopen', 'b', 3, 'Verify scale annotation.'), 'reopened');
await execute(assign('same-assignee', 'a', 4, 'Mira'), 'already-assigned', false);
const beforeRejectedRetry = await state();
assert.deepEqual(await post(rejectedCommand, 409), rejected, 'Rejection receipt must not be reevaluated against later state.');
assert.deepEqual(await post(first.command), first);
assert.deepEqual(await state(), beforeRejectedRetry);
const variants = [create('race-id', 'c', 'Chart catalog'), create('race-id', 'c', 'Alternate catalog')];
const conflicting = await Promise.all(variants.map(async command => {
  const response = await fetch(app + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(75000) });
  return { status: response.status, body: await response.json(), command };
}));
assert.deepEqual(conflicting.map(result => result.status).sort(), [200, 409]);
const winner = conflicting.find(result => result.status === 200);
await verifyReceipt(winner.body, winner.command, 'created', true);
assert.equal(conflicting.find(result => result.status === 409).body.record, undefined);
console.log('PASS: Exact accepted/rejected records, independent item revisions, duplicate races and conflicting ids.');
await run(['rpk', 'topic', 'produce', 'event-log.events.v1', '-k', first.id, '--compression', 'none'], JSON.stringify(first.record) + '\n');
await until(async () => (await state()).projection.duplicates === 1, 'real broker duplicate');
const beforeRestart = await state();
assert.deepEqual(beforeRestart.projection.items, [...expectedItems.values()]);
assert.deepEqual(beforeRestart.projection.commands, receipts);
assert.deepEqual(beforeRestart.projection.ledger, [...receipts.map((receipt, index) => ({ offset: String(index), commandId: receipt.id, duplicate: false })), { offset: String(receipts.length), commandId: first.id, duplicate: true }]);
assert.equal(beforeRestart.projection.lastOffset, String(receipts.length));
await run(['restart', 'app']);
await until(async () => { try { return (await get('/health')).ready; } catch { return false; } }, 'restart readiness');
assert.deepEqual(await state(), beforeRestart, 'Restart must reconstruct the exact projection, receipts and physical offsets.');
for (const receipt of receipts) assert.deepEqual(await get(`/api/commands/${receipt.id}`), receipt);
const beforeRebuild = await state();
const rebuilt = await send('/api/rebuild', {});
assert.equal(rebuilt.ready, true); assert.equal(rebuilt.rebuilding, false);
assert.deepEqual(rebuilt.replay, { beforeDigest: digest(beforeRebuild.projection), afterDigest: digest(beforeRebuild.projection), equal: true, records: receipts.length + 1, commands: receipts.length, lastOffset: String(receipts.length) });
const afterRebuild = await state();
assert.deepEqual(afterRebuild.projection, beforeRebuild.projection, 'Explicit rebuild must replay the actual Kafka log with no extra domain events.');
assert.deepEqual(afterRebuild.lastRebuild, rebuilt.replay);
assert.deepEqual(await post(identicalCommand), concurrent[0]);
assert.deepEqual(await post(rejectedCommand, 409), rejected);
assert.deepEqual((await state()).projection, beforeRebuild.projection);
assert.deepEqual((await send('/api/rebuild', {})).replay, rebuilt.replay, 'Repeated rebuild must not append metadata or domain events.');
assert.deepEqual((await get('/api/status')), { ready: true, rebuilding: false, stopping: false, fault: null, uncertainCommandId: null, topic: 'event-log.events.v1' });
const finalCommand = assign('across-rebuild', 'a', 4, 'Rowan');
const [queuedReceipt, queuedRebuild] = await Promise.all([post(finalCommand), send('/api/rebuild', {})]);
assert.equal(queuedRebuild.ready, true);
const priorA = expectedItems.get('a');
const finalA = { ...priorA, assignee: 'Rowan', revision: 5, lastCommandId: finalCommand.id };
assert.deepEqual(queuedReceipt.result, { accepted: true, code: 'assigned', before: priorA, after: finalA });
assert.deepEqual(queuedReceipt.command, finalCommand);
assert.equal(queuedReceipt.offset, String(receipts.length + 1));
expectedItems.set('a', finalA);
const afterConcurrentRebuild = (await state()).projection;
assert.deepEqual(afterConcurrentRebuild.items, [...expectedItems.values()]);
assert.deepEqual(afterConcurrentRebuild.commands, [...receipts, queuedReceipt]);
assert.deepEqual(afterConcurrentRebuild.ledger, [...beforeRebuild.projection.ledger, { offset: queuedReceipt.offset, commandId: finalCommand.id, duplicate: false }]);
assert.equal(afterConcurrentRebuild.duplicates, 1);
assert.equal(afterConcurrentRebuild.lastOffset, queuedReceipt.offset);
const finalReplay = await send('/api/rebuild', {});
assert.equal(finalReplay.replay.equal, true);
assert.equal(finalReplay.replay.afterDigest, digest(afterConcurrentRebuild));
assert.deepEqual((await state()).projection, afterConcurrentRebuild, 'Commands and rebuild must share one serialized owner queue.');
console.log('PASS: Real Kafka duplicate, app restart and repeated actual-log rebuild preserve exact immutable outcomes with no extra events.');
JS
