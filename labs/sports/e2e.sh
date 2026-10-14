#!/usr/bin/env bash
set -euo pipefail
root=$(realpath "$(dirname "${BASH_SOURCE[0]}")/../..")
APP=$("$root/labs/run" sports urls --json | jq -er .app)
export APP
scratch=$(mktemp -d)
export SPORTS_EVIDENCE_DIR="$scratch"
trap 'rm -rf -- "$scratch"' EXIT
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFile } from 'node:fs/promises';
import { spawnSync } from 'node:child_process';
const app = process.env.APP;
const viewerId = `e2e_${randomUUID()}`;
const request = async (path, options = {}) => {
  const response = await fetch(app + path, { ...options, signal: AbortSignal.timeout(10000) });
  assert(response.ok, `HTTP ${response.status} ${path}: ${await (response.ok ? Promise.resolve('') : response.text())}`);
  return response.json();
};
const state = () => request(`/api/state?viewer=${viewerId}`);
const publish = async (event, expected = 'completed') => {
  const input = { id: `e2e_${randomUUID()}`, ...event };
  let operation = await request('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(input) });
  for (let i = 0; i < 100 && ['pending', 'unknown'].includes(operation.status); i += 1) {
    await new Promise((resolve) => setTimeout(resolve, 200));
    operation = await request(`/api/operations/${input.id}`);
  }
  assert.equal(operation.status, expected, JSON.stringify(operation));
  assert.equal(operation.partition, 0);
  assert.match(String(operation.offset), /^\d+$/);
  return input;
};
assert.equal((await request('/health')).ready, true);
const initial = await state();
assert.equal(initial.sports.length, 4);
assert.equal(initial.matches.length, 5);
for (const sport of initial.sports) {
  const page = await fetch(`${app}/sport/${sport.id}`);
  assert.equal(page.status, 200);
  const range = await fetch(`${app}/media/${sport.id}.mp4`, { headers: { Range: 'bytes=0-31' } });
  assert.equal(range.status, 206);
  assert.match(range.headers.get('content-type'), /video\/mp4/);
  assert.match(range.headers.get('content-range'), /^bytes 0-31\/\d+$/);
  const prefix = Buffer.from(await range.arrayBuffer());
  assert.equal(prefix.length, 32);
  assert.equal(prefix.toString('ascii', 4, 8), 'ftyp');
  const response = await fetch(`${app}/media/${sport.id}.mp4`);
  assert.equal(response.status, 200);
  const file = `${process.env.SPORTS_EVIDENCE_DIR}/${sport.id}.mp4`;
  await writeFile(file, Buffer.from(await response.arrayBuffer()));
  const probe = spawnSync('ffprobe', ['-v', 'error', '-show_streams', '-show_format', '-of', 'json', file], { encoding: 'utf8' });
  assert.equal(probe.status, 0, probe.stderr);
  const media = JSON.parse(probe.stdout);
  assert(media.streams.some((stream) => stream.codec_name === 'h264' && stream.width === 960 && stream.height === 540));
  assert(Number(media.format.duration) >= 17.9);
  const decode = spawnSync('ffmpeg', ['-v', 'error', '-nostdin', '-i', file, '-t', '1', '-f', 'null', '-'], { encoding: 'utf8' });
  assert.equal(decode.status, 0, decode.stderr);
  const match = initial.matches.find((item) => item.sport === sport.id);
  const event = await publish({ kind: 'score', matchId: match.id, side: 'home', delta: sport.increments[0], expectedRevision: match.revision });
  const scored = (await state()).matches.find((item) => item.id === match.id);
  assert.equal(scored.homeScore, match.homeScore + sport.increments[0]);
  assert.equal(scored.revision, match.revision + 1);
  await publish(event); // Same operation ID must not add another score.
  assert.equal((await state()).matches.find((item) => item.id === match.id).homeScore, scored.homeScore);
  await publish({ kind: 'score', matchId: match.id, side: 'away', delta: sport.increments[0], expectedRevision: match.revision }, 'error');
}
console.log('PASS: four sport routes, local MP4 range/content/decoding, consumed scores, idempotency, stale revision rejection');
const preferenceMatch = initial.matches.find((item) => item.id === 'rillgate-court');
assert(preferenceMatch, 'Expected the authored second basketball fixture');
const matchId = preferenceMatch.id;
await publish({ kind: 'follow', matchId, viewerId, side: 'home', enabled: true });
await publish({ kind: 'watchlist', matchId, viewerId, enabled: true });
for (const kind of ['play', 'heartbeat', 'pause']) await publish({ kind, matchId, viewerId, position: 3 });
const current = await state();
assert(current.viewer.follows.includes(preferenceMatch.home));
assert(current.viewer.watchlist.includes(matchId));
assert.equal(current.viewer.playback[matchId].playing, false);
assert.equal(current.viewer.playback[matchId].lastKind, 'pause');
assert(current.metrics.play >= initial.metrics.play + 1);
assert(current.metrics.heartbeat >= initial.metrics.heartbeat + 1);
assert(current.metrics.pause >= initial.metrics.pause + 1);
await publish({ kind: 'follow', matchId, viewerId, side: 'away', enabled: true });
await publish({ kind: 'follow', matchId, viewerId, side: 'away', enabled: false });
assert(!(await state()).viewer.follows.includes(preferenceMatch.away));
const invalid = await fetch(`${app}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: `e2e_${randomUUID()}`, kind: 'score', matchId: 'bracken-rink', side: 'home', delta: 3 }) });
assert.equal(invalid.status, 400);
const forbidden = await fetch(`${app}/api/events`, { method: 'POST', headers: { 'Content-Type': 'application/json', Origin: 'https://untrusted.example' }, body: '{}' });
assert.equal(forbidden.status, 403);
const metrics = await fetch(app + '/metrics');
assert.equal(metrics.status, 200);
assert.match(await metrics.text(), /sports_heartbeat_total [1-9]\d*/);
const stream = await fetch(`${app}/api/feed?viewer=${viewerId}`, { signal: AbortSignal.timeout(5000) });
assert.match(stream.headers.get('content-type'), /text\/event-stream/);
const reader = stream.body.getReader();
const first = new TextDecoder().decode((await reader.read()).value);
assert.match(first, /event: state/);
await reader.cancel();
await writeFile(`${process.env.SPORTS_EVIDENCE_DIR}/expected.json`, JSON.stringify({ viewerId, matches: (await state()).matches, viewer: (await state()).viewer }));
console.log('PASS: consumed follow/watchlist/play/heartbeat/pause, unsubscribe, validation, origin boundary, metrics, SSE');
JS
"$root/labs/run" sports restart app
node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
const expected = JSON.parse(await readFile(`${process.env.SPORTS_EVIDENCE_DIR}/expected.json`, 'utf8'));
let ready = false;
for (let i = 0; i < 120; i += 1) {
  try { const response = await fetch(process.env.APP + '/health', { signal: AbortSignal.timeout(2000) }); ready = response.ok && (await response.json()).ready; } catch { ready = false; }
  if (ready) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}
assert(ready, 'App did not become ready after replay');
const response = await fetch(`${process.env.APP}/api/state?viewer=${expected.viewerId}`, { signal: AbortSignal.timeout(10000) });
assert(response.ok);
const state = await response.json();
assert.deepEqual(state.matches, expected.matches);
assert.deepEqual(state.viewer, expected.viewer);
console.log('PASS: application restart replays scores, preferences and viewer telemetry from Redpanda');
JS
