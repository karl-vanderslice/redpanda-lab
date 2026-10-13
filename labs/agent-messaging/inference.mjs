import http from 'node:http';
import { mkdir, writeFile } from 'node:fs/promises';
import { spawn } from 'node:child_process';
import { pipeline } from 'node:stream/promises';
import { Readable } from 'node:stream';
import { readJson, sendJson } from '../common/http.mjs';

const home = '/tmp/fx-home';
const workspace = '/tmp/fx-workspace';
const model = 'lab-small';
const modelUrl = new URL(process.env.MODEL_URL || 'http://model:8080/v1');
// A relay is not a general forward proxy: one internal service, no redirects,
// one completion path, loopback listener only, no forwarded credentials.
if (modelUrl.href !== 'http://model:8080/v1') throw new Error('MODEL_URL must be the confined model service http://model:8080/v1');

export async function startInference() {
  await mkdir(`${home}/.fx`, { recursive: true, mode: 0o700 });
  await mkdir(workspace, { recursive: true, mode: 0o700 });
  await writeFile(`${home}/.fx/settings.json`, JSON.stringify({
    provider: 'local', models: { local: model }, permission_mode: 'ask',
    permission: { '*': 'deny' }, first_call_tool_choice: 'none',
    max_agent_steps: 1, context: false, session_titles: false, auto_upgrade: false,
    providers: { local: {
      protocol: 'openai-chat-completions', base_url: 'http://127.0.0.1:18080/v1',
      auth: { type: 'none' }, model_metadata: {
        [model]: { context_window: 8192, max_output_tokens: 256, supports_tool_use: false, supports_vision: false },
      },
    } },
  }), { mode: 0o600 });
  const relay = http.createServer(async (req, res) => {
    try {
      if (req.method !== 'POST' || req.url !== '/v1/chat/completions') return sendJson(res, 404, { error: 'Only local chat completions are available.' });
      const body = await readJson(req, 65536);
      if (!body || typeof body !== 'object' || body.model !== model || !Array.isArray(body.messages) || body.tools || body.tool_calls) {
        return sendJson(res, 400, { error: 'This lab accepts text-only inference without tools.' });
      }
      const upstream = await fetch(`${modelUrl.href}/chat/completions`, {
        method: 'POST', redirect: 'error', signal: AbortSignal.timeout(90000),
        headers: { 'content-type': 'application/json' },
        // Bound generation itself. fx still rejects any token-limit truncation.
        // ASCII grammar permits at most 220 characters including terminal
        // punctuation, then EOS, within the 256-token allowance.
        body: JSON.stringify({
          ...body, max_tokens: 256, temperature: 0.2,
          grammar: "root ::= [A-Za-z] [A-Za-z0-9 ,;:'()/-]{0,218} [.!?]",
        }),
      });
      res.writeHead(upstream.status, { 'content-type': upstream.headers.get('content-type') || 'application/json', 'cache-control': 'no-store' });
      if (upstream.body) await pipeline(Readable.fromWeb(upstream.body), res);
      else res.end();
    } catch (error) {
      console.error('loopback relay:', error.message);
      if (!res.headersSent) sendJson(res, error.status || 502, { error: 'Local model relay failed.' });
      else res.destroy();
    }
  });
  await new Promise((resolve, reject) => { relay.once('error', reject); relay.listen(18080, '127.0.0.1', resolve); });
  return { close: () => new Promise(resolve => relay.close(resolve)) };
}

export function promptFor(task, stage) {
  const proposal = task.steps[0].text || '';
  const critique = task.steps[1].text || '';
  if (stage === 'proposal') return `Task: ${task.task}\nWrite a short practical plan with three steps.`;
  if (stage === 'critique') return `Task: ${task.task}\nProposed plan: ${proposal}\nReview this plan. Name one risk and one concrete improvement. Keep it short.`;
  return `Task: ${task.task}\nPlan: ${proposal}\nReview: ${critique}\nWrite a short final plan that incorporates the review.`;
}

export async function infer(task, stage, onChild) {
  const system = stage === 'critique'
    ? 'You are a reviewer. Give one brief, useful English sentence ending with punctuation, at most 220 characters. Do not use tools or write code.'
    : 'You are a planner. Answer with one brief, practical English sentence ending with punctuation, at most 220 characters. Do not use tools or write code.';
  const child = spawn('fx', ['ask', '--json', '--no-save', '--no-color', '--system', system, '--'], {
    cwd: workspace, stdio: ['pipe', 'pipe', 'pipe'],
    // Explicit allowlist: no host credentials, provider keys or inherited FX config.
    env: { PATH: process.env.PATH, HOME: home, TMPDIR: '/tmp', LANG: 'C.UTF-8',
      FX_PROVIDER: 'local', FX_MODEL: model, FX_PERMISSION_MODE: 'ask',
      FX_MAX_AGENT_STEPS: '1', FX_AUTO_UPGRADE: '0', FX_HERDR: '0' },
  });
  onChild(child);
  const started = Date.now();
  let stdout = ''; let stderr = ''; let exceeded = false; let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; child.kill('SIGKILL'); }, 100000);
  child.stdout.setEncoding('utf8');
  child.stderr.setEncoding('utf8');
  child.stdout.on('data', chunk => {
    if (stdout.length + chunk.length > 131072) { exceeded = true; child.kill('SIGKILL'); }
    else stdout += chunk.toString();
  });
  child.stderr.on('data', chunk => { if (stderr.length < 16384) stderr += chunk.toString(); });
  child.stdin.on('error', error => { if (error.code !== 'EPIPE') console.error('fx stdin:', error.message); });
  child.stdin.end(promptFor(task, stage));
  try {
    const code = await new Promise((resolve, reject) => { child.once('error', reject); child.once('close', resolve); });
    if (timedOut) throw new Error('Local fx inference exceeded 100 seconds. This step will not be retried automatically.');
    if (exceeded) throw new Error('fx output exceeded the lab response limit.');
    let result;
    try { result = JSON.parse(stdout); } catch { throw new Error('fx did not return the required JSON result.'); }
    if (code !== 0) {
      console.error('fx failed:', code, result.error || stderr);
      throw new Error(`fx failed (${result.error || `exit ${code}`}); no completed answer was published.`);
    }
    if (result.exit_code !== 0 || typeof result.final_output !== 'string' || !result.final_output.trim() || result.final_output.length > 24000) {
      throw new Error('fx returned no successful final_output. The lab does not replace failed inference with a fabricated answer.');
    }
    if (result.tool_calls?.length) throw new Error('Unexpected fx tool call: this lab permits text-only local inference.');
    return { text: result.final_output, inference: {
      harness: 'vercel-labs/fx', harnessVersion: '0.0.13', model: result.model,
      provider: 'local', steps: result.steps, usage: result.usage, durationMs: Date.now() - started,
    } };
  } finally { clearTimeout(timer); onChild(null); }
}
