#!/usr/bin/env bash
set -euo pipefail
root=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")/../.." && pwd -P)
app=$("$root/labs/run" activity urls --json | jq -er '.app')
APP="$app" ROOT="$root" node --input-type=module <<'JS'
import assert from 'node:assert/strict';
import { execFile } from 'node:child_process';
import { randomUUID } from 'node:crypto';
const app = process.env.APP, root = process.env.ROOT, prefix = `e2e-${randomUUID()}`;
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function request(path, body, headers = {}) {
  const response = await fetch(`${app}${path}`, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? headers : { 'content-type': 'application/json', ...headers }, body: body === undefined ? undefined : typeof body === 'string' ? body : JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  return { status: response.status, body: await response.json() };
}
async function state() {
  const response = await request('/api/state'); assert.equal(response.status, 200); assert.equal(response.body.ready, true); return response.body;
}
const cmd = (suffix, fields) => ({ id: `${prefix}-${suffix}`, ...fields });
async function send(command, expected = 200) {
  const response = await request('/api/commands', command); assert.equal(response.status, expected, JSON.stringify(response.body)); return response.body;
}
function run(args, input) {
  return new Promise((resolve, reject) => {
    const child = execFile(`${root}/labs/run`, ['activity', ...args], { timeout: 240000, maxBuffer: 2 * 1024 * 1024 }, (error, stdout, stderr) => {
      if (error) { error.message += `\n${stdout}\n${stderr}`; reject(error); } else resolve(stdout);
    });
    child.stdin.on('error', error => { if (error.code !== 'EPIPE') reject(error); }); child.stdin.end(input);
  });
}
let observed = await state();
assert.equal(observed.topic, 'activity.events.v1');
const fixture = observed.operations.find(operation => operation.command.id === 'fixture-commonfield-v1');
assert.equal(fixture.accepted, true); assert.equal(fixture.command.type, 'fixture');
assert.deepEqual(fixture.data.profiles.map(profile => profile.profileId), ['cf-mara', 'cf-ellis']);
assert.deepEqual(fixture.data.posts.map(post => post.postId), ['cf-bench', 'cf-route']);
assert.ok(observed.posts.filter(post => post.fixture).every(post => post.visibility === 'public'));
const alice = `${prefix}-alice`, bob = `${prefix}-bob`, first = `${prefix}-first`, second = `${prefix}-second`;
const createAlice = cmd('create-a', { type: 'profile', profileId: alice, name: 'Fictional reader A', bio: 'Independent test reader.' });
const identical = await Promise.all([send(createAlice), send(createAlice)]); assert.deepEqual(identical[0], identical[1]);
await send(cmd('create-b', { type: 'profile', profileId: bob, name: 'Fictional reader B', bio: 'A second independent reader.' }));
const conflictProfile = await send(cmd('profile-conflict', { ...createAlice, id: `${prefix}-profile-conflict`, name: 'Another claimant' }), 409);
assert.equal(conflictProfile.accepted, false); assert.equal(conflictProfile.changed, false);
const publishFirst = cmd('publish-first', { type: 'publish', viewerId: alice, postId: first, title: 'The fictional yard notebook', summary: 'A note about a shared repair shelf.', body: 'A fictional caretaker labels a shelf for unfinished repairs.\n\nThe label describes the next useful action rather than assigning blame.', visibility: 'public' });
const firstReceipt = await send(publishFirst);
const secondReceipt = await send(cmd('publish-second', { ...publishFirst, id: `${prefix}-publish-second`, viewerId: bob, postId: second, title: 'A fictional afternoon measure' }));
assert.ok(BigInt(secondReceipt.offset) > BigInt(firstReceipt.offset));
let aFeed = (await request(`/api/feed?viewerId=${alice}`)).body;
assert.deepEqual(aFeed.posts.slice(0, 2).map(post => post.postId), [second, first]);
await send(cmd('mode-a', { type: 'feed', viewerId: alice, mode: 'following' }));
assert.deepEqual((await request(`/api/feed?viewerId=${alice}`)).body.posts, []);
const follow = cmd('follow-b', { type: 'follow', viewerId: alice, targetId: bob, following: true });
assert.equal((await send(follow)).changed, true);
assert.equal((await send(cmd('follow-b-again', { ...follow, id: `${prefix}-follow-b-again` }))).changed, false);
aFeed = (await request(`/api/feed?viewerId=${alice}`)).body;
assert.deepEqual(aFeed.posts.map(post => post.postId), [second]);
const bFeed = (await request(`/api/feed?viewerId=${bob}`)).body;
assert.equal(bFeed.viewer.mode, 'all'); assert.deepEqual(bFeed.viewer.follows, []);
assert.deepEqual(bFeed.posts.slice(0, 2).map(post => post.postId), [second, first]);
await send(cmd('unfollow-b', { type: 'follow', viewerId: alice, targetId: bob, following: false }));
assert.deepEqual((await request(`/api/feed?viewerId=${alice}`)).body.posts, []);
await send(cmd('refollow-b', { ...follow, id: `${prefix}-refollow-b` }));
const selfFollow = await send(cmd('self-follow', { type: 'follow', viewerId: alice, targetId: alice, following: true }), 409);
assert.equal(selfFollow.accepted, false);
console.log('PASS: logged authored fixture, independent reader preferences, offset ordering and set-like follows');

const like = cmd('like-a', { type: 'like', viewerId: alice, postId: second, liked: true });
const likeReceipt = await send(like);
assert.deepEqual(await send(like), likeReceipt);
assert.equal((await send(cmd('like-a-again', { ...like, id: `${prefix}-like-a-again` }))).changed, false);
await send(cmd('like-b', { ...like, id: `${prefix}-like-b`, viewerId: bob }));
observed = await state(); assert.deepEqual(observed.posts.find(post => post.postId === second).likes, [alice, bob].sort());
await send(cmd('unlike-a', { ...like, id: `${prefix}-unlike-a`, liked: false }));
assert.equal((await send(cmd('unlike-a-again', { ...like, id: `${prefix}-unlike-a-again`, liked: false }))).changed, false);
assert.deepEqual((await state()).posts.find(post => post.postId === second).likes, [bob]);
console.log('PASS: likes use explicit desired sets, retries and repeated unlikes cannot inflate counts');

// Viewing a public article without a selected reader does not create a read.
const beforeGet = await state();
const article = await request(`/api/articles/${second}`);
assert.equal(article.status, 200); assert.equal(article.body.post.body, publishFirst.body); assert.equal(article.body.readRecorded, false);
assert.equal((await state()).lastOffset, beforeGet.lastOffset);
const readA = cmd('read-a', { type: 'read', viewerId: alice, postId: second, surface: 'article' });
const readReceipt = await send(readA); assert.equal(readReceipt.data.reads, 1); assert.equal(readReceipt.data.distinctReaders, 1);
assert.deepEqual(await send(readA), readReceipt);
const readAgain = await send(cmd('read-a-new-open', { ...readA, id: `${prefix}-read-a-new-open` }));
assert.equal(readAgain.data.reads, 2); assert.equal(readAgain.data.distinctReaders, 1);
const readB = await send(cmd('read-b', { ...readA, id: `${prefix}-read-b`, viewerId: bob }));
assert.equal(readB.data.reads, 3); assert.equal(readB.data.distinctReaders, 2);
observed = await state();
let post = observed.posts.find(post => post.postId === second);
assert.equal(post.readCount, 3); assert.equal(post.distinctReaders, 2);
assert.deepEqual(post.readers, [alice, bob].sort()); assert.deepEqual(post.reads.map(read => read.id), [readA.id, readAgain.command.id, readB.command.id]);
const missing = await send(cmd('missing-article', { ...readA, id: `${prefix}-missing-article`, postId: `${prefix}-missing` }), 409);
assert.equal(missing.accepted, false); assert.equal(missing.data, null);
console.log('PASS: local article workflow, retries deduplicate read IDs, genuine new opens count separately');

const boundary = (await state()).lastOffset;
const invalid = [
  { ...like, id: `${prefix}-bool`, liked: 'true' }, { ...readA, id: `${prefix}-surface`, surface: 'feed' },
  { ...publishFirst, id: `${prefix}-private`, visibility: 'private' }, { ...publishFirst, id: `${prefix}-empty`, body: '' },
  { ...publishFirst, id: `${prefix}-large`, body: 'x'.repeat(8001) }, { ...readA, id: '../bad' },
  { ...readA, id: `${prefix}-time`, at: -1 }, { ...readA, id: `${prefix}-unknown-field`, privateMessage: 'not supported' },
  { id: `${prefix}-fixture-attack`, type: 'fixture' }, { ...readA, id: `${prefix}-viewer-null`, viewerId: null },
  { ...readA, id: `${prefix}-prototype-type`, type: '__proto__' }, { ...readA, id: `${prefix}-inherited-type`, type: 'toString' },
];
for (const value of invalid) {
  const response = await request('/api/commands', value); assert.equal(response.status, 400, JSON.stringify(response)); assert.equal(response.body.outcomeUnknown, false);
}
assert.equal((await request('/api/commands', '{not json')).status, 400);
assert.equal((await request('/api/commands', readA, { 'content-type': 'text/plain' })).status, 415);
assert.equal((await request('/api/commands', readA, { origin: 'http://foreign.invalid' })).status, 403);
assert.equal((await request('/api/commands', readA, { origin: 'null' })).status, 403);
assert.equal((await request('/api/commands', { ...readA, id: `${prefix}-huge`, extra: 'x'.repeat(17000) })).status, 413);
const conflict = await send({ ...readA, viewerId: bob }, 409); assert.equal(conflict.outcomeUnknown, false);
assert.equal((await state()).lastOffset, boundary);
assert.deepEqual((await request(`/api/commands/${readA.id}`)).body, readReceipt);
assert.equal((await request(`/api/feed?viewerId=${prefix}-missing`)).status, 404);
observed = await state();
assert.equal(observed.limitations.authentication, false); assert.equal(observed.limitations.privateMessages, false); assert.equal(observed.limitations.privatePosts, false);
// This deliberately demonstrates the limit: no token is required to act as Alice.
assert.equal((await send(cmd('public-impersonation-limit', { ...like, id: `${prefix}-public-impersonation-limit`, liked: true }))).accepted, true);
assert.equal((await request(`/api/articles/${first}`)).status, 200);
console.log('PASS: malformed input never appends; visibility is public; absence of authentication is exercised, not concealed');

observed = await state();
const beforePosts = structuredClone(observed.posts), beforeProfiles = structuredClone(observed.profiles);
await run(['rpk', 'topic', 'produce', 'activity.events.v1', '-k', readA.id, '--compression', 'none'], `${JSON.stringify({ ...readReceipt.record, at: readReceipt.record.at + 1 })}\n`);
const target = observed.duplicates + 1;
let consumed = false;
for (let attempt = 0; attempt < 60; attempt += 1) {
  observed = await state(); if (observed.duplicates === target) { consumed = true; break; } await delay(250);
}
assert.ok(consumed, 'Real broker duplicate was not consumed');
assert.deepEqual(observed.posts, beforePosts); assert.deepEqual(observed.profiles, beforeProfiles);
assert.deepEqual((await request(`/api/commands/${readA.id}`)).body, readReceipt);
const beforeRestart = observed;
await run(['restart', 'app']);
assert.deepEqual(await state(), beforeRestart, 'Full real-container replay must rebuild exact posts, preferences, read IDs, duplicate count, outcomes and offsets');
assert.deepEqual(await send(readA), readReceipt);
assert.deepEqual(await send(missing.command, 409), missing);
assert.deepEqual(await send(conflictProfile.command, 409), conflictProfile);
const postReplay = await send(cmd('read-after-replay', { ...readA, id: `${prefix}-read-after-replay` }));
assert.equal(postReplay.data.reads, 4); assert.equal(postReplay.data.distinctReaders, 2);
post = (await state()).posts.find(post => post.postId === second);
assert.equal(post.readCount, 4); assert.equal(post.distinctReaders, 2);
console.log('PASS: real Kafka duplicates preserve immutable receipts; exact replay restores all state and accepts a subsequent genuine read');
JS
