#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
APP=$("$root/labs/run" logistics urls --json | jq -er '.app')
export APP LAB_ROOT="$root"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
const app = process.env.APP;
const run = (args, input) => new Promise((resolve, reject) => {
  const child = execFile(`${process.env.LAB_ROOT}/labs/run`, ['logistics', ...args], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr })); else resolve(stdout);
  });
  child.stdin.end(input || '');
});
async function get(path) {
  const response = await fetch(app + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response.json();
}
async function post(command, expected = 200, headers = {}) {
  const response = await fetch(app + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(command), signal: AbortSignal.timeout(75000) });
  const body = await response.json();
  assert.equal(response.status, expected, JSON.stringify(body));
  return body;
}
const point = (x, y) => ({ x, y });
const request = (id, tripId, pickup = point(2, 2), destination = point(9, 9)) => ({ id, kind: 'request', tripId, pickup, destination });
const change = (id, kind, tripId) => ({ id, kind, tripId });
const location = (id, driverId, x, y) => ({ id, kind: 'location', driverId, position: point(x, y) });
const state = () => get('/api/state');
const pass = message => console.log(`PASS: ${message}`);
async function until(predicate, label) {
  const end = Date.now() + 120000;
  while (Date.now() < end) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`Timed out: ${label}`);
}
assert.equal((await get('/health')).ready, true);
const start = await state();
assert.equal(start.trips.length, 0, 'Run this destructive scenario on a newly disposed/recreated logistics lab.');
assert.equal(start.commands.length, 1);
assert.deepEqual(start.drivers.map(({ id, position, tripId }) => ({ id, position, tripId })), [
  { id: 'driver-1', position: point(2, 2), tripId: null },
  { id: 'driver-2', position: point(8, 2), tripId: null },
  { id: 'driver-3', position: point(5, 8), tripId: null },
]);
assert.notEqual(start.lastOffset, null, 'Fleet fixture must already be consumed from Kafka.');
await post({ ...location('bad-position', 'driver-1', 21, 0) }, 400);
await post({ id: 'bad-kind', kind: 'teleport' }, 400);
await post({ id: 'synthetic-grid-v1', kind: 'cancel', tripId: 'x' }, 400);
await post(request('foreign', 'foreign'), 403, { origin: 'http://foreign.invalid' });
await post(request('wrong-media', 'wrong-media'), 415, { 'content-type': 'text/plain' });
assert.deepEqual(await state(), start, 'Boundary rejection must not append or change fleet.');
pass('Synthetic fixture is logged; malformed, origin and media-type writes are rejected before append.');
const first = await post(request('assign-one', 'trip-one'));
assert.equal(first.result.effect.driverId, 'driver-1');
assert.equal((await state()).trips[0].assignedOffset, first.offset, 'HTTP success must include consumer completion.');
const beforeDuplicate = await state();
assert.deepEqual(await post(request('assign-one', 'trip-one')), first);
await post(request('assign-one', 'different-trip'), 409);
assert.deepEqual(await state(), beforeDuplicate);
const second = await post(request('assign-two', 'trip-two'));
assert.equal(second.result.effect.driverId, 'driver-2', 'Busy nearest driver must be excluded.');
const concurrent = await Promise.all(['a', 'b'].map(async suffix => {
  const response = await fetch(app + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(request(`race-${suffix}`, `race-trip-${suffix}`)), signal: AbortSignal.timeout(75000) });
  return { status: response.status, receipt: await response.json() };
}));
assert.deepEqual(concurrent.map(value => value.status).sort(), [200, 409]);
assert.equal(concurrent.find(value => value.status === 200).receipt.result.effect.driverId, 'driver-3');
const full = await state();
assert.equal(full.available, 0);
assert.equal(new Set(full.trips.map(trip => trip.driverId)).size, 3);
const noCapacity = await post(request('no-capacity', 'no-capacity-trip'), 409);
assert.equal(noCapacity.result.accepted, false);
pass('Nearest dispatch, busy exclusion, consumed receipts, id conflicts and simultaneous requests preserve one trip per driver.');
await post(change('premature-complete', 'complete', 'trip-one'), 409);
await post(change('away-pickup', 'pickup', 'trip-two'), 409);
await post(change('unknown-trip', 'pickup', 'missing'), 409);
await post(location('unknown-driver', 'missing', 0, 0), 409);
await post(change('cancel-one', 'cancel', 'trip-one'));
assert.equal((await state()).drivers.find(driver => driver.id === 'driver-1').tripId, null);
await post(change('cancel-two', 'cancel', 'trip-two'));
const tied = await post(request('tie', 'tie-trip', point(5, 2), point(9, 9)));
assert.equal(tied.result.effect.driverId, 'driver-1', 'Equidistant drivers use stable driver id order.');
assert.deepEqual(await post(request('no-capacity', 'no-capacity-trip'), 409), noCapacity, 'Rejected mutation ids keep their original result after capacity changes.');
await post(change('pickup-away', 'pickup', 'tie-trip'), 409);
await post(location('to-pickup', 'driver-1', 5, 2));
await post(change('pickup', 'pickup', 'tie-trip'));
await post(change('cancel-after-pickup', 'cancel', 'tie-trip'), 409);
await post(change('double-pickup', 'pickup', 'tie-trip'), 409);
await post(change('complete-away', 'complete', 'tie-trip'), 409);
assert.deepEqual((await state()).drivers.find(driver => driver.id === 'driver-1').position, point(5, 2), 'Trip progression must never move a driver.');
await post(location('to-destination', 'driver-1', 9, 9));
await post(change('complete', 'complete', 'tie-trip'));
await post(change('double-complete', 'complete', 'tie-trip'), 409);
assert.equal((await state()).trips.find(trip => trip.id === 'tie-trip').status, 'completed');
assert.equal((await state()).drivers.find(driver => driver.id === 'driver-1').tripId, null);
pass('Cancellation releases capacity; pickup and completion require explicit location observations and valid transitions.');
await run(['rpk', 'topic', 'produce', 'logistics.events.v1', '-k', first.id, '--compression', 'none'], JSON.stringify(first.record) + '\n');
await until(async () => (await state()).duplicates === 1, 'duplicate event consumption');
const beforeRestart = await state();
await run(['restart', 'app']);
await until(async () => {
  try { return (await get('/health')).ready; } catch { return false; }
}, 'app replay readiness');
assert.deepEqual(await state(), beforeRestart, 'Restart must reconstruct exact locations, chosen assignments, trip status, receipts and offsets.');
assert.deepEqual(await get('/api/commands/assign-one'), first);
assert.deepEqual(await post(request('assign-one', 'trip-one')), first, 'Restarted writer must return original receipt.');
assert.deepEqual(await state(), beforeRestart);
const metrics = await fetch(app + '/metrics');
assert.equal(metrics.status, 200);
assert.match(await metrics.text(), /logistics_duplicates_total 1/);
pass('Real broker duplicate is deduplicated; restart replays locations and recorded assignments without dispatching again.');
JS
