#!/usr/bin/env bash
set -euo pipefail
root=$(realpath "$(dirname "${BASH_SOURCE[0]}")/../..")
APP=$("$root/labs/run" jurisdictions urls --json | jq -er .app)
export APP LAB_ROOT="$root"
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
const app = process.env.APP;
const execute = promisify(execFile);
const lifecycle = async (...args) => {
  const result = await execute(`${process.env.LAB_ROOT}/labs/run`, ['jurisdictions', ...args], { encoding: 'utf8', timeout: 240000 });
  return result.stdout;
};
const request = async (path, options = {}) => {
  const response = await fetch(app + path, { ...options, signal: AbortSignal.timeout(20000) });
  return { status: response.status, body: await response.json() };
};
const state = async () => { const result = await request('/api/state'); assert.equal(result.status, 200); return result.body; };
const eventually = async (predicate, description) => {
  const deadline = Date.now() + 90000;
  let last;
  while (Date.now() < deadline) {
    last = await state();
    if (predicate(last)) return last;
    await new Promise((resolve) => setTimeout(resolve, 300));
  }
  assert.fail(`${description}: ${JSON.stringify(last)}`);
};
const post = (input) => request('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input) });
const fixtures = [];
let expectedCount = 0, expectedTotal = 0;
const publish = async (tenantId, amount) => {
  const input = { id: randomUUID(), tenantId, amount, privateNote: `PRIVATE_${tenantId}_${randomUUID()}` };
  let result = await post(input);
  assert([200, 202].includes(result.status), JSON.stringify(result));
  const tenant = (await state()).tenants.find((item) => item.id === tenantId);
  for (let i = 0; i < 100 && result.body.status !== 'completed'; i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    result = await request(`/api/operations/${tenant.region}/${input.id}`);
  }
  assert.equal(result.body.status, 'completed', JSON.stringify(result));
  assert.equal(result.body.partition, tenant.partition);
  assert.equal(result.body.event.region, tenant.region);
  assert.match(result.body.offset, /^\d+$/);
  fixtures.push({ input, tenant, operation: result.body }); expectedCount += 1; expectedTotal += amount;
  return fixtures.at(-1);
};
const caughtUp = () => eventually((state) => state.global.ready && state.global.summaries.reduce((sum, item) => sum + item.count, 0) === expectedCount && state.global.summaries.reduce((sum, item) => sum + item.totalAmount, 0) === expectedTotal, 'Summary export did not converge');
const initial = await state();
assert.equal(initial.tenants.length, 7);
assert(initial.regions.every((item) => item.ready && item.brokerAvailable));
for (const tenant of initial.tenants) await publish(tenant.id, 100 + expectedCount);
const first = fixtures[0];
const second = await publish(first.tenant.id, 37);
assert(BigInt(second.operation.offset) > BigInt(first.operation.offset), 'Same tenant must have increasing offsets in its fixed shard');
const duplicate = await post(first.input);
assert.equal(duplicate.status, 200);
assert.equal(duplicate.body.offset, first.operation.offset);
assert.equal((await post({ ...first.input, amount: 999 })).status, 409);
assert.equal((await post({ ...first.input, id: randomUUID(), requestedRegion: 'us' })).status, 409);
assert.equal((await post({ ...first.input, id: randomUUID(), tenantId: 'unknown' })).status, 400);
const concurrentId = randomUUID();
const competing = [401, 402, 403, 404].map((amount) => ({ id: concurrentId, tenantId: first.tenant.id, amount, privateNote: 'Synthetic concurrent fixture' }));
const concurrent = await Promise.all(competing.map(post));
assert.equal(concurrent.filter((item) => item.status === 409).length, 3, JSON.stringify(concurrent));
const winnerIndex = concurrent.findIndex((item) => item.status === 200 || item.status === 202);
assert(winnerIndex >= 0, JSON.stringify(concurrent));
await eventually((state) => state.regions.find((item) => item.region === first.tenant.region).records.some((item) => item.event.id === concurrentId && item.status === 'completed'), 'Concurrent winner did not apply');
const winner = await request(`/api/operations/${first.tenant.region}/${concurrentId}`);
assert.equal(winner.body.event.amount, competing[winnerIndex].amount);
fixtures.push({ input: competing[winnerIndex], tenant: first.tenant, operation: winner.body });
expectedCount += 1; expectedTotal += competing[winnerIndex].amount;
const foreign = await request('/api/events', { method: 'POST', headers: { 'content-type': 'application/json', Origin: 'https://untrusted.example' }, body: JSON.stringify(first.input) });
assert.equal(foreign.status, 403);
const direct = await lifecycle('exec', 'region-us', 'node', '--input-type=module', '-e', `const r=await fetch('http://region-us:3000/api/events',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(${JSON.stringify({ ...first.input, id: randomUUID() })})}); console.log(r.status);`);
assert.match(direct, /409/);
await caughtUp();
for (const target of ['eu', 'us', 'apac', 'global']) {
  const topic = target === 'global' ? 'jurisdictions.summaries.v1' : 'jurisdictions.records.v1';
  const describe = await lifecycle('rpk', target, 'topic', 'describe', topic, '--format', 'json');
  assert.equal(JSON.parse(describe)[0].summary.partitions, 3);
  if (target !== 'global') assert.equal(JSON.parse(describe)[0].partitions.reduce((sum, item) => sum + item.high_watermark, 0), fixtures.filter((item) => item.tenant.region === target).length, 'Rejected and repeated commands must not append records');
  const topics = await lifecycle('rpk', target, 'topic', 'list', '--format', 'json');
  assert(!JSON.parse(topics).some((item) => item.name === (target === 'global' ? 'jurisdictions.records.v1' : 'jurisdictions.summaries.v1')));
}
for (const target of ['eu', 'us', 'apac']) {
  const raw = await lifecycle('rpk', target, 'topic', 'consume', 'jurisdictions.records.v1', '-n', String(fixtures.filter((item) => item.tenant.region === target).length), '--format', '%v\n');
  const records = raw.trim().split('\n').map(JSON.parse);
  assert(records.every((event) => event.region === target));
  for (const fixture of fixtures.filter((item) => item.tenant.region === target)) assert(records.some((event) => event.id === fixture.input.id && event.privateNote === fixture.input.privateNote));
}
const isolation = await lifecycle('exec', 'global', 'node', '--input-type=module', '-e', "import dns from 'node:dns/promises'; try {await dns.lookup('broker-eu');process.exit(1);}catch(error){if(!['ENOTFOUND','EAI_AGAIN'].includes(error.code))throw error;console.log('regional broker not resolvable');}");
assert.match(isolation, /not resolvable/);
console.log('PASS: fixed residency, three-partition topics, tenant ordering, idempotency, invalid/wrong-region rejection, origin boundary, raw broker placement and global network separation');
await lifecycle('outage', 'eu');
await eventually((state) => !state.regions.find((item) => item.region === 'eu').brokerAvailable, 'EU outage not observable');
const refused = { ...first.input, id: randomUUID() };
const rejected = await post(refused);
assert.equal(rejected.status, 503); assert.equal(rejected.body.outcome, 'not-attempted');
await publish('new-york-shop', 251); await publish('singapore-shop', 252);
await caughtUp();
await lifecycle('recover', 'eu');
await publish('berlin-shop', 253); await caughtUp();
assert.equal((await request(`/api/operations/eu/${refused.id}`)).status, 404);
console.log('PASS: regional outage refuses home-region writes without failover; other jurisdictions continue; recovery resumes EU');
await lifecycle('outage', 'global');
await publish('paris-shop', 301); await publish('tokyo-shop', 302);
await eventually((state) => state.regions.some((item) => item.federation === 'unavailable'), 'Global outage not visible to exporter');
await lifecycle('recover', 'global');
const beforeRestart = await caughtUp();
const regionalView = (state) => state.regions.map((item) => ({ region: item.region, shards: item.shards, records: item.records.toSorted((a,b) => a.event.id.localeCompare(b.event.id)) }));
await lifecycle('restart', 'region-eu');
await lifecycle('restart', 'global');
const afterRestart = await caughtUp();
assert.deepEqual(regionalView(afterRestart), regionalView(beforeRestart));
assert.deepEqual(afterRestart.global.summaries.toSorted((a,b) => `${a.region}:${a.partition}`.localeCompare(`${b.region}:${b.partition}`)), beforeRestart.global.summaries.toSorted((a,b) => `${a.region}:${a.partition}`.localeCompare(`${b.region}:${b.partition}`)));
const duplicateAfterReplay = await post(first.input);
assert.equal(duplicateAfterReplay.body.offset, first.operation.offset);
const globalMetadata = JSON.parse(await lifecycle('rpk', 'global', 'topic', 'describe', 'jurisdictions.summaries.v1', '--format', 'json'))[0];
const exportCount = globalMetadata.partitions.reduce((sum, item) => sum + item.high_watermark, 0);
const rawGlobal = await lifecycle('rpk', 'global', 'topic', 'consume', 'jurisdictions.summaries.v1', '-n', String(exportCount), '--format', '%v\n');
const exported = rawGlobal.trim().split('\n').map(JSON.parse);
for (const value of [...exported, ...afterRestart.global.summaries]) assert.deepEqual(Object.keys(value).sort(), ['region','partition','sourceOffset','count','totalAmount'].sort());
for (const fixture of fixtures) { assert(!rawGlobal.includes(fixture.input.privateNote)); assert(!rawGlobal.includes(fixture.input.tenantId)); }
console.log(`PASS: global outage preserves local writes, export catch-up, regional/global replay and snapshot deduplication (${expectedCount} records, ${expectedTotal} units); global broker records use only the five-field export schema`);
JS
