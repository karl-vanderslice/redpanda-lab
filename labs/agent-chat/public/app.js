const $ = selector => document.querySelector(selector);
const root = document.documentElement;
const themeButton = $('#theme');
const preference = matchMedia('(prefers-color-scheme: dark)');
let chosenTheme;
try { const saved = localStorage.getItem('later-theme'); if (saved === 'dark' || saved === 'light') chosenTheme = saved; } catch { /* Storage is optional. */ }
function setTheme() {
  const theme = chosenTheme || (preference.matches ? 'dark' : 'light');
  root.dataset.theme = theme;
  themeButton.textContent = theme === 'dark' ? 'Light theme' : 'Dark theme';
}
setTheme();
preference.addEventListener('change', setTheme);
themeButton.addEventListener('click', () => {
  chosenTheme = root.dataset.theme === 'dark' ? 'light' : 'dark';
  setTheme();
  try { localStorage.setItem('later-theme', chosenTheme); } catch { /* Keep the choice on this page. */ }
});
let selected = null;
let snapshot = null;
let lastRender = '';
let submitting = false;
let focusPrompt = false;
let uncertain = null;
let pollTimer;
let stopped = false;
let paused = false;
let pollController;
const timezone = Intl.DateTimeFormat().resolvedOptions().timeZone;
const stamp = instant => new Date(instant).toLocaleString(undefined, {
  month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit', second: '2-digit', timeZoneName: 'short',
});
const localDate = date => {
  const pad = value => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}`;
};
$('#due').value = localDate(new Date(Date.now() + 60000));
$('#timezone').textContent = `Your timezone: ${timezone}. Converted to UTC when submitted. Up to seven days ahead.`;
function node(tag, className, content) {
  const value = document.createElement(tag);
  if (className) value.className = className;
  if (content !== undefined) value.textContent = content;
  return value;
}
function showError(message) {
  $('#error').textContent = message || '';
  $('#error').hidden = !message;
}
async function request(path, options = {}) {
  const response = await fetch(path, { ...options, signal: options.signal || AbortSignal.timeout(15000) });
  const body = await response.json();
  if (!response.ok) throw Object.assign(new Error(body.error || `HTTP ${response.status}`), body, { status: response.status });
  return body;
}
function controls() {
  const blocked = submitting || Boolean(uncertain) || !snapshot?.ready;
  $('#create-form button').disabled = blocked;
  $('#prompt').disabled = blocked || !selected;
  $('#send').disabled = blocked || !selected;
  $('#due').disabled = blocked;
  for (const button of document.querySelectorAll('.cancel')) button.disabled = blocked;
  $('#send').textContent = submitting ? 'Writing to log…' : $('input[name=timing]:checked').value === 'later' ? 'Schedule prompt' : 'Send prompt';
}
function updateTiming() {
  const scheduled = $('input[name=timing]:checked').value === 'later';
  $('#schedule-fields').hidden = !scheduled;
  $('#due').required = scheduled;
  controls();
}
for (const radio of document.querySelectorAll('input[name=timing]')) radio.addEventListener('change', updateTiming);
async function mutation(path, fields, done) {
  if (submitting || uncertain) return;
  const requestId = crypto.randomUUID();
  submitting = true;
  showError(null);
  controls();
  try {
    await request(path, {
      method: 'POST', headers: { 'content-type': 'application/json' },
      body: JSON.stringify({ requestId, ...fields }),
    });
    done(requestId);
    lastRender = '';
  } catch (error) {
    if (error.outcomeUnknown || !error.status) {
      uncertain = { requestId, done };
      showError(`Publication outcome unknown. Do not resubmit. Checking request ${requestId} in the log; forms are blocked until it is observed. If updates are paused, use Refresh now. If it remains absent, inspect /api/operations/${requestId} and service logs before deciding what to do.`);
    } else showError(error.message);
  } finally {
    submitting = false;
    controls();
    void poll(true);
  }
}
$('#create-form').addEventListener('submit', event => {
  event.preventDefault();
  void mutation('/api/conversations', { title: $('#title').value }, requestId => {
    selected = requestId;
    $('#title').value = '';
    focusPrompt = true;
  });
});
$('#prompt-form').addEventListener('submit', event => {
  event.preventDefault();
  if (!selected) return;
  const fields = { prompt: $('#prompt').value };
  if ($('input[name=timing]:checked').value === 'later') {
    const local = new Date($('#due').value);
    if (!Number.isFinite(local.getTime()) || local.getTime() <= Date.now()) {
      showError('Choose a date and time in the future.');
      $('#due').setAttribute('aria-invalid', 'true');
      $('#due').focus();
      return;
    }
    // DST gaps are normalized by Date. Reject them rather than silently moving a prompt.
    if (localDate(local) !== ($('#due').value.length === 16 ? `${$('#due').value}:00` : $('#due').value)) {
      showError('This local time does not exist (a daylight-saving transition). Choose another time.');
      $('#due').setAttribute('aria-invalid', 'true');
      $('#due').focus();
      return;
    }
    fields.dueAt = local.toISOString();
  }
  $('#due').removeAttribute('aria-invalid');
  void mutation(`/api/conversations/${selected}/prompts`, fields, () => {
    $('#prompt').value = '';
    focusPrompt = true;
  });
});
function renderConversations() {
  const nav = $('#conversations');
  nav.replaceChildren();
  if (!snapshot.conversations.length) nav.append(node('p', 'muted', 'No conversations observed. Create one above.'));
  for (const conversation of [...snapshot.conversations].reverse()) {
    const button = node('button', 'conversation-link', conversation.title);
    button.type = 'button';
    button.dataset.focusId = `conversation-${conversation.id}`;
    button.setAttribute('aria-current', String(conversation.id === selected));
    button.append(node('small', '', `${conversation.messageCount} messages · ${stamp(conversation.createdAt)}`));
    button.addEventListener('click', () => {
      selected = conversation.id;
      lastRender = '';
      void poll(true);
    });
    nav.append(button);
  }
}
function renderConversation(conversation) {
  $('#conversation-title').textContent = conversation?.title || 'Select a conversation';
  const transcript = $('#transcript');
  transcript.replaceChildren();
  if (!conversation || !conversation.messages.length) {
    const empty = node('div', 'empty');
    empty.append(node('h2', '', conversation ? 'No recorded messages' : 'No conversation selected'),
      node('p', '', conversation ? 'Send a prompt now or choose a future local date and time. Pending prompts appear in the journal.' : 'Create a conversation from the index to begin.'));
    transcript.append(empty);
  }
  if (!conversation) return;
  for (const message of conversation.messages) {
    const article = node('article', `message ${message.role}`);
    const meta = node('div', 'message-meta');
    meta.append(node('span', '', message.role === 'user' ? 'YOUR PROMPT' : 'LOCAL MODEL'), node('span', '', stamp(message.at)));
    article.append(meta, node('p', 'message-content', message.content));
    transcript.append(article);
  }
  for (const job of conversation.jobs.filter(value => value.status === 'pending' && value.mode === 'now')) {
    const queued = node('div', 'queued');
    queued.append(node('p', 'message-content', job.prompt), node('p', 'muted', 'Pending · waiting for the local scheduler.'));
    transcript.append(queued);
  }
}
function renderJobs(conversation) {
  const region = $('#jobs');
  region.replaceChildren();
  const jobs = conversation?.jobs || [];
  $('#job-count').textContent = String(jobs.length);
  if (!jobs.length) region.append(node('p', 'muted', 'No prompts observed. Send now or choose a future date and time.'));
  for (const job of [...jobs].reverse()) {
    const card = node('article', 'job');
    const top = node('div', 'job-top');
    top.append(node('span', `badge ${job.status}`, job.status), node('span', 'job-mode', job.mode === 'scheduled' ? 'SCHEDULED' : 'SEND NOW'));
    card.append(top, node('p', 'job-prompt', job.prompt));
    card.append(node('p', 'job-time', `${job.mode === 'scheduled' ? 'Due' : 'Submitted'} ${stamp(job.dueAt)}`));
    if (job.status === 'running') card.append(node('p', 'muted', 'Inference is running. The attempt start is recorded in the log.'));
    if (job.status === 'pending' && Date.parse(job.dueAt) <= Date.now()) card.append(node('p', 'muted', 'Due · queued for the single model slot.'));
    if (job.error) card.append(node('p', 'job-error', job.error));
    if (job.status === 'cancelled') card.append(node('p', 'muted', 'Cancelled before start. No inference was requested.'));
    if (job.status === 'pending') {
      const cancel = node('button', 'cancel', 'Cancel pending prompt');
      cancel.type = 'button';
      cancel.dataset.focusId = `cancel-${job.id}`;
      cancel.addEventListener('click', () => { void mutation(`/api/jobs/${job.id}/cancel`, {}, () => {}); });
      card.append(cancel);
    }
    const detail = node('details');
    detail.dataset.jobId = job.id;
    const summary = node('summary', '', 'Log details');
    summary.dataset.focusId = `details-${job.id}`;
    detail.append(summary, node('p', '', `Job ${job.id}`), node('p', '', `Due UTC ${job.dueAt}`));
    for (const transition of job.transitions) detail.append(node('p', '', `${transition.status} · ${stamp(transition.at)} · offset ${transition.offset}`));
    card.append(detail);
    region.append(card);
  }
}
async function poll(force = false) {
  if (stopped || (paused && !force)) return;
  clearTimeout(pollTimer);
  // A new selection/mutation invalidates the previous snapshot request.
  pollController?.abort();
  const controller = new AbortController();
  pollController = controller;
  const deadline = setTimeout(() => controller.abort(), 10000);
  try {
    const next = await request('/api/state', { signal: controller.signal });
    if (controller !== pollController || stopped || (paused && !force)) return;
    snapshot = next;
    if (!selected && next.conversations.length) selected = next.conversations.at(-1).id;
    if (uncertain) {
      try {
        const operation = await request(`/api/operations/${uncertain.requestId}`, { signal: controller.signal });
        if (controller !== pollController || stopped) return;
        const saved = uncertain;
        uncertain = null;
        if (operation.accepted) { saved.done(saved.requestId); showError(null); }
        else showError(operation.reason);
        lastRender = '';
      } catch (error) { if (error.status !== 404) throw error; }
    }
    const selectedAtRequest = selected;
    const key = `${next.owner}:${next.revision}:${selected}`;
    if (key !== lastRender) {
      const conversation = selected ? await request(`/api/conversations/${selected}`, { signal: controller.signal }) : null;
      if (controller !== pollController || selected !== selectedAtRequest || stopped || (paused && !force)) return;
      const focused = document.activeElement?.dataset.focusId;
      const openDetails = [...document.querySelectorAll('.job details')].filter(value => value.open).map(value => value.dataset.jobId);
      renderConversations();
      renderConversation(conversation);
      renderJobs(conversation);
      for (const detail of document.querySelectorAll('.job details')) if (openDetails.includes(detail.dataset.jobId)) detail.open = true;
      if (focused) {
        const target = [...document.querySelectorAll('[data-focus-id]')].find(value => value.dataset.focusId === focused);
        (target || $('#schedule-title')).focus();
      }
      lastRender = key;
    }
    const active = next.jobs.filter(job => job.status === 'running').length;
    const pending = next.jobs.filter(job => job.status === 'pending').length;
    const failed = next.jobs.filter(job => job.status === 'failed').length;
    $('#connection').textContent = next.ready
      ? `Log connected · ${pending} pending · ${active} running · ${failed} failed · ${next.revision} events observed${paused ? ' · display paused' : ''}`
      : next.scheduler.error || 'Replaying the log and warming the local model…';
    controls();
    if (focusPrompt && !$('#prompt').disabled) {
      $('#prompt').focus();
      focusPrompt = false;
    }
  } catch (error) {
    if (controller !== pollController || stopped || (paused && !force)) return;
    $('#connection').textContent = paused ? 'Refresh failed. Display remains paused. Check the service logs.' : 'Connection interrupted. Reconnecting to the service…';
    if (snapshot) snapshot.ready = false;
    controls();
  } finally {
    clearTimeout(deadline);
    if (controller === pollController && !stopped && !paused) pollTimer = setTimeout(() => { void poll(); }, 1000);
  }
}
$('#pause').addEventListener('click', () => {
  paused = !paused;
  $('#pause').setAttribute('aria-pressed', String(paused));
  $('#pause').textContent = paused ? 'Resume updates' : 'Pause updates';
  if (paused) {
    clearTimeout(pollTimer);
    const pending = pollController;
    pollController = null;
    pending?.abort();
    $('#connection').textContent = 'Display paused · scheduled prompts continue running';
  } else void poll();
});
$('#refresh').addEventListener('click', async () => {
  $('#refresh').disabled = true;
  try { await poll(true); }
  finally { $('#refresh').disabled = false; }
});
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(pollTimer); pollController?.abort(); });
window.addEventListener('pageshow', () => { if (stopped) { stopped = false; void poll(); } });
updateTiming();
void poll();
