#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd)
APP=$("$root/labs/run" inventory urls --json | jq -er '.app')
export APP LAB_ROOT="$root"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
const app = process.env.APP;
const run = (args, input = '') => new Promise((resolve, reject) => {
  const child = execFile(`${process.env.LAB_ROOT}/labs/run`, ['inventory', ...args], { timeout: 180000, maxBuffer: 4 * 1024 * 1024 }, (error, stdout, stderr) => {
    if (error) reject(Object.assign(error, { stdout, stderr })); else resolve(stdout);
  });
  child.stdin.end(input);
});
async function get(path) {
  const response = await fetch(app + path, { signal: AbortSignal.timeout(10000) });
  assert.equal(response.status, 200, `${path}: ${response.status}`);
  return response.json();
}
async function send(command, headers = {}) {
  const response = await fetch(app + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json', ...headers }, body: JSON.stringify(command), signal: AbortSignal.timeout(75000) });
  return { status: response.status, receipt: await response.json() };
}
const state = () => get('/api/state');
const movement = (id, kind, productId = 'field-tote', locationId = 'north', units = 1, extra = {}) => ({ id, kind, productId, locationId, units, ...extra });
const terminal = (id, kind, reservationId) => ({ id, kind, reservationId });
const pass = message => console.log(`PASS: ${message}`);
const expected = new Map([
  ['north/field-tote', { onHand: 12, reserved: 0 }], ['quay/field-tote', { onHand: 8, reserved: 0 }],
  ['north/shelf-tray', { onHand: 18, reserved: 0 }], ['quay/shelf-tray', { onHand: 10, reserved: 0 }],
  ['north/packing-wrap', { onHand: 24, reserved: 0 }], ['quay/packing-wrap', { onHand: 16, reserved: 0 }],
]);
const initial = new Map([['field-tote', 20], ['shelf-tray', 28], ['packing-wrap', 40]]);
const received = new Map([...initial.keys()].map(id => [id, 0]));
const fulfilled = new Map([...initial.keys()].map(id => [id, 0]));
const reservations = new Map();
function account(command) {
  if (command.kind === 'release' || command.kind === 'fulfill') {
    const reservation = reservations.get(command.reservationId);
    assert.equal(reservation.status, 'reserved');
    const source = expected.get(`${reservation.locationId}/${reservation.productId}`);
    source.reserved -= reservation.units;
    reservation.status = command.kind === 'release' ? 'released' : 'fulfilled';
    if (command.kind === 'fulfill') { source.onHand -= reservation.units; fulfilled.set(reservation.productId, fulfilled.get(reservation.productId) + reservation.units); }
    return;
  }
  const source = expected.get(`${command.locationId}/${command.productId}`);
  if (command.kind === 'receive') { source.onHand += command.units; received.set(command.productId, received.get(command.productId) + command.units); }
  if (command.kind === 'reserve') { source.reserved += command.units; reservations.set(command.reservationId, { ...command, status: 'reserved' }); }
  if (command.kind === 'transfer') { source.onHand -= command.units; expected.get(`${command.destinationId}/${command.productId}`).onHand += command.units; }
}
async function check() {
  const snapshot = await state();
  for (const stock of snapshot.stock) {
    const wanted = expected.get(`${stock.locationId}/${stock.productId}`);
    assert.deepEqual({ onHand: stock.onHand, reserved: stock.reserved }, wanted);
    assert.equal(stock.available, stock.onHand - stock.reserved);
    assert.ok([stock.onHand, stock.reserved, stock.available].every(value => Number.isSafeInteger(value) && value >= 0));
  }
  assert.equal(snapshot.stock.length, expected.size);
  for (const productId of initial.keys()) {
    const cells = snapshot.stock.filter(value => value.productId === productId);
    const onHand = cells.reduce((sum, value) => sum + value.onHand, 0);
    const reserved = cells.reduce((sum, value) => sum + value.reserved, 0);
    assert.deepEqual(snapshot.totals.find(value => value.productId === productId), {
      productId, initial: initial.get(productId), received: received.get(productId), fulfilled: fulfilled.get(productId), onHand, reserved, available: onHand - reserved,
    });
    assert.equal(initial.get(productId) + received.get(productId), onHand + fulfilled.get(productId));
  }
  assert.equal(snapshot.reservations.length, reservations.size);
  for (const reservation of snapshot.reservations) {
    const wanted = reservations.get(reservation.id);
    assert.deepEqual({ productId: reservation.productId, locationId: reservation.locationId, units: reservation.units, status: reservation.status }, {
      productId: wanted.productId, locationId: wanted.locationId, units: wanted.units, status: wanted.status,
    });
  }
  return snapshot;
}
async function accepted(command) {
  const before = await state();
  const { status, receipt } = await send(command);
  assert.equal(status, 200, JSON.stringify(receipt));
  assert.equal(receipt.result.accepted, true);
  assert.deepEqual(receipt.command, command);
  account(command); await check();
  const after = await state();
  assert.equal(after.commands.length, before.commands.length + 1);
  assert.equal(BigInt(after.lastOffset), BigInt(before.lastOffset) + 1n, 'One complete movement must consume exactly one log record.');
  assert.deepEqual(await get(`/api/commands/${command.id}`), receipt);
  return receipt;
}
async function denied(command, reason) {
  const before = await state();
  const { status, receipt } = await send(command);
  assert.equal(status, 409, JSON.stringify(receipt));
  assert.deepEqual(receipt.result, { accepted: false, reason, effect: null });
  const after = await check();
  assert.deepEqual(after.stock, before.stock);
  assert.deepEqual(after.reservations, before.reservations);
  assert.equal(after.commands.length, before.commands.length + 1);
  assert.equal(BigInt(after.lastOffset), BigInt(before.lastOffset) + 1n);
  return receipt;
}
assert.equal((await get('/health')).ready, true);
const start = await check();
assert.equal(start.commands.length, 1, 'Run on a newly disposed/recreated inventory lab.');
assert.equal(start.lastOffset, '0');
assert.equal(start.reservations.length, 0);
assert.deepEqual(start.catalog.locations, [{ id: 'north', name: 'North warehouse' }, { id: 'quay', name: 'Quay stockroom' }]);
assert.deepEqual(start.catalog.products, [{ id: 'field-tote', name: 'Field tote', unit: 'unit' }, { id: 'shelf-tray', name: 'Shelf tray', unit: 'unit' }, { id: 'packing-wrap', name: 'Packing wrap', unit: 'roll' }]);
const fixture = await get('/api/commands/catalog-v1');
assert.deepEqual(fixture.result.effect.catalog, start.catalog);
assert.deepEqual(fixture.result.effect.stock, start.stock);
assert.deepEqual(fixture.result.effect.totals, start.totals);
for (const units of [0, -1, 1.5, 1000000001, Number.MAX_SAFE_INTEGER, '2']) assert.equal((await send(movement(`bad-${String(units).replace(/\W/g, '_')}`, 'receive', 'field-tote', 'north', units))).status, 400);
for (const command of [{ id: 'unknown-kind', kind: 'discard' }, { ...movement('extra', 'receive'), ignored: true }, { ...movement('catalog-v1', 'receive') }, { ...movement('bad-location-shape', 'receive'), locationId: '../north' }]) assert.equal((await send(command)).status, 400);
assert.equal((await send(movement('foreign', 'receive'), { origin: 'http://foreign.invalid' })).status, 403);
assert.equal((await send(movement('media', 'receive'), { 'content-type': 'text/plain' })).status, 415);
const malformed = await fetch(app + '/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: '{', signal: AbortSignal.timeout(10000) });
assert.equal(malformed.status, 400);
assert.deepEqual(await state(), start, 'Validation failures must never enter the durable log.');
pass('Catalog and exact initial stock are consumed from offset zero; shape, units, origin and media boundaries reject before publication.');
await denied(movement('unknown-product', 'receive', 'missing'), 'unknown_product');
await denied(movement('unknown-location', 'receive', 'field-tote', 'missing'), 'unknown_location');
await denied(movement('unknown-destination', 'transfer', 'field-tote', 'north', 1, { destinationId: 'missing' }), 'unknown_destination');
await denied(movement('same-location', 'transfer', 'field-tote', 'north', 1, { destinationId: 'north' }), 'same_location');
await denied(terminal('unknown-reservation', 'release', 'missing'), 'unknown_reservation');
const races = ['a', 'b'].map(suffix => movement(`race-${suffix}`, 'reserve', 'field-tote', 'north', 8, { reservationId: `race-res-${suffix}` }));
const outcomes = await Promise.all(races.map(command => send(command)));
assert.deepEqual(outcomes.map(value => value.status).sort(), [200, 409]);
const winner = outcomes.find(value => value.status === 200).receipt;
const loser = outcomes.find(value => value.status === 409).receipt;
assert.equal(loser.result.reason, 'insufficient_available');
account(winner.command); await check();
assert.equal((await state()).stock.find(value => value.locationId === 'north' && value.productId === 'field-tote').available, 4);
const beforeDuplicate = await state();
assert.deepEqual((await send(winner.command)).receipt, winner);
assert.deepEqual((await send(loser.command)).receipt, loser);
const conflict = await send({ ...winner.command, units: 7 });
assert.equal(conflict.status, 409); assert.equal(conflict.receipt.outcomeUnknown, false);
assert.deepEqual(await state(), beforeDuplicate, 'Duplicate and conflicting command ids cannot append.');
await denied(movement('reservation-id-conflict', 'reserve', 'field-tote', 'quay', 1, { reservationId: winner.command.reservationId }), 'reservation_id_exists');
await denied(movement('reserved-transfer', 'transfer', 'field-tote', 'north', 5, { destinationId: 'quay' }), 'insufficient_available');
pass('Simultaneous reservations cannot oversell. Stable accepted/rejected receipts, conflicting ids and reserved-stock transfer refusal are enforced.');
await accepted(movement('receive-two', 'receive', 'field-tote', 'north', 2));
const transfer = await accepted(movement('move-available', 'transfer', 'field-tote', 'north', 6, { destinationId: 'quay' }));
assert.equal(transfer.result.effect.stock.length, 2, 'Both transfer sides must be in one record.');
assert.equal(transfer.result.effect.stock.find(value => value.locationId === 'north').reserved, 8);
await accepted(terminal('fulfill-winner', 'fulfill', winner.command.reservationId));
await denied(terminal('double-fulfill', 'fulfill', winner.command.reservationId), 'reservation_not_active');
await denied(terminal('release-fulfilled', 'release', winner.command.reservationId), 'reservation_not_active');
await accepted(movement('reserve-release', 'reserve', 'field-tote', 'quay', 3, { reservationId: 'release-me' }));
const beforeRelease = (await state()).stock;
await accepted(terminal('release', 'release', 'release-me'));
assert.deepEqual((await state()).stock.map(value => value.onHand), beforeRelease.map(value => value.onHand));
await denied(terminal('double-release', 'release', 'release-me'), 'reservation_not_active');
await denied(terminal('fulfill-released', 'fulfill', 'release-me'), 'reservation_not_active');
await denied(movement('reuse-terminal-reservation', 'reserve', 'field-tote', 'quay', 1, { reservationId: 'release-me' }), 'reservation_id_exists');
await accepted(movement('restore-availability', 'receive', 'field-tote', 'north', 9));
const stableBefore = await state();
assert.deepEqual((await send(loser.command)).receipt, loser, 'An originally rejected command stays rejected after availability changes.');
assert.deepEqual(await state(), stableBefore);
pass('Receive, release, fulfillment and two-sided transfer preserve independent stock accounting; terminal reservation ids never reopen.');
await accepted(movement('receive-boundary', 'receive', 'shelf-tray', 'north', 1000000000 - 28));
await denied(movement('overflow', 'receive', 'shelf-tray', 'north', 1), 'lifetime_stock_limit');
await accepted(movement('boundary-transfer', 'transfer', 'shelf-tray', 'north', 1000000000 - 10, { destinationId: 'quay' }));
await denied(movement('empty-transfer', 'transfer', 'shelf-tray', 'north', 1, { destinationId: 'quay' }), 'insufficient_available');
await accepted(movement('reserve-boundary', 'reserve', 'shelf-tray', 'quay', 1000000000, { reservationId: 'boundary' }));
await denied(movement('boundary-reserved-transfer', 'transfer', 'shelf-tray', 'quay', 1, { destinationId: 'north' }), 'insufficient_available');
await accepted(terminal('fulfill-boundary', 'fulfill', 'boundary'));
await denied(movement('lifetime-limit-after-fulfill', 'receive', 'shelf-tray', 'north', 1), 'lifetime_stock_limit');
await accepted(movement('wrap-receive', 'receive', 'packing-wrap', 'quay', 1));
await accepted(movement('wrap-transfer', 'transfer', 'packing-wrap', 'quay', 17, { destinationId: 'north' }));
pass('Zero-available and integer maximum boundaries, all products, and lifetime conservation hold without negative quantities.');
async function until(predicate, label) {
  const deadline = Date.now() + 120000;
  while (Date.now() < deadline) {
    if (await predicate()) return;
    await new Promise(resolve => setTimeout(resolve, 250));
  }
  assert.fail(`Timed out: ${label}`);
}
await run(['rpk', 'topic', 'produce', 'inventory.events.v1', '-k', transfer.id, '--compression', 'none'], JSON.stringify(transfer.record) + '\n');
await until(async () => (await state()).duplicates === 1, 'real broker duplicate consumption');
const beforeRestart = await check();
assert.deepEqual(beforeRestart.catalog, start.catalog, 'Catalog and initial stock remain immutable.');
const receipts = await Promise.all(beforeRestart.commands.map(command => get(`/api/commands/${command.id}`)));
await run(['restart', 'app']);
await until(async () => { try { return (await get('/health')).ready; } catch { return false; } }, 'full replay readiness');
assert.deepEqual(await state(), beforeRestart, 'Restart must exactly reconstruct stock, reservations, catalog, accounting, receipts and offsets.');
assert.deepEqual(await Promise.all(beforeRestart.commands.map(command => get(`/api/commands/${command.id}`))), receipts);
assert.deepEqual((await send(transfer.command)).receipt, transfer);
assert.deepEqual(await state(), beforeRestart);
pass('A real Kafka duplicate cannot move stock twice. Restart replays the exact complete state and every original receipt.');
JS
