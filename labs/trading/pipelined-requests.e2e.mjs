import assert from 'node:assert/strict';
import net from 'node:net';

const base = new URL(process.argv[2]);
const id = process.argv[3];
assert.equal(base.hostname, '127.0.0.1');
assert.ok(id, 'Pass an already-recorded operation ID from the isolated trading workflow');
const read = async path => {
  const response = await fetch(new URL(path, base), { headers: { Connection: 'close' }, signal: AbortSignal.timeout(5000) });
  assert.equal(response.status, 200, path);
  return response.json();
};
const before = await read('/api/state');
const operation = await read(`/api/operations/${id}`);
assert.equal(operation.command.id, id);

// Parse one HTTP/1.1 response. tiny_http uses chunked framing for large bodies.
function parseResponse(wire, start) {
  const headerEnd = wire.indexOf('\r\n\r\n', start);
  if (headerEnd < 0) return null;
  const head = wire.subarray(start, headerEnd).toString('ascii');
  let cursor = headerEnd + 4;
  const length = head.match(/\r\nContent-Length: (\d+)/i)?.[1];
  if (length !== undefined) {
    const end = cursor + Number(length);
    return end <= wire.length ? { head, body: wire.subarray(cursor, end), end } : null;
  }
  assert.match(head, /\r\nTransfer-Encoding: chunked/i, 'Response needs explicit framing');
  const parts = [];
  for (;;) {
    const lineEnd = wire.indexOf('\r\n', cursor);
    if (lineEnd < 0) return null;
    const size = Number.parseInt(wire.subarray(cursor, lineEnd).toString('ascii'), 16);
    assert.ok(Number.isInteger(size) && size >= 0, 'Valid chunk size');
    cursor = lineEnd + 2;
    if (size === 0) {
      const trailerEnd = wire.indexOf('\r\n', cursor);
      return trailerEnd < 0 ? null : { head, body: Buffer.concat(parts), end: trailerEnd + 2 };
    }
    if (cursor + size + 2 > wire.length) return null;
    parts.push(wire.subarray(cursor, cursor + size));
    cursor += size + 2;
  }
}
// The first response exceeds the receive window. The following response must
// wait for its turn on this connection without retaining the exchange mutex.
// This needs the paused reader to stall the server's write. Before the lock
// fix, 8 MiB stalled under rootless port forwarding even with 32 MiB TCP
// autotuning limits. A host that buffers more could let the old bug pass.
const missingId = 'pipelined-missing-'.padEnd(8 * 1024 * 1024, 'a');
for (const conflict of [false, true]) {
  const command = { ...operation.command };
  if (conflict) command.quantity++;
  const body = JSON.stringify(command);
  const socket = net.createConnection({ host: base.hostname, port: Number(base.port), highWaterMark: 1 });
  const chunks = [];
  try {
    const headers = await new Promise((resolve, reject) => {
      let observed = false;
      socket.setTimeout(15000, () => socket.destroy(new Error('Pipelined response made no progress within 15 seconds')));
      socket.once('error', reject);
      socket.once('end', () => {
        if (!observed) reject(new Error('Connection ended before the first response headers'));
      });
      socket.on('data', chunk => {
        chunks.push(chunk);
        if (observed) return;
        const received = Buffer.concat(chunks);
        const end = received.indexOf('\r\n\r\n');
        if (end < 0) return;
        observed = true;
        socket.pause();
        resolve(received.subarray(0, end).toString('ascii'));
      });
      socket.once('connect', () => socket.write(
        `GET /api/operations/${missingId} HTTP/1.1\r\nHost: ${base.host}\r\nConnection: keep-alive\r\n\r\n` +
        `POST /api/commands HTTP/1.1\r\nHost: ${base.host}\r\nContent-Type: application/json\r\nContent-Length: ${Buffer.byteLength(body)}\r\nConnection: close\r\n\r\n${body}`,
      ));
    });
    assert.match(headers, /^HTTP\/1\.1 404 /);
    assert.equal((await read('/health')).ready, true, 'A paused pipelined reader must not block health');
    assert.deepEqual(await read(`/api/operations/${id}`), operation, 'The original operation remains readable while the response is blocked');

    const completed = new Promise((resolve, reject) => {
      socket.once('end', () => resolve(Buffer.concat(chunks)));
      socket.once('error', reject);
    });
    socket.resume();
    const wire = await completed;
    const first = parseResponse(wire, 0);
    assert.ok(first, 'The first pipelined response must be complete');
    assert.ok(first.body.length >= missingId.length, 'The slow-reader fixture requires a large first response');
    const second = parseResponse(wire, first.end);
    assert.ok(second, 'The second pipelined response must be complete');
    assert.match(second.head, conflict ? /^HTTP\/1\.1 409 / : /^HTTP\/1\.1 200 /);
    assert.equal(second.end, wire.length, 'No bytes may follow the second response');
    if (!conflict) assert.deepEqual(JSON.parse(second.body.toString()), operation);
  } finally {
    socket.destroy();
  }
  assert.deepEqual(await read('/api/state'), before, 'Pipelined replay or conflict must not append or alter exchange state');
  console.log(`PASS: Pipelined ${conflict ? 'conflict' : 'exact replay'} preserves health, response order and durable state under backpressure`);
}
