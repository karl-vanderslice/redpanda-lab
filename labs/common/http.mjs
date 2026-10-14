import { readFile } from 'node:fs/promises';
import { resolve, sep, extname } from 'node:path';

function httpError(status, message) { return Object.assign(new Error(message), { status }); }

export function decodePath(value) {
  let decoded;
  try { decoded = decodeURIComponent(value); } catch { throw httpError(400, 'Invalid URL'); }
  if (decoded.includes('\0')) throw httpError(400, 'Invalid URL');
  return decoded;
}

const loopbackHosts = new Set(['127.0.0.1', 'localhost', '[::1]']);

export function assertLocalMutation(req) {
  if (req.headers.origin) {
    let origin;
    try { origin = new URL(req.headers.origin); } catch { throw httpError(403, 'Invalid request origin'); }
    // Host equality alone accepts a DNS-rebinding name that resolves to loopback.
    if (origin.host !== req.headers.host || origin.protocol !== 'http:' || !loopbackHosts.has(origin.hostname)) throw httpError(403, 'Cross-origin mutations are not allowed');
  }
  if (!/^application\/json(?:\s*;|$)/i.test(req.headers['content-type'] || '')) throw httpError(415, 'Use application/json');
}

export async function readJson(req, limit = 16384) {
  const chunks = [];
  let size = 0;
  for await (const chunk of req) {
    size += chunk.length;
    if (size > limit) throw httpError(413, 'Request body is too large');
    chunks.push(chunk);
  }
  try {
    const value = JSON.parse(Buffer.concat(chunks).toString());
    if (!value || typeof value !== 'object' || Array.isArray(value)) throw new Error('object required');
    return value;
  } catch { throw httpError(400, 'Expected a JSON object'); }
}

export function sendJson(res, status, value) {
  res.writeHead(status, { 'content-type': 'application/json; charset=utf-8', 'cache-control': 'no-store', 'x-content-type-options': 'nosniff' });
  res.end(JSON.stringify(value));
}

// Media and JSON APIs have their own handlers; static roots serve only these files.
const staticTypes = { '.html': 'text/html; charset=utf-8', '.css': 'text/css; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.svg': 'image/svg+xml', '.vtt': 'text/vtt; charset=utf-8' };

export async function serveFile(req, res, publicRoot) {
  if (req.method !== 'GET' && req.method !== 'HEAD') return false;
  const pathname = decodePath(new URL(req.url, 'http://localhost').pathname);
  const root = resolve(publicRoot);
  const path = resolve(root, `.${pathname === '/' ? '/index.html' : pathname}`);
  if (!path.startsWith(root + sep)) throw httpError(403, 'Invalid file path');
  const type = staticTypes[extname(path)];
  if (!type) return false;
  let body;
  try { body = await readFile(path); } catch (error) {
    if (['ENOENT', 'EISDIR', 'ENOTDIR', 'ENAMETOOLONG'].includes(error.code)) return false;
    throw error;
  }
  res.writeHead(200, { 'content-type': type, 'content-length': body.length, 'x-content-type-options': 'nosniff' });
  res.end(req.method === 'HEAD' ? undefined : body);
  return true;
}
