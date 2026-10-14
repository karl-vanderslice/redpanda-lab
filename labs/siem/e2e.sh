#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
app=$("$root/labs/run" siem urls --json | jq -er '.app')
APP="$app" ROOT="$root" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID, createHash } from 'node:crypto';
const app = process.env.APP;
const root = process.env.ROOT;
const prefix = `e2e-${randomUUID()}`;
const base = Math.floor((Date.now() - 120000) / 60000) * 60000;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, payload, headers = {}) {
  const response = await fetch(`${app}${path}`, { method: payload === undefined ? 'GET' : 'POST', headers: payload === undefined ? headers : { 'content-type': 'application/json', ...headers }, body: payload === undefined ? undefined : typeof payload === 'string' ? payload : JSON.stringify(payload), signal: AbortSignal.timeout(65000) });
  return { status: response.status, body: await response.json() };
}
async function state() {
  const result = await request('/api/state');
  assert.equal(result.status, 200); assert.equal(result.body.ready, true); return result.body;
}
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(`${root}/labs/run`, ['siem', ...args], { timeout: 240000, maxBuffer: 8 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.message += `\n${stdout}\n${stderr}`; reject(error); } else resolve(stdout);
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); }); child.stdin.end(input);
  });
}
const initial = await state();
assert.equal(initial.topic, 'siem.events.v1');
assert.equal(initial.operations.length, 0, 'Run this scenario on a fresh disposable SIEM stack; do not erase an active log.');
assert.deepEqual(initial.rules, { windowMs: 60000, latenessMs: 30000, maxAdvanceMs: 300000, authFailures: 3, scanPorts: 4 });
const common = { sensor: `${prefix}-edge`, srcIp: '192.0.2.17', dstIp: '198.51.100.24' };
const auth = (suffix, time, extra = {}) => ({ ...common, id: `${prefix}-${suffix}`, eventTime: base + time, kind: 'auth.failure', actor: 'mira-synthetic', ...extra });
const flow = (suffix, time, dstPort, extra = {}) => ({ ...common, id: `${prefix}-${suffix}`, eventTime: base + time, kind: 'flow', dstPort, protocol: 'tcp', ...extra });
async function ingest(payload, status = 200) {
  const result = await request('/api/telemetry', payload);
  assert.equal(result.status, status, JSON.stringify(result)); return result.body;
}
function incidentId(rule, entity, start = base) {
  return `inc-${createHash('sha256').update(JSON.stringify([rule, start, ...entity])).digest('hex').slice(0, 32)}`;
}
const authId = incidentId('brute-force', [common.sensor, common.srcIp, common.dstIp, 'mira-synthetic']);
const scanId = incidentId('multi-port', [common.sensor, common.srcIp, common.dstIp, 'tcp']);
function getIncident(snapshot, id) { const found = snapshot.incidents.find(item => item.id === id); assert.ok(found, id); return found; }
const invalid = [
  { ...auth('bad-ip', 0), srcIp: '10.0.0.1' }, { ...auth('bad-id', 0), id: '../unsafe' },
  { ...auth('bad-time', 0), eventTime: '123' }, { ...auth('fraction', 0), eventTime: base + 0.5 },
  { ...auth('old', 0), eventTime: 0 }, { ...auth('future', 0), eventTime: Date.now() + 360000 },
  { ...auth('bad-kind', 0), kind: 'vendor.alert' }, { ...auth('bad-actor', 0), actor: '' },
  { ...auth('unknown-field', 0), severity: 'critical' }, { ...flow('bad-port', 0, 0) },
  { ...flow('large-port', 0, 65536) }, { ...flow('bad-protocol', 0, 443), protocol: 'icmp' },
  { ...flow('flow-actor', 0, 443), actor: 'mira' }, { ...auth('auth-port', 0), dstPort: 22 },
];
for (const value of invalid) { const result = await ingest(value, 400); assert.equal(result.outcomeUnknown, false); }
assert.equal((await request('/api/telemetry', '{bad')).status, 400);
assert.equal((await request('/api/telemetry', auth('media', 0), { 'content-type': 'text/plain' })).status, 415);
assert.equal((await request('/api/telemetry', auth('origin', 0), { origin: 'http://foreign.invalid' })).status, 403);
assert.equal((await state()).lastOffset, null);
console.log('PASS input/media/origin/future guards reject before publication');

