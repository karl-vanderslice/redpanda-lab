#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
app=$("$root/labs/run" clearing urls --json | jq -er '.app')
artifacts=${CLEARING_E2E_ARTIFACT_DIR:-$(mktemp -d "${TMPDIR:-/tmp}/clearing-e2e.XXXXXXXX")}
mkdir -p -- "$artifacts"
printf 'Clearing E2E evidence: %s\n' "$artifacts"
APP="$app" ROOT="$root" ARTIFACTS="$artifacts" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { writeFile } from 'node:fs/promises';
import { randomUUID } from 'node:crypto';
const prefix = `e2e-${randomUUID()}`;
const transcript = [];
const save = (name, value) => writeFile(`${process.env.ARTIFACTS}/${name}.json`, JSON.stringify(value, null, 2));
async function request(path, body, headers = {}) {
  const response = await fetch(`${process.env.APP}${path}`, { method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  const result = { status: response.status, body: await response.json() };
  transcript.push({ path, body, result });
  return result;
}
async function snapshot() {
  const response = await request('/api/state');
  assert.equal(response.status, 200); assert.equal(response.body.ready, true);
  return response.body;
}
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(`${process.env.ROOT}/labs/run`, ['clearing', ...args], { timeout: 240000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      transcript.push({ args, input, stdout, stderr, error: error?.message });
      if (error) reject(error); else resolve(stdout);
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}
let at = Date.now();
const id = suffix => `${prefix}-${suffix}`;
const transfer = (suffix, from, to, amountCents) => ({ id: id(suffix), from, to, amountCents, decisionAt: ++at });
const review = (suffix, transferId, decision) => ({ id: id(suffix), transferId, decision, reviewer: 'fixture-operator', note: 'Deliberate fixture review', decisionAt: ++at });
const clear = (suffix, transferId) => ({ id: id(suffix), transferId, decisionAt: ++at });
async function post(path, command, status = 200) {
  const response = await request(path, command);
  assert.equal(response.status, status, JSON.stringify(response));
  return response.body.operation;
}
function conservation(state) {
  assert.equal(state.totals.balanceCents, 2210000);
  assert.equal(state.totals.entryNetCents, 0);
  assert.equal(state.accounts.reduce((sum, a) => sum + a.balanceCents, 0), 2210000);
  for (const a of state.accounts) {
    assert.ok(Number.isSafeInteger(a.balanceCents) && a.balanceCents >= 0);
    assert.ok(a.reservedCents >= 0 && a.reservedCents <= a.balanceCents);
    assert.equal(a.availableCents, a.balanceCents - a.reservedCents);
    assert.equal(a.reservedCents, state.transfers.filter(t => t.from === a.id && ['held', 'approved'].includes(t.status)).reduce((sum, t) => sum + t.amountCents, 0));
    const initial = state.fixtureBalances.find(f => f.id === a.id).balanceCents;
    assert.equal(a.balanceCents, initial + state.entries.filter(e => e.accountId === a.id).reduce((sum, e) => sum + e.deltaCents, 0));
  }
  for (const t of state.transfers.filter(t => t.status === 'cleared')) {
    const entries = state.entries.filter(e => e.transferId === t.id);
    assert.deepEqual(entries.map(e => [e.accountId, e.deltaCents]), [[t.from, -t.amountCents], [t.to, t.amountCents]]);
    assert.equal(new Set(entries.map(e => e.clearingId)).size, 1);
    assert.equal(entries[0].clearingId, t.clearingId);
  }
}
try {
  let state = await snapshot();
  await save('initial', state);
  assert.equal(state.topic, 'clearing.events.v1');
  assert.equal(state.operations.length, 0, 'Use a freshly disposed clearing lab for this accounting scenario.');
  conservation(state);
  const small = transfer('small', 'operating', 'treasury', 99999);
  const duplicate = await Promise.all([post('/api/transfers', small), post('/api/transfers', small)]);
  assert.deepEqual(duplicate[0], duplicate[1]); assert.equal(duplicate[0].outcome.status, 'approved');
  const smallClear = clear('small-clear', small.id);
  const clearTwice = await Promise.all([post('/api/clearings', smallClear), post('/api/clearings', smallClear)]);
  assert.deepEqual(clearTwice[0], clearTwice[1]);
  let offset = (await snapshot()).lastOffset;
  await post('/api/transfers', { ...small, amountCents: 99998 }, 409);
  assert.equal((await snapshot()).lastOffset, offset);
  assert.deepEqual((await request(`/api/operations/${small.id}`)).body.operation, duplicate[0]);
  console.log('PASS identical concurrent transfer/clear identities and conflicting IDs');

  const lower = transfer('hold-boundary', 'operating', 'treasury', 100000);
  assert.deepEqual((await post('/api/transfers', lower)).outcome.reasons, ['amount-review']);
  await post('/api/clearings', clear('held-denied', lower.id), 409);
  const beforeRelease = (await snapshot()).accounts.find(a => a.id === 'operating');
  await post('/api/reviews', review('reject-held', lower.id, 'reject'));
  const released = (await snapshot()).accounts.find(a => a.id === 'operating');
  assert.equal(released.balanceCents, beforeRelease.balanceCents);
  assert.equal(released.availableCents, beforeRelease.availableCents + 100000);
  await post('/api/reviews', review('review-final', lower.id, 'approve'), 409);
  const upper = transfer('upper-boundary', 'treasury', 'operating', 500000);
  assert.equal((await post('/api/transfers', upper)).outcome.status, 'held');
  const approved = review('approve-held', upper.id, 'approve');
  const approval = await post('/api/reviews', approved);
  assert.deepEqual(await post('/api/reviews', approved), approval);
  const clearA = clear('race-clear-a', upper.id), clearB = { ...clear('race-clear-b', upper.id), decisionAt: at };
  clearA.decisionAt = at;
  const race = await Promise.all([request('/api/clearings', clearA), request('/api/clearings', clearB)]);
  assert.deepEqual(race.map(r => r.status).sort(), [200, 409]);
  const above = transfer('above-boundary', 'treasury', 'operating', 500001);
  assert.deepEqual((await post('/api/transfers', above, 422)).outcome.reasons, ['amount-reject']);
  console.log('PASS exact amount boundaries, held clearance denial, deliberate approval/rejection and one clearing winner');

  at += 60000;
  const watch = transfer('watch-review', 'operating', 'review', 1);
  assert.deepEqual((await post('/api/transfers', watch)).outcome.reasons, ['fixture-watchlist-review']);
  await post('/api/reviews', review('watch-reject', watch.id, 'reject'));
  const blocked = transfer('watch-block', 'operating', 'blocked', 1);
  assert.deepEqual((await post('/api/transfers', blocked, 422)).outcome.reasons, ['fixture-watchlist-block']);
  const velocity = [];
  for (let n = 1; n <= 4; n += 1) {
    const cmd = transfer(`velocity-${n}`, 'reserve', 'treasury', 100);
    velocity.push(cmd);
    const result = await post('/api/transfers', cmd);
    assert.equal(result.outcome.recentCount, n);
    assert.equal(result.outcome.status, n < 4 ? 'approved' : 'held');
    assert.deepEqual(result.outcome.reasons, [n < 4 ? 'screening-passed' : 'velocity-review']);
  }
  await post('/api/reviews', review('velocity-reject', velocity[3].id, 'reject'));
  const insufficient = transfer('insufficient', 'reserve', 'treasury', 9701);
  assert.deepEqual((await post('/api/transfers', insufficient, 422)).outcome.reasons, ['insufficient-funds']);
  const clears = velocity.slice(0, 3).map((t, n) => clear(`velocity-clear-${n}`, t.id));
  for (const cmd of clears) cmd.decisionAt = at;
  await Promise.all(clears.map(cmd => post('/api/clearings', cmd)));
  at += 60000;
  const fundsA = transfer('funds-a', 'reserve', 'treasury', 7000), fundsB = transfer('funds-b', 'reserve', 'treasury', 7000);
  fundsA.decisionAt = at; fundsB.decisionAt = at;
  const fundsRace = await Promise.all([request('/api/transfers', fundsA), request('/api/transfers', fundsB)]);
  assert.deepEqual(fundsRace.map(r => r.status).sort(), [200, 422]);
  const winner = fundsRace.find(r => r.status === 200).body.operation;
  await post('/api/clearings', clear('funds-clear', winner.command.id));
  console.log('PASS fixture watchlist, velocity boundary, hold release and concurrent overspending prevention');

  const windowFirst = transfer('window-first', 'blocked', 'operating', 1);
  assert.equal((await post('/api/transfers', windowFirst, 422)).outcome.recentCount, 1);
  for (let n = 2; n <= 3; n += 1) {
    assert.equal((await post('/api/transfers', transfer(`window-${n}`, 'blocked', 'operating', 1), 422)).outcome.recentCount, n);
  }
  at = windowFirst.decisionAt + 60000 - 1;
  const windowEdge = transfer('window-edge', 'blocked', 'operating', 1);
  assert.equal(windowEdge.decisionAt - windowFirst.decisionAt, 60000);
  assert.equal((await post('/api/transfers', windowEdge, 422)).outcome.recentCount, 3, 'A request exactly 60000 ms old is excluded; rejected requests inside the window still count.');
  console.log('PASS exact velocity window edge and rejected-attempt accounting');

  state = await snapshot(); conservation(state); offset = state.lastOffset;
  const valid = transfer('invalid-base', 'operating', 'treasury', 1);
  for (const invalid of [
    { ...valid, decisionAt: -1 }, { ...valid, decisionAt: null }, { ...valid, decisionAt: '2026-01-01' },
    { ...valid, decisionAt: 8640000000000001 }, { ...valid, decisionAt: 1.5 },
    { ...valid, amountCents: 0 }, { ...valid, amountCents: 1.1 }, { ...valid, amountCents: '1' },
    { ...valid, amountCents: Number.MAX_SAFE_INTEGER + 1 }, { ...valid, extra: true },
  ]) assert.equal((await request('/api/transfers', invalid)).status, 400);
  assert.equal((await request('/api/transfers', { ...valid, decisionAt: 0 })).status, 409);
  assert.equal((await request('/api/transfers', { ...valid, from: 'missing' })).status, 404);
  assert.equal((await request('/api/transfers', '{bad')).status, 400);
  assert.equal((await request('/api/transfers', valid, { 'content-type': 'text/plain' })).status, 415);
  assert.equal((await request('/api/transfers', valid, { origin: 'http://foreign.invalid' })).status, 403);
  assert.equal((await request('/api/reviews', { ...review('bad-review-time', lower.id, 'approve'), decisionAt: 8640000000000001 })).status, 400);
  assert.equal((await request('/api/clearings', { ...clear('bad-clear-time', small.id), decisionAt: null })).status, 400);
  assert.equal((await request('/api/reviews', { ...review('bad-review-note', lower.id, 'reject'), note: '   ' })).status, 400);
  assert.equal((await snapshot()).lastOffset, offset);
  console.log('PASS timestamps, malformed input and origin/media validation never poison the log');

  const domainBefore = { accounts: state.accounts, transfers: state.transfers, entries: state.entries, totals: state.totals, operations: state.operations };
  await run(['rpk', 'topic', 'produce', 'clearing.events.v1', '-k', small.id, '--compression', 'none'], `${JSON.stringify(duplicate[0].record)}\n`);
  let observed = false;
  for (let n = 0; n < 60; n += 1) {
    state = await snapshot();
    if (state.duplicates === 1) { observed = true; break; }
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.ok(observed, 'Real Kafka duplicate not consumed.');
  assert.deepEqual({ accounts: state.accounts, transfers: state.transfers, entries: state.entries, totals: state.totals, operations: state.operations }, domainBefore);
  conservation(state); await save('before-restart', state);
  await run(['restart', 'app']);
  const replayed = await snapshot();
  assert.deepEqual(replayed, state, 'Full log replay must preserve exact balances, holds, decisions, receipts, entries and offsets.');
  assert.deepEqual(await post('/api/transfers', above, 422), state.operations.find(o => o.command.id === above.id));
  conservation(replayed); await save('after-restart', replayed);
  console.log('PASS unchanged money under broker duplicates and exact real-container restart replay');
  await save('result', { passed: true, prefix, command: 'labs/clearing/e2e.sh' });
} catch (error) {
  await save('result', { passed: false, prefix, error: error.message, stack: error.stack });
  throw error;
} finally { await save('transcript', transcript); }
JS
