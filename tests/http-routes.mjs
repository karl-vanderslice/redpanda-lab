import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import http from 'node:http';

const base = new URL(process.argv[2]);
const scenario = process.argv[3];
const checked = new Set();
// Console's pinned upstream root rejects HEAD; owned static handlers support it.
const staticHead = scenario !== 'terraform';
const types = new Map([
  ['.html', /^text\/html\b/], ['.css', /^text\/css\b/],
  ['.js', /^(?:text|application)\/javascript\b/], ['.mjs', /^(?:text|application)\/javascript\b/],
  ['.svg', /^image\/svg\+xml\b/], ['.png', /^image\/png\b/],
  ['.mp4', /^video\/mp4\b/], ['.vtt', /^text\/vtt\b/],
]);
async function request(url, method = 'GET') {
  return fetch(url, { method, signal: AbortSignal.timeout(15000) });
}
async function resource(url, expectedType, head = true) {
  if (checked.has(url.href)) return;
  checked.add(url.href);
  const response = await request(url);
  assert.equal(response.status, 200, `GET ${url.href}`);
  const type = response.headers.get('content-type') || '';
  if (expectedType) assert.match(type, expectedType, `MIME ${url.href}`);
  const body = await response.arrayBuffer();
  if (head) {
    const metadata = await request(url, 'HEAD');
    assert.equal(metadata.status, 200, `HEAD ${url.href}`);
    assert.equal(metadata.headers.get('content-type'), type, `HEAD MIME ${url.href}`);
    assert.equal((await metadata.arrayBuffer()).byteLength, 0, `HEAD body ${url.href}`);
    if (response.headers.has('content-length')) {
      assert.equal(metadata.headers.get('content-length'), response.headers.get('content-length'), `HEAD length ${url.href}`);
    }
  }
  console.log(`PASS GET${head ? '/HEAD' : ''} ${url.href} (${type})`);
  return new TextDecoder().decode(body);
}

const html = await resource(base, /^text\/html\b/, staticHead);
// The owned pages use quoted attributes. Inspect the served document, not source files.
for (const [tag] of html.matchAll(/<(?:script|link|img|source|video|audio|track)\b[^>]*>/gi)) {
  if (/^<link\b/i.test(tag) && !/\brel=["'][^"']*\b(?:stylesheet|icon|preload)\b/i.test(tag)) continue;
  for (const [, , value] of tag.matchAll(/\b(src|href|poster)=["']([^"']+)["']/gi)) {
    const url = new URL(value, base);
    if (url.origin !== base.origin || value.startsWith('#')) continue;
    const extension = url.pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase();
    const text = await resource(url, types.get(extension), staticHead);
    if (extension !== '.css' || text === undefined) continue;
    for (const [, value] of text.matchAll(/url\(\s*["']?([^\s"')]+)["']?\s*\)/gi)) {
      const dependency = new URL(value, url);
      if (dependency.origin === base.origin && !value.startsWith('#')) {
        await resource(dependency, types.get(dependency.pathname.match(/\.[a-z0-9]+$/i)?.[0]?.toLowerCase()), staticHead);
      }
    }
  }
}

const apiPaths = scenario === 'explorer' ? ['/api/stats']
  : scenario === 'agent-messaging' ? ['/api/tasks']
    : scenario === 'event-log' ? ['/api/status', '/api/state']
      : scenario === 'terraform' ? [] : ['/api/state'];
for (const path of apiPaths) {
  const body = await resource(new URL(path, base), /^application\/(?:json|[^;]+\+json)\b/, false);
  const state = JSON.parse(body);
  if (scenario === 'explorer') {
    for (const [name, value] of Object.entries(state.links)) {
      const url = new URL(value);
      assert.equal(url.hostname, '127.0.0.1', `${name} stays on the lab's loopback listener`);
      await resource(url, name === 'registry' ? /^application\/(?:json|[^;]+\+json)\b/ : /^text\/html\b/, false);
    }
  }
  if (scenario === 'sports') {
    await resource(new URL('/sport/watchlist', base), /^text\/html\b/);
    for (const match of state.matches) {
      await resource(new URL(`/match/${encodeURIComponent(match.id)}`, base), /^text\/html\b/);
    }
  }
}

if (scenario !== 'terraform') {
  const negative = [
    [`/__missing-${randomUUID()}.js`, 404],
    ['/app.js/missing.css', 404],
    [`/${'x'.repeat(256)}.css`, 404],
    ['/%00', scenario === 'trading' ? 404 : 400],
    ['/%E0', scenario === 'trading' ? 404 : 400],
  ];
  if (scenario === 'event-log') negative.push(['/api/commands/%E0%A4%A', 400]);
  if (scenario === 'siem') negative.push(['/api/receipts/%E0%A4%A', 400], ['/api/incidents/%E0%A4%A', 400]);
  for (const [path, expected] of negative) {
    const url = new URL(path, base);
    const response = await request(url);
    assert.equal(response.status, expected, `Expected negative route GET ${url.href}`);
    await response.arrayBuffer();
    console.log(`PASS intentional ${expected} ${url.href}`);
  }
}

// A rebinding page reaches the loopback listener with a matching foreign Host
// and Origin. Fetch cannot set Host, so use the raw client.
const mutationPaths = {
  explorer: '/api/generator/stop', trading: '/api/commands', sports: '/api/events', 'agent-messaging': '/api/tasks',
  'agent-chat': '/api/conversations', bitcoin: '/api/commands', iot: '/api/readings', pos: '/api/checkouts',
  logistics: '/api/commands', 'event-log': '/api/commands', siem: '/api/telemetry', activity: '/api/commands',
  inventory: '/api/commands', clearing: '/api/transfers', jurisdictions: '/api/events',
};
if (mutationPaths[scenario]) {
  const host = `rebind.example:${base.port}`;
  const status = await new Promise((resolve, reject) => {
    const req = http.request(new URL(mutationPaths[scenario], base), {
      method: 'POST', timeout: 15000,
      headers: { host, origin: `http://${host}`, 'content-type': 'application/json' },
    }, response => { response.resume(); response.on('end', () => resolve(response.statusCode)); });
    req.on('timeout', () => req.destroy(new Error('Rebinding probe timed out')));
    req.on('error', reject);
    req.end('{}');
  });
  assert.equal(status, 403, `Rebinding origin mutation ${mutationPaths[scenario]}`);
  console.log(`PASS intentional 403 rebinding origin POST ${mutationPaths[scenario]}`);
}
