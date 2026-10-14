#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
app=$("$root/labs/run" iot urls --json | jq -er '.app')
APP="$app" ROOT="$root" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const app = process.env.APP;
const root = process.env.ROOT;
const prefix = `e2e-${randomUUID()}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, body, headers = {}) {
  const response = await fetch(`${app}${path}`, {
    method: body === undefined ? 'GET' : 'POST',
    headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers },
    body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body),
    signal: AbortSignal.timeout(65000),
  });
  return { status: response.status, body: await response.json() };
}
async function getState() {
  const response = await request('/api/state');
  assert.equal(response.status, 200);
  assert.equal(response.body.ready, true);
  return response.body;
}
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(`${root}/labs/run`, ['iot', ...args], { timeout: 240000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.message += `\n${stdout}\n${stderr}`; reject(error); }
      else resolve(stdout);
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); });
    child.stdin.end(input);
  });
}
const initial = await getState();
assert.equal(initial.topic, 'iot.events.v1');
assert.deepEqual(initial.devices.map(device => device.id).sort(), ['cooler-1', 'dock-1', 'freezer-1']);
const fixture = initial.devices.find(device => device.id === 'freezer-1');
assert.equal(fixture.minC, -25);
assert.equal(fixture.maxC, -15);
assert.equal(fixture.lowBatteryBelow, 20);
const base = fixture.last?.sequence || 0;
const command = (suffix, sequence, temperatureC = -20, batteryPercent = 90) => ({ id: `${prefix}-${suffix}`, deviceId: fixture.id, sequence, temperatureC, batteryPercent });
async function post(command, status = 200) {
  const response = await request('/api/readings', command);
  assert.equal(response.status, status, JSON.stringify(response.body));
  return response.body;
}
const normal = command('normal', base + 1);
const normalResults = await Promise.all([post(normal), post(normal)]);
assert.deepEqual(normalResults[0], normalResults[1]);
let state = await getState();
let device = state.devices.find(device => device.id === fixture.id);
assert.deepEqual(device.activeAlerts, { temperature: null, battery: null });
assert.equal(state.operations.filter(operation => operation.command.id === normal.id).length, 1);
console.log('PASS: concurrent identical IDs return one consumed outcome and one reading');

const high = command('high', base + 2, -10, 10);
const highResult = await post(high);
assert.deepEqual(highResult.alerts.map(alert => [alert.type, alert.action]), [['temperature', 'opened'], ['battery', 'opened']]);
state = await getState();
const offset = state.lastOffset;
assert.deepEqual(await post(high), highResult);
const conflict = await post({ ...high, temperatureC: -9 }, 409);
assert.equal(conflict.outcomeUnknown, false);
assert.equal((await getState()).lastOffset, offset);
const lookup = await request(`/api/readings/${high.id}`);
assert.equal(lookup.status, 200);
assert.deepEqual(lookup.body, highResult);
console.log('PASS: stable receipt lookup, duplicate and conflicting IDs preserve readings and alerts');

const invalid = [
  [{ ...command('unknown', base + 3), deviceId: 'missing' }, 404],
  [{ ...command('string', base + 3), temperatureC: '4' }, 400],
  [{ ...command('null', base + 3), temperatureC: null }, 400],
  [{ ...command('hot-range', base + 3), temperatureC: 101 }, 400],
  [{ ...command('battery-range', base + 3), batteryPercent: -1 }, 400],
  [{ ...command('battery-null', base + 3), batteryPercent: null }, 400],
  [{ ...command('fraction', base + 3), sequence: 1.5 }, 400],
  [{ ...command('zero', base + 3), sequence: 0 }, 400],
  [{ ...command('unsafe', base + 3), sequence: Number.MAX_SAFE_INTEGER + 1 }, 400],
  [{ ...command('id', base + 3), id: '../bad' }, 400],
];
for (const [body, status] of invalid) {
  const response = await request('/api/readings', body);
  assert.equal(response.status, status, JSON.stringify(response));
  assert.equal(response.body.outcomeUnknown, false);
}
assert.equal((await request('/api/readings', '{bad json')).status, 400);
for (const field of ['temperatureC', 'batteryPercent']) {
  const overflow = JSON.stringify(command(`overflow-${field}`, base + 3)).replace(`"${field}":${field === 'temperatureC' ? -20 : 90}`, `"${field}":1e999`);
  const response = await request('/api/readings', overflow);
  assert.equal(response.status, 400);
  assert.equal(response.body.outcomeUnknown, false);
}
assert.equal((await request('/api/readings', command('media', base + 3), { 'content-type': 'text/plain' })).status, 415);
assert.equal((await request('/api/readings', command('origin', base + 3), { origin: 'http://foreign.invalid' })).status, 403);
assert.equal((await request('/api/readings', command('origin-null', base + 3), { origin: 'null' })).status, 403);
assert.equal((await getState()).lastOffset, offset);
console.log('PASS: range/type/sequence/device/ID validation and origin boundary reject before appending');

const repeatedHigh = await post(command('still-high', base + 3, -9, 5));
assert.deepEqual(repeatedHigh.alerts, []);
const clear = await post(command('clear', base + 4, -15, 20));
assert.deepEqual(clear.alerts.map(alert => [alert.type, alert.action]), [['temperature', 'closed'], ['battery', 'closed']]);
state = await getState();
for (const change of highResult.alerts) {
  const alert = state.alerts.find(alert => alert.id === change.alertId);
  assert.equal(alert.closedBy, clear.command.id);
  assert.equal(alert.closedOffset, clear.offset);
}
const tooCold = await post(command('too-cold', base + 5, -26));
assert.deepEqual(tooCold.alerts.map(alert => [alert.type, alert.action]), [['temperature', 'opened']]);
const stale = command('stale', base + 4, -20, 90);
const staleResult = await post(stale, 409);
assert.equal(staleResult.accepted, false);
assert.deepEqual(staleResult.alerts, []);
assert.equal(staleResult.lastSequence, base + 5);
state = await getState();
device = state.devices.find(device => device.id === fixture.id);
assert.equal(device.last.sequence, base + 5);
assert.equal(device.activeAlerts.temperature, tooCold.alerts[0].alertId);
const clearCold = await post(command('clear-cold', base + 6, -25));
assert.deepEqual(clearCold.alerts.map(alert => [alert.type, alert.action]), [['temperature', 'closed']]);
const lowBattery = await post(command('low-battery', base + 7, -20, 19.9));
assert.deepEqual(lowBattery.alerts.map(alert => [alert.type, alert.action]), [['battery', 'opened']]);
const clearBattery = await post(command('clear-battery', base + 8, -20, 20));
assert.deepEqual(clearBattery.alerts.map(alert => [alert.type, alert.action]), [['battery', 'closed']]);
assert.deepEqual(await post(stale, 409), staleResult);
console.log('PASS: alerts open once, clear at inclusive thresholds, reopen as new incidents; stale receipts cannot clear alerts');

const raceA = command('race-a', base + 9, -10, 10);
const raceB = command('race-b', base + 9, -10, 10);
const race = await Promise.all([request('/api/readings', raceA), request('/api/readings', raceB)]);
assert.deepEqual(race.map(response => response.status).sort(), [200, 409]);
state = await getState();
device = state.devices.find(device => device.id === fixture.id);
assert.equal(device.last.sequence, base + 9);
assert.ok(device.activeAlerts.temperature);
assert.ok(device.activeAlerts.battery);
assert.equal(race.filter(response => response.body.accepted).length, 1);
console.log('PASS: racing sequence claims accept one reading and leave both derived alerts open');

// A retry may acquire a different gateway timestamp; the stable telemetry identity still owns one outcome.
const devicesBeforeDuplicate = structuredClone(state.devices);
await run(['rpk', 'topic', 'produce', 'iot.events.v1', '-k', high.id, '--compression', 'none'], `${JSON.stringify({ ...highResult.record, at: highResult.record.at + 1 })}\n`);
const duplicateTarget = state.duplicates + 1;
let observedDuplicate = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  state = await getState();
  if (state.duplicates === duplicateTarget) { observedDuplicate = true; break; }
  await delay(250);
}
assert.ok(observedDuplicate, 'broker duplicate was not consumed');
assert.deepEqual(state.devices, devicesBeforeDuplicate, 'A duplicate broker event must not change telemetry or alert state.');
assert.deepEqual((await request(`/api/readings/${high.id}`)).body, highResult);
const beforeRestart = state;
await run(['restart', 'app']);
const afterRestart = await getState();
assert.deepEqual(afterRestart, beforeRestart, 'Kafka-only replay must preserve exact devices, alerts, receipts and offsets');
assert.deepEqual(await post(stale, 409), staleResult);
assert.deepEqual(await post(high), highResult);
console.log('PASS: real broker duplicate preserves the first outcome; restart rebuilds open/closed alerts and rejection receipts exactly');
const final = await post(command('final-clear', base + 10));
assert.deepEqual(final.alerts.map(alert => [alert.type, alert.action]), [['temperature', 'closed'], ['battery', 'closed']]);
assert.deepEqual((await getState()).devices.find(device => device.id === fixture.id).activeAlerts, { temperature: null, battery: null });
console.log('PASS: replayed open alerts clear from a new accepted reading');
JS
