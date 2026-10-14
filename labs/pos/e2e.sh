#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
app=$("$root/labs/run" pos urls --json | jq -er '.app')
export ROOT="$root" APP="$app"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile, spawn } from 'node:child_process';
import { promisify } from 'node:util';
const exec = promisify(execFile);
const run = `${process.env.ROOT}/labs/run`, app = process.env.APP;
const prefix = `e2e-${randomUUID()}`;
const id = suffix => `${prefix}-${suffix}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function get(path) {
  const response = await fetch(app + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${path} must be available`);
  return response.json();
}
async function post(path, body, expected = 200, headers = {}) {
  const response = await fetch(app + path, { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(body), signal: AbortSignal.timeout(75000) });
  const value = await response.json();
  assert.equal(response.status, expected, `${path}: ${JSON.stringify(value)}`);
  return value;
}
async function waitFor(predicate) {
  for (let attempt = 0; attempt < 120; attempt++) {
    try { const value = await get('/api/state'); if (predicate(value)) return value; } catch { /* Restart can temporarily refuse connections. */ }
    await delay(500);
  }
  assert.fail('POS state did not reach the expected condition');
}
async function produce(key, record) {
  await new Promise((resolve, reject) => {
    const child = spawn(run, ['pos', 'rpk', 'topic', 'produce', 'pos.events.v1', '-k', key, '--compression', 'none'], { stdio: ['pipe', 'pipe', 'pipe'] });
    let errors = '';
    child.stdout.resume(); child.stderr.on('data', chunk => { errors += chunk; });
    child.on('error', reject);
    child.on('close', code => code === 0 ? resolve() : reject(new Error(`rpk produce failed (${code}): ${errors}`)));
    child.stdin.on('error', reject);
    child.stdin.end(JSON.stringify(record) + '\n');
  });
}
const before = await get('/api/state');
assert.equal(before.ready, true);
assert.equal(before.topic, 'pos.events.v1');
assert.deepEqual(before.catalog.map(item => item.priceCents), [350, 725, 225]);
const basket = [{ sku: 'coffee', quantity: 2 }, { sku: 'sandwich', quantity: 1 }, { sku: 'cookie', quantity: 3 }];
const amount = 2 * 350 + 725 + 3 * 225;
for (const [suffix, bad] of [
  ['empty', []], ['fraction', [{ sku: 'coffee', quantity: 1.5 }]], ['negative', [{ sku: 'coffee', quantity: -1 }]],
  ['zero', [{ sku: 'coffee', quantity: 0 }]], ['huge', [{ sku: 'coffee', quantity: 21 }]],
  ['unknown', [{ sku: 'unknown', quantity: 1 }]], ['duplicate', [{ sku: 'coffee', quantity: 1 }, { sku: 'coffee', quantity: 1 }]],
]) {
  const result = await post('/api/checkouts', { id: id(suffix), tender: 'cash', basket: bad }, 400);
  assert.equal(result.outcomeUnknown, false);
}
await post('/api/checkouts', { id: id('cash-source'), tender: 'cash', source: 'cnon:card-nonce-ok', basket }, 400);
await post('/api/checkouts', { id: id('client-price'), tender: 'cash', amountCents: 1, basket }, 400);
await post('/api/refunds', { id: id('missing'), checkoutId: id('no-sale') }, 404);
await post('/api/checkouts', { id: id('foreign'), tender: 'cash', basket }, 403, { origin: 'http://foreign.invalid' });
await post('/api/checkouts', { id: id('type'), tender: 'cash', basket }, 415, { 'content-type': 'text/plain' });
assert.deepEqual((await get('/api/state')).totals, before.totals);
for (const provider of ['stripe', 'square']) {
  if (!before.providers[provider].available) {
    const result = await post('/api/checkouts', { id: id(`${provider}-disabled`), tender: provider, source: before.sources[provider][0], basket }, 409);
    assert.equal(result.outcomeUnknown, false);
    assert.equal((await get('/api/state')).operations.some(operation => operation.id === id(`${provider}-disabled`)), false);
  }
}
console.log('PASS invalid baskets, integer catalog, origin/content boundaries, disabled providers and no rejected accounting effects');
const command = { id: id('sale'), tender: 'cash', basket };
const results = await Promise.all(Array.from({ length: 6 }, () => post('/api/checkouts', command)));
results.forEach(result => assert.deepEqual(result, results[0]));
const sale = results[0].operation;
assert.equal(sale.status, 'completed'); assert.equal(sale.amountCents, amount);
assert.equal(sale.lines.reduce((sum, line) => sum + line.priceCents * line.quantity, 0), amount);
await post('/api/checkouts', { ...command, basket: [{ sku: 'coffee', quantity: 1 }] }, 409);
await post('/api/refunds', { id: command.id, checkoutId: command.id }, 409);
let state = await get('/api/state');
assert.equal(state.operations.filter(operation => operation.id === command.id).length, 1);
assert.equal(state.totals.grossCents, before.totals.grossCents + amount);
assert.equal(state.totals.cashBalanceCents, before.totals.cashBalanceCents + amount);
const racingId = id('racing');
const racing = await Promise.all(['coffee', 'cookie'].map(async sku => {
  const response = await fetch(app + '/api/checkouts', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: racingId, tender: 'cash', basket: [{ sku, quantity: 1 }] }), signal: AbortSignal.timeout(75000) });
  return { code: response.status, value: await response.json() };
}));
assert.deepEqual(racing.map(result => result.code).sort(), [200, 409]);
const raceAmount = racing.find(result => result.code === 200).value.operation.amountCents;
assert.ok([350, 225].includes(raceAmount));
const refundCommand = { id: id('refund'), checkoutId: command.id };
const refunds = await Promise.all(Array.from({ length: 5 }, () => post('/api/refunds', refundCommand)));
refunds.forEach(result => assert.deepEqual(result, refunds[0]));
assert.equal(refunds[0].operation.status, 'completed'); assert.equal(refunds[0].operation.amountCents, amount);
await post('/api/refunds', { id: id('second-refund'), checkoutId: command.id }, 409);
const refundRace = await Promise.all(['one', 'two'].map(async suffix => {
  const response = await fetch(app + '/api/refunds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: id(`race-refund-${suffix}`), checkoutId: racingId }), signal: AbortSignal.timeout(75000) });
  return { code: response.status, value: await response.json() };
}));
assert.deepEqual(refundRace.map(result => result.code).sort(), [200, 409]);
state = await get('/api/state');
assert.equal(state.totals.grossCents, before.totals.grossCents + amount + raceAmount);
assert.equal(state.totals.refundedCents, before.totals.refundedCents + amount + raceAmount);
assert.equal(state.totals.netCents, before.totals.netCents);
assert.equal(state.totals.cashBalanceCents, before.totals.cashBalanceCents);
assert.equal(state.totals.salesCount, before.totals.salesCount + 2);
assert.equal(state.totals.refundsCount, before.totals.refundsCount + 2);
console.log('PASS cash cents, concurrent duplicate/conflicting IDs, one full refund reservation and receipt-ledger totals');
const records = (await get(`/api/operations/${command.id}`)).records;
await produce(command.id, records[0]);
const duplicated = await waitFor(value => value.duplicates === state.duplicates + 1);
assert.deepEqual(duplicated.totals, state.totals);
const strandedId = id('stranded');
const requested = { schema: 1, eventId: randomUUID(), operationId: strandedId, kind: 'requested', at: Date.now(),
  command: { id: strandedId, kind: 'checkout', tender: 'cash', basket: [{ sku: 'coffee', quantity: 1 }] },
  details: { lines: [{ sku: 'coffee', quantity: 1, name: 'Coffee', priceCents: 350, lineCents: 350 }], amountCents: 350, currency: 'USD', tender: 'cash' },
  scope: null, providerKey: null };
await produce(strandedId, requested);
const replayBefore = await waitFor(value => value.operations.some(operation => operation.id === strandedId));
assert.equal(replayBefore.operations.find(operation => operation.id === strandedId).status, 'pending');
assert.equal(replayBefore.totals.netCents, before.totals.netCents);
await exec(run, ['pos', 'restart', 'app'], { timeout: 120000 });
const replayAfter = await waitFor(value => value.ready);
assert.deepEqual(replayAfter, replayBefore);
const resumed = await post(`/api/operations/${strandedId}/resume`, {});
assert.equal(resumed.operation.status, 'completed');
await post('/api/refunds', { id: id('stranded-refund'), checkoutId: strandedId });
assert.equal((await get('/api/state')).totals.cashBalanceCents, before.totals.cashBalanceCents);
console.log('PASS real broker duplicate, exact restart replay, pending request without replay effects, explicit same-ID cash recovery');
const metrics = await fetch(app + '/metrics').then(response => response.text());
assert.match(metrics, /pos_cash_balance_cents /);
if (process.env.POS_SANDBOX_E2E === '1') {
  assert.equal(process.env.POS_SANDBOX_ENABLED, '1', 'Explicit sandbox authorization is required');
  const configured = await get('/api/state');
  const selected = ['stripe', 'square'].filter(provider => configured.providers[provider].available);
  assert.ok(selected.length, 'No real sandbox credentials are configured');
  for (const provider of selected) {
    if (provider === 'stripe') assert.match(process.env.STRIPE_TEST_SECRET_KEY || '', /^sk_test_[A-Za-z0-9]+$/);
    else { assert.ok(process.env.SQUARE_SANDBOX_ACCESS_TOKEN); assert.ok(process.env.SQUARE_SANDBOX_LOCATION_ID); }
    const baseline = (await get('/api/state')).totals;
    const payment = { id: id(`${provider}-sale`), tender: provider, source: configured.sources[provider][0], basket: [{ sku: 'coffee', quantity: 1 }] };
    const paid = await post('/api/checkouts', payment);
    assert.equal(paid.operation.status, 'completed'); assert.ok(paid.operation.providerId);
    assert.deepEqual(await post('/api/checkouts', payment), paid);
    const declined = await post('/api/checkouts', { ...payment, id: id(`${provider}-decline`), source: configured.sources[provider][1] }, 422);
    assert.equal(declined.operation.status, 'declined');
    const refundBody = { id: id(`${provider}-refund`), checkoutId: payment.id };
    const response = await fetch(app + '/api/refunds', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(refundBody), signal: AbortSignal.timeout(75000) });
    assert.ok([200, 202].includes(response.status), 'Sandbox refund must be completed or explicitly pending');
    const refunded = await response.json(); assert.ok(refunded.operation.providerId);
    assert.ok(['completed', 'pending'].includes(refunded.operation.status));
    assert.equal(refunded.operation.amountCents, 350);
    await post('/api/refunds', { id: id(`${provider}-second-refund`), checkoutId: payment.id }, 409);
    const providerBefore = await get('/api/state');
    assert.equal(providerBefore.totals.grossCents, baseline.grossCents + 350);
    assert.equal(providerBefore.totals.refundedCents, baseline.refundedCents + (refunded.operation.status === 'completed' ? 350 : 0));
    assert.equal(providerBefore.totals.cashBalanceCents, baseline.cashBalanceCents);
    await exec(run, ['pos', 'restart', 'app'], { timeout: 120000 });
    assert.deepEqual(await waitFor(value => value.ready), providerBefore);
    if (refunded.operation.status === 'pending') {
      const reconciledResponse = await fetch(app + `/api/operations/${refundBody.id}/resume`, { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{}', signal: AbortSignal.timeout(75000) });
      assert.ok([200, 202].includes(reconciledResponse.status));
      const reconciled = await reconciledResponse.json();
      assert.equal(reconciled.operation.providerId, refunded.operation.providerId);
      assert.equal(reconciled.operation.providerKey, refunded.operation.providerKey);
      assert.ok(['completed', 'pending'].includes(reconciled.operation.status));
    }
    console.log(`PASS real ${provider} sandbox payment, decline, full refund (${refunded.operation.status}), stable IDs and effect-free replay`);
  }
} else console.log('SKIP external sandbox calls: set POS_SANDBOX_E2E=1 with authorized real test credentials to opt in');
JS