const f1 = auth('f1', 1000);
const concurrent = await Promise.all([ingest(f1), ingest(f1)]);
assert.deepEqual(concurrent[0], concurrent[1]);
const f2 = auth('f2', 2000); await ingest(f2);
assert.equal((await state()).incidents.length, 0, 'Two failures must not reach the three-failure rule.');
// No combination across actor, source, destination or sensor boundaries.
for (const [field, value] of [['actor', 'rowan-synthetic'], ['srcIp', '203.0.113.9'], ['dstIp', '198.51.100.25'], ['sensor', `${prefix}-other-edge`]]) {
  for (let index = 0; index < 2; index += 1) await ingest(auth(`isolate-${field}-${index}`, 2200 + index * 100, { [field]: value }));
}
await ingest(auth('early-success', 2500, { kind: 'auth.success' }));
assert.equal((await state()).incidents.length, 0);
const f3 = auth('f3', 3000); const opened = await ingest(f3);
assert.equal(opened.outcome.incident.id, authId);
assert.equal(opened.outcome.incident.status, 'open'); assert.equal(opened.outcome.incident.severity, 'medium');
assert.deepEqual(opened.outcome.incident.evidence.map(item => item.eventId), [f1.id, f2.id, f3.id]);
await ingest(auth('wrong-success', 3500, { kind: 'auth.success', actor: 'rowan-synthetic' }));
assert.equal(getIncident(await state(), authId).successLinked, false);
const success = auth('linked-success', 3000, { kind: 'auth.success' });
await ingest(success); // Equal event time to the third failure is inclusive, despite later ingestion.
let snapshot = await state();
let incident = getIncident(snapshot, authId);
assert.equal(incident.severity, 'high'); assert.equal(incident.successLinked, true);
assert.deepEqual(incident.evidence.map(item => item.eventId), [f1.id, f2.id, f3.id, success.id]);
assert.equal(incident.revision, 2);
console.log('PASS authentication threshold, success linkage and entity isolation');

const ports = [flow('p22', 5000, 22), flow('p80', 6000, 80), flow('p443', 7000, 443)];
for (const observation of ports) await ingest(observation);
await ingest(flow('repeat443', 8000, 443));
assert.equal((await state()).incidents.length, 1, 'Repeated observations of three ports are not a four-port scan.');
for (const [field, value] of [['protocol', 'udp'], ['srcIp', '203.0.113.7'], ['dstIp', '198.51.100.26'], ['sensor', `${prefix}-scan-other`]]) {
  for (let index = 0; index < 3; index += 1) await ingest(flow(`scan-isolate-${field}-${index}`, 8100 + index * 100, [22, 80, 443][index], { [field]: value }));
}
assert.equal((await state()).incidents.length, 1);
const fourthPort = flow('p8080', 9000, 8080); await ingest(fourthPort);
snapshot = await state(); incident = getIncident(snapshot, scanId);
assert.deepEqual(incident.ports, [22, 80, 443, 8080]); assert.equal(incident.evidence.length, 5); assert.equal(incident.status, 'open');
console.log('PASS distinct-port threshold, repeated-port evidence and network entity isolation');

const beforeDuplicates = await state();
assert.deepEqual(await ingest(f3), opened, 'A retry returns the complete original outcome, not the current incident.');
assert.equal((await ingest({ ...f3, actor: 'different-synthetic' }, 409)).outcomeUnknown, false);
assert.deepEqual(await state(), beforeDuplicates);
const imported = { format: 'network-json', event_id: `${prefix}-adapter`, timestamp: new Date(base + 10000).toISOString(), event_type: 'connection', sensor: `${prefix}-import`, source: { ip: '203.0.113.77' }, destination: { ip: '198.51.100.24', port: 65535 }, transport: 'udp' };
const importedReceipt = await ingest(imported);
assert.deepEqual(await ingest(flow('adapter', 10000, 65535, { sensor: `${prefix}-import`, srcIp: '203.0.113.77', protocol: 'udp' })), importedReceipt);
const authImported = { format: 'network-json', event_id: `${prefix}-auth-import`, timestamp: new Date(base + 10000).toISOString(), event_type: 'authentication', sensor: `${prefix}-import`, source: { ip: '203.0.113.77' }, destination: { ip: '198.51.100.24' }, user: { name: 'rowan-synthetic' }, outcome: 'failure' };
await ingest(authImported);
await ingest({ ...imported, event_id: `${prefix}-unknown-vendor-field`, vendor_extension: true }, 400);
await ingest({ ...authImported, event_id: `${prefix}-bad-date`, timestamp: '2026-02-30T00:00:00.000Z' }, 400);
console.log('PASS immutable duplicate/conflict receipts and explicitly limited JSON adapter');

