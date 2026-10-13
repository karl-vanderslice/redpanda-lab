'use strict';
const $ = id => document.getElementById(id);
let dark = matchMedia('(prefers-color-scheme: dark)').matches;
try { const saved = localStorage.getItem('relay-theme'); if (saved) dark = saved === 'dark'; } catch { /* Theme remains usable without storage. */ }
function theme() { document.documentElement.dataset.theme = dark ? 'dark' : 'light'; $('theme').textContent = dark ? 'Light theme' : 'Dark theme'; }
theme();
$('theme').addEventListener('click', () => { dark = !dark; theme(); try { localStorage.setItem('relay-theme', dark ? 'dark' : 'light'); } catch { /* No persistence available. */ } });
let data = { tasks: [] }; let selectedId; let paused = false; let pendingId; let pendingTask;
let lastHistory = ''; let lastTranscript = '';
function element(tag, text, className) { const node = document.createElement(tag); if (text !== undefined) node.textContent = text; if (className) node.className = className; return node; }
function render() {
  const tasks = data.tasks || [];
  if (!selectedId && tasks[0]) selectedId = tasks[0].id;
  $('count').textContent = tasks.length;
  $('position').textContent = data.position ? `${data.topic} / partition ${data.position.partition} / offset ${data.position.offset}` : 'agent-messaging.events.v1';
  const historyKey = JSON.stringify(tasks.map(task => [task.id, task.status])) + selectedId;
  if (historyKey !== lastHistory) {
    lastHistory = historyKey;
    const focusedId = document.activeElement?.dataset.taskId;
    const nodes = tasks.map(task => {
      const button = element('button', undefined, `history-item${task.id === selectedId ? ' active' : ''}`);
      button.type = 'button'; button.dataset.taskId = task.id;
      button.setAttribute('aria-pressed', String(task.id === selectedId));
      button.append(element('strong', task.task), element('small', task.status));
      button.addEventListener('click', () => { selectedId = task.id; render(); });
      return button;
    });
    $('history').replaceChildren(...(nodes.length ? nodes : [element('p', 'Your tasks will appear here.', 'hint')]));
    if (focusedId) nodes.find(node => node.dataset.taskId === focusedId)?.focus();
  }
  const task = tasks.find(item => item.id === selectedId);
  if (!task) return;
  const transcriptKey = JSON.stringify(task);
  if (transcriptKey === lastTranscript) return;
  lastTranscript = transcriptKey;
  $('transcript-heading').textContent = task.status === 'completed' ? 'Two perspectives. One final plan.' : task.status === 'failed' ? 'The conversation stopped.' : 'The agents are working.';
  $('task-summary').textContent = task.task;
  const messages = task.steps.map(step => {
    const article = element('article', undefined, `message ${step.stage}`);
    const avatar = element('span', step.agentId === 'reviewer' ? 'R' : 'P', `avatar ${step.agentId === 'reviewer' ? 'reviewer' : ''}`);
    avatar.setAttribute('aria-hidden', 'true');
    const content = element('div'); const heading = element('div', undefined, 'message-heading');
    heading.append(element('strong', step.agentId === 'reviewer' ? 'Reviewer' : 'Planner'), element('span', step.stage), element('span', step.status, 'status'));
    content.append(heading);
    if (step.status === 'completed') {
      content.append(element('pre', step.text));
      content.append(element('code', `${step.agentId} · fx ${step.inference.harnessVersion} · ${step.inference.model} · ${(step.inference.durationMs / 1000).toFixed(1)}s`));
    } else if (step.status === 'failed') content.append(element('p', step.error, 'failed'));
    else content.append(element('p', step.status === 'running' ? 'Local fx inference is running. The answer will appear after its result is recorded.' : task.status === 'failed' ? 'Not run: an earlier step failed.' : 'Waiting for the preceding handoff.', 'hint'));
    content.append(element('code', step.id));
    article.append(avatar, content); return article;
  });
  $('messages').replaceChildren(...messages);
  $('task-status').textContent = task.status === 'completed' ? `Completed · ${task.id} · 3 real inference results recorded` : task.status === 'failed' ? `Failed · ${task.id} · No automatic retry. Inspect logs, then submit a new task if desired.` : `${task.status === 'pending' ? 'Queued' : 'In progress'} · ${task.id}`;
}
async function refresh() {
  const response = await fetch('/api/tasks');
  if (!response.ok) throw new Error('Could not read the transcript. Check the service logs.');
  data = await response.json(); if (!paused) render();
}
let events;
function connect() {
  events?.close();
  $('connection').textContent = 'Connecting to Redpanda…';
  events = new EventSource('/api/events');
  events.addEventListener('snapshot', event => {
    data = JSON.parse(event.data);
    $('connection').textContent = paused ? 'Updates paused' : data.ready ? 'Connected to Redpanda' : 'Rebuilding from the log…';
    if (!paused) render();
  });
  events.onerror = () => { $('connection').textContent = 'Connection lost · reconnecting'; };
}
connect();
$('pause').addEventListener('click', () => {
  paused = !paused; $('pause').setAttribute('aria-pressed', String(paused));
  $('pause').textContent = paused ? 'Resume updates' : 'Pause updates';
  $('connection').textContent = paused ? 'Updates paused' : 'Connected to Redpanda';
  if (!paused) render();
});
$('task-form').addEventListener('submit', async event => {
  event.preventDefault(); $('form-error').textContent = ''; $('task').removeAttribute('aria-invalid');
  const task = $('task').value.trim();
  if (!task) { $('form-error').textContent = 'Describe a task for the agents.'; $('task').setAttribute('aria-invalid', 'true'); $('task').focus(); return; }
  if (pendingId) { $('form-error').textContent = 'Check the uncertain submission before starting another task.'; return; }
  pendingId = crypto.randomUUID(); pendingTask = task;
  $('submit').disabled = true; $('submission').textContent = 'Recording the task…';
  try {
    const response = await fetch('/api/tasks', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id: pendingId, task }) });
    const result = await response.json();
    if (!response.ok) {
      if (result.status !== 'unknown') { pendingId = undefined; pendingTask = undefined; }
      throw new Error(result.error || 'The task could not be recorded.');
    }
    selectedId = result.id; pendingId = undefined; pendingTask = undefined;
    $('task').value = ''; $('submission').textContent = 'Task recorded. Follow the handoffs in the transcript.';
    await refresh();
  } catch (error) {
    $('form-error').textContent = error.message;
    $('submission').textContent = pendingId ? `Outcome unknown · ${pendingId}. Check this ID before retrying.` : 'Task not submitted. Correct the error and try again.';
  } finally { $('submit').disabled = false; $('lookup').hidden = !pendingId; }
});
$('lookup').addEventListener('click', async () => {
  if (!pendingId) return;
  try {
    const response = await fetch(`/api/tasks/${encodeURIComponent(pendingId)}`);
    if (response.status === 404) { $('form-error').textContent = 'This ID is not observed yet. Check the broker and service logs. Do not assume it was rejected.'; return; }
    if (!response.ok) throw new Error('Lookup failed. Check the service logs before retrying.');
    const task = await response.json();
    if (task.task !== pendingTask) throw new Error('This task ID refers to different content. Inspect the log.');
    selectedId = task.id; pendingId = undefined; pendingTask = undefined;
    $('lookup').hidden = true; $('task').value = ''; $('form-error').textContent = '';
    $('submission').textContent = 'Submission found in the log. No duplicate task was created.';
    await refresh();
  } catch (error) { $('form-error').textContent = error.message; }
});
window.addEventListener('pagehide', () => events?.close());
window.addEventListener('pageshow', event => { if (event.persisted) connect(); });