async function review(suffix, id, action, expectedRevision, status = 200) {
  const result = await request('/api/incidents/actions', { id: `${prefix}-${suffix}`, incidentId: id, action, expectedRevision, analyst: 'rowan-synthetic' });
  assert.equal(result.status, status, JSON.stringify(result)); return result.body;
}
incident = getIncident(await state(), authId);
const revision = incident.revision;
const reviewRace = await Promise.all(['ack-a', 'ack-b'].map(suffix => request('/api/incidents/actions', { id: `${prefix}-${suffix}`, incidentId: authId, action: 'acknowledge', expectedRevision: revision, analyst: 'rowan-synthetic' })));
assert.deepEqual(reviewRace.map(item => item.status).sort(), [200, 409]);
assert.equal(reviewRace.find(item => item.status === 200).body.outcome.incident.status, 'acknowledged');
assert.equal(reviewRace.find(item => item.status === 409).body.outcome.reason, 'revision-conflict');
const resolved = await review('resolve-auth', authId, 'resolve', revision + 1);
assert.equal(resolved.outcome.incident.status, 'resolved');
const f4 = auth('f4', 12000); await ingest(f4);
incident = getIncident(await state(), authId);
assert.equal(incident.status, 'open');
assert.deepEqual(incident.transitions.map(item => item.action), ['opened', 'evidence-updated', 'acknowledge', 'resolve', 'reopened-by-evidence']);
assert.equal(incident.transitions.at(-1).commandId, f4.id);
await review('resolve-scan', scanId, 'resolve', 1);
const reopened = await review('reopen-scan', scanId, 'reopen', 2);
assert.equal(reopened.outcome.incident.status, 'open'); assert.equal(reopened.outcome.incident.revision, 3);
const absent = await review('absent', 'inc-missing', 'resolve', 1, 409); assert.equal(absent.outcome.reason, 'incident-not-found');
const timeJump = await ingest(auth('time-jump', 312001), 409);
assert.equal(timeJump.outcome.reason, 'time-jump'); assert.equal(timeJump.outcome.watermarkAfter, base - 18000);
console.log('PASS serialized optimistic incident transitions, rejected commands and non-poisoning time jump');

const finalInWindow = auth('boundary-last', 59999); await ingest(finalInWindow);
const nextWindow = auth('boundary-next', 60000); await ingest(nextWindow);
const nextPort = flow('next-port', 60000, 9999); await ingest(nextPort);
snapshot = await state();
assert.equal(snapshot.incidents.length, 2, 'Next-minute observations cannot combine with previous-minute evidence.');
assert.equal(getIncident(snapshot, authId).failureCount, 5);
assert.equal(snapshot.watermark, base + 30000);
const atWatermark = auth('inclusive-watermark', 30000, { sensor: `${prefix}-late-test` });
assert.equal((await ingest(atWatermark)).outcome.accepted, true);
const late = auth('late', 29999); const lateReceipt = await ingest(late, 409);
assert.equal(lateReceipt.outcome.reason, 'late-event'); assert.equal(lateReceipt.outcome.incident, null);
const reordered = auth('reordered', 35000); await ingest(reordered);
incident = getIncident(await state(), authId);
assert.equal(incident.failureCount, 6);
assert.deepEqual(incident.evidence.map(item => item.eventId), [f1.id, f2.id, f3.id, success.id, f4.id, reordered.id, finalInWindow.id]);
assert.equal((await state()).watermark, base + 30000);
assert.deepEqual(await ingest(late, 409), lateReceipt);
console.log('PASS half-open minute windows, inclusive watermark, rejected late evidence and accepted reordering');

const fixture = await request('/api/fixtures', { id: `${prefix.slice(0, 32)}-fx`, sensor: `${prefix}-fixture`, eventTime: base + 120000 });
assert.equal(fixture.status, 200, JSON.stringify(fixture)); assert.equal(fixture.body.receipts.length, 8);
assert.ok(fixture.body.receipts.every(item => item.outcome.accepted));
snapshot = await state();
const fixtureIncidents = snapshot.incidents.filter(item => item.entity[0] === `${prefix}-fixture`);
assert.deepEqual(fixtureIncidents.map(item => [item.rule, item.severity]).sort(), [['brute-force', 'high'], ['multi-port', 'medium']]);
for (const item of snapshot.incidents) {
  const fetched = await request(`/api/incidents/${item.id}`); assert.equal(fetched.status, 200); assert.deepEqual(fetched.body, item);
  for (const evidence of item.evidence) {
    const event = await request(evidence.href); assert.equal(event.status, 200); assert.equal(event.body.command.id, evidence.eventId); assert.equal(event.body.outcome.accepted, true); assert.equal(event.body.command.eventTime, evidence.eventTime);
  }
}
const candidateA = auth('candidate-a', 128000, { sensor: `${prefix}-candidate` });
const candidateB = auth('candidate-b', 129000, { sensor: `${prefix}-candidate` });
await ingest(candidateA); await ingest(candidateB);
assert.ok(!(await state()).incidents.some(item => item.entity[0] === `${prefix}-candidate`));
const brokerRecord = await run(['rpk', 'topic', 'consume', 'siem.events.v1', '-o', importedReceipt.offset, '-n', '1', '--format', '%v\n']);
assert.deepEqual(JSON.parse(brokerRecord.trim()), importedReceipt.record, 'HTTP receipt must match real broker bytes.');
console.log('PASS fixture sequence ingests eight real records, evidence lookups and broker record equality');

const beforeBrokerDuplicate = await state();
await run(['rpk', 'topic', 'produce', 'siem.events.v1', '-k', f3.id, '--compression', 'none'], `${JSON.stringify(opened.record)}\n`);
let observed = false;
for (let attempt = 0; attempt < 80; attempt += 1) {
  snapshot = await state();
  if (snapshot.duplicates === beforeBrokerDuplicate.duplicates + 1) { observed = true; break; }
  await delay(250);
}
assert.ok(observed, 'Real Kafka duplicate was not consumed.');
assert.deepEqual(snapshot.incidents, beforeBrokerDuplicate.incidents); assert.deepEqual(snapshot.operations, beforeBrokerDuplicate.operations); assert.deepEqual(snapshot.buckets, beforeBrokerDuplicate.buckets);
assert.deepEqual((await request(`/api/receipts/${f3.id}`)).body, opened);
const beforeRestart = snapshot;
await run(['restart', 'app']);
const afterRestart = await state();
assert.deepEqual(afterRestart, beforeRestart, 'Full Kafka replay must preserve all buckets, watermark, receipts, transitions, evidence, duplicate count and offsets exactly.');
assert.deepEqual(await ingest(late, 409), lateReceipt);
const postReplay = auth('post-replay', 125000, { sensor: `${prefix}-fixture` });
await ingest(postReplay);
const afterContinuation = await state();
const continuedAuth = afterContinuation.incidents.find(item => item.entity[0] === `${prefix}-fixture` && item.rule === 'brute-force');
assert.equal(continuedAuth.failureCount, 4, 'Replay must retain correlation candidates, not only finished incidents.');
assert.ok(continuedAuth.evidence.some(item => item.eventId === postReplay.id));
const candidateC = auth('candidate-c', 130000, { sensor: `${prefix}-candidate` });
await ingest(candidateC);
const finalState = await state();
const restoredCandidate = finalState.incidents.find(item => item.entity[0] === `${prefix}-candidate`);
assert.ok(restoredCandidate, 'Previously below-threshold candidates must survive exact restart replay.');
assert.deepEqual(restoredCandidate.evidence.map(item => item.eventId), [candidateA.id, candidateB.id, candidateC.id]);
console.log('PASS real Kafka duplicate, exact restart replay and continued correlation from rebuilt state');
console.log(`SIEM E2E complete: ${prefix}, base event time ${base}, final offset ${finalState.lastOffset}`);
JS
