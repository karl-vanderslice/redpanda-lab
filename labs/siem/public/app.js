const $ = id => document.getElementById(id);
const form = $('telemetry-form');
const storageKey = 'vesper-lantern-unresolved';
let state = null;
let readFailed = false;
let selected = null;
let displayed = null;
let paused = false;
let fetching = false;
let busy = false;
let pending = null;
try { pending = JSON.parse(localStorage.getItem(storageKey) || 'null'); } catch { /* Storage is optional. */ }
const stamp = value => value === null ? 'None' : new Date(value).toISOString();
const label = rule => rule === 'brute-force' ? 'Authentication burst' : 'Multi-port observation';
function notice(message) { $('notice').textContent = message; }
function remember(value) {
  pending = value;
  try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); } catch { /* In-memory recovery remains available. */ }
  $('recovery').hidden = !pending;
  $('pending').textContent = pending ? JSON.stringify(pending, null, 2) : '';
  controls();
}
function controls() {
  $('fixture').disabled = busy || !!pending || readFailed || !state?.ready;
  for (const button of document.querySelectorAll('form button')) button.disabled = busy || !!pending || readFailed || !state?.ready;
  const incident = state?.incidents.find(item => item.id === selected);
  $('ack').disabled = busy || !!pending || readFailed || !state?.ready || incident?.status !== 'open';
  $('resolve').disabled = busy || !!pending || readFailed || !state?.ready || !incident || incident.status === 'resolved';
  $('reopen').disabled = busy || !!pending || readFailed || !state?.ready || incident?.status !== 'resolved';
  $('lookup').disabled = busy;
  $('retry').disabled = busy || readFailed || !state?.ready;
}
async function request(path, payload) {
  const response = await fetch(path, { method: payload === undefined ? 'GET' : 'POST', headers: payload === undefined ? {} : { 'content-type': 'application/json' }, body: payload === undefined ? undefined : JSON.stringify(payload), signal: AbortSignal.timeout(65000) });
  return { status: response.status, body: await response.json() };
}
function node(tag, text) { const element = document.createElement(tag); if (text !== undefined) element.textContent = text; return element; }
function renderQueue() {
  const mode = $('filter').value;
  const visible = state.incidents.filter(item => mode === 'all' || (mode === 'resolved' ? item.status === 'resolved' : item.status !== 'resolved'));
  $('incident-count').textContent = `${visible.length} of ${state.incidents.length} incidents`;
  $('empty-queue').hidden = visible.length > 0;
  const ids = new Set(visible.map(item => item.id));
  for (const item of [...$('incidents').children]) if (!ids.has(item.dataset.id)) item.remove();
  for (const incident of [...visible].reverse()) {
    let row = [...$('incidents').children].find(item => item.dataset.id === incident.id);
    if (!row) {
      row = node('li'); row.dataset.id = incident.id;
      const button = node('button'); button.type = 'button'; button.append(node('strong'), node('span'), node('span'));
      button.addEventListener('click', () => { selected = incident.id; renderQueue(); renderCase(); });
      row.append(button); $('incidents').append(row);
    }
    const button = row.firstChild;
    button.setAttribute('aria-pressed', String(incident.id === selected));
    button.children[0].textContent = label(incident.rule);
    button.children[1].textContent = `${incident.severity.toUpperCase()} severity · ${incident.status} · revision ${incident.revision}`;
    button.children[2].textContent = `${incident.entity[1]} → ${incident.entity[2]} / ${incident.entity[3]}`;
  }
  if (!selected && visible.length) { selected = visible.at(-1).id; renderQueue(); }
}
function renderCase() {
  const incident = state.incidents.find(item => item.id === selected);
  $('case-empty').hidden = !!incident; $('case-content').hidden = !incident;
  if (!incident) { controls(); return; }
  $('case-status').textContent = `${incident.severity.toUpperCase()} / ${incident.status}`;
  if (displayed === `${incident.id}:${incident.revision}`) { controls(); return; }
  displayed = `${incident.id}:${incident.revision}`;
  $('case-rule').textContent = `${label(incident.rule)} · ${incident.id}`;
  $('case-entity').textContent = `${incident.entity[0]} / ${incident.entity[1]} → ${incident.entity[2]} / ${incident.entity[3]}`;
  const facts = [['Window start (inclusive)', stamp(incident.windowStart)], ['Window end (exclusive)', stamp(incident.windowEnd)], ['Authentication failures', String(incident.failureCount)], ['Distinct ports', incident.ports.join(', ') || 'Not applicable'], ['Success linkage', incident.successLinked ? 'Matching success after third failure' : 'None'], ['Revision', String(incident.revision)]];
  $('case-facts').replaceChildren(...facts.map(([key, value]) => { const div = node('div'); div.append(node('dt', key), node('dd', value)); return div; }));
  $('evidence').replaceChildren(...incident.evidence.map(item => {
    const li = node('li'); const link = node('a', item.eventId); link.href = item.href;
    const event = state.operations.find(receipt => receipt.command.id === item.eventId)?.command;
    li.append(link, node('span', `${stamp(item.eventTime)} · ${event?.kind || ''}${event?.dstPort ? ` / ${event.protocol} port ${event.dstPort}` : ''}`)); return li;
  }));
  $('transitions').replaceChildren(...incident.transitions.map(item => { const li = node('li', `${item.action} · ${item.status} · ${item.severity} severity`); const link = node('a', item.commandId); link.href = `/api/receipts/${item.commandId}`; const span = node('span'); span.append(link, document.createTextNode(` / ${item.evidenceIds.length} evidence records${item.analyst ? ` / ${item.analyst}` : ''}`)); li.append(span); return li; }));
  controls();
}
function renderTimeline() {
  const receipts = state.operations.filter(item => item.command.type === 'ingest').slice(-100).reverse();
  const ids = new Set(receipts.map(item => item.command.id));
  for (const row of [...$('timeline').children]) if (!ids.has(row.dataset.id)) row.remove();
  for (const receipt of receipts) {
    if ([...$('timeline').children].some(row => row.dataset.id === receipt.command.id)) continue;
    const event = receipt.command; const row = node('li'); row.dataset.id = event.id;
    if (!receipt.outcome.accepted) row.className = 'rejected';
    const link = node('a', `${event.kind} · ${event.id}`); link.href = `/api/events/${event.id}`;
    row.append(link, node('strong', receipt.outcome.accepted ? 'Accepted' : receipt.outcome.reason), node('span', `${stamp(event.eventTime)} / offset ${receipt.offset} / ${event.srcIp} → ${event.dstIp}${event.dstPort ? `:${event.dstPort}` : ` / ${event.actor}`}`));
    const before = [...$('timeline').children].find(item => BigInt(item.dataset.offset) < BigInt(receipt.offset));
    row.dataset.offset = receipt.offset; $('timeline').insertBefore(row, before || null);
  }
}
async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    const response = await request('/api/state');
    if (response.status !== 200) throw new Error('Projection unavailable.');
    if (readFailed) notice(pending ? 'Projection reconnected. Look up the preserved command receipt.' : 'Projection reconnected.');
    readFailed = false;
    state = response.body;
    $('owner').textContent = state.ready ? 'Ready / one owner' : 'Writes stopped';
    $('watermark').textContent = stamp(state.watermark); $('offset').textContent = state.lastOffset ?? 'None';
    if (state.unknown) remember({ path: state.unknown.command.type === 'ingest' ? '/api/telemetry' : '/api/incidents/actions', payload: payloadFromCommand(state.unknown.command) });
    renderQueue(); renderCase(); renderTimeline(); controls();
  } catch (error) {
    readFailed = true;
    $('owner').textContent = 'Unavailable / view retained';
    notice(`Refresh failed: ${error.message}. Previously consumed view retained.`);
    controls();
  }
  finally { fetching = false; }
}
function payloadFromCommand(command) { const { type, ...payload } = command; return payload; }
async function publish(path, payload) {
  remember({ path, payload });
  try {
    const response = await request(path, payload);
    if (response.body.command && response.body.outcome) {
      remember(null);
      notice(`${response.body.command.id}: ${response.body.outcome.accepted ? 'consumed and accepted' : `consumed, rejected (${response.body.outcome.reason})`} at offset ${response.body.offset}.`);
      return response.body;
    }
    if (!response.body.outcomeUnknown && response.status >= 400 && response.status < 500) remember(null);
    throw new Error(response.body.error || 'Completion could not be established. Keep the exact command.');
  } catch (error) { notice(error.message); throw error; }
}
async function action(callback) {
  if (busy) return;
  busy = true; controls();
  try { await callback(); } catch (error) { notice(error.message); }
  finally { busy = false; await refresh(); controls(); }
}
const initialExampleTime = Date.now();
form.elements.id.value = `event-${crypto.randomUUID()}`; form.elements.eventTime.value = String(initialExampleTime);
form.elements.kind.addEventListener('change', () => {
  const flow = form.elements.kind.value === 'flow';
  $('actor-field').hidden = flow; form.elements.actor.disabled = flow;
  $('port-field').hidden = !flow; form.elements.dstPort.disabled = !flow;
  $('protocol-field').hidden = !flow; form.elements.protocol.disabled = !flow;
});
form.addEventListener('submit', event => {
  event.preventDefault();
  if (pending) return;
  const payload = Object.fromEntries(new FormData(form)); payload.eventTime = Number(payload.eventTime);
  if (payload.dstPort !== undefined) payload.dstPort = Number(payload.dstPort);
  void action(() => publish('/api/telemetry', payload));
});
const initialImport = { format: 'network-json', event_id: `import-${crypto.randomUUID()}`, timestamp: new Date(initialExampleTime).toISOString(), event_type: 'authentication', sensor: 'lantern-edge', source: { ip: '203.0.113.8' }, destination: { ip: '198.51.100.24' }, user: { name: 'mira-synthetic' }, outcome: 'failure' };
const initialImportText = JSON.stringify(initialImport, null, 2);
$('json-input').value = initialImportText;
$('json-form').addEventListener('submit', event => { event.preventDefault(); if (pending) return; void action(async () => { const payload = JSON.parse($('json-input').value); await publish('/api/telemetry', payload); }); });
$('fixture').addEventListener('click', () => { if (pending) return; void action(async () => {
  const nextMinute = Math.ceil(Math.max(Date.now(), (state.maxEventTime ?? 0) + 1) / state.rules.windowMs) * state.rules.windowMs;
  // Synthetic samples stay inside the logged clock's advance window after idle.
  const base = state.maxEventTime === null ? nextMinute : Math.min(nextMinute,
    Math.floor((state.maxEventTime + state.rules.maxAdvanceMs - 7000) / state.rules.windowMs) * state.rules.windowMs);
  const prefix = `fixture-${crypto.randomUUID()}`;
  const common = { sensor: `edge-${crypto.randomUUID()}`, srcIp: '192.0.2.17', dstIp: '198.51.100.24' };
  const events = [
    ...[0, 1, 2].map(index => ({ ...common, id: `${prefix}-failure-${index}`, eventTime: base + index * 1000, kind: 'auth.failure', actor: 'mira-synthetic' })),
    { ...common, id: `${prefix}-success`, eventTime: base + 3000, kind: 'auth.success', actor: 'mira-synthetic' },
    ...[22, 80, 443, 8080].map((dstPort, index) => ({ ...common, id: `${prefix}-port-${dstPort}`, eventTime: base + 4000 + index * 1000, kind: 'flow', dstPort, protocol: 'tcp' })),
  ];
  for (const payload of events) { const receipt = await publish('/api/telemetry', payload); if (!receipt.outcome.accepted) break; }
}); });
for (const [button, commandAction] of [['ack', 'acknowledge'], ['resolve', 'resolve'], ['reopen', 'reopen']]) $(button).addEventListener('click', () => {
  if (pending) return;
  const incident = state.incidents.find(item => item.id === selected);
  void action(() => publish('/api/incidents/actions', { id: `review-${crypto.randomUUID()}`, incidentId: incident.id, action: commandAction, expectedRevision: incident.revision, analyst: $('analyst').value }));
});
$('lookup').addEventListener('click', () => { if (!pending) return; void action(async () => {
  const id = pending.payload.id || pending.payload.event_id;
  const response = await request(`/api/receipts/${encodeURIComponent(id)}`);
  if (response.status === 200) { remember(null); notice(`${id}: consumed at offset ${response.body.offset}, ${response.body.outcome.accepted ? 'accepted' : response.body.outcome.reason}.`); }
  else notice(`${id}: ${response.body.error || response.body.message || 'No consumed receipt yet.'} Keep the payload.`);
}); });
$('retry').addEventListener('click', () => { if (!pending) return; const exact = pending; void action(() => publish(exact.path, exact.payload)); });
$('filter').addEventListener('change', () => { if (state) renderQueue(); });
$('refresh').addEventListener('click', () => { void refresh(); });
$('updates').addEventListener('click', () => { paused = !paused; $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; $('updates').setAttribute('aria-pressed', String(paused)); notice(paused ? 'Automatic updates paused. Refresh remains available.' : 'Automatic updates resumed.'); if (!paused) void refresh(); });
remember(pending);
await refresh();
if (state?.maxEventTime !== null && state?.maxEventTime !== undefined) {
  const exampleTime = Math.min(Math.max(initialExampleTime, state.maxEventTime + 1), state.maxEventTime + state.rules.maxAdvanceMs);
  if (form.elements.eventTime.value === String(initialExampleTime)) form.elements.eventTime.value = String(exampleTime);
  if ($('json-input').value === initialImportText) $('json-input').value = JSON.stringify({ ...initialImport, timestamp: new Date(exampleTime).toISOString() }, null, 2);
}
if (state?.ready && !pending) notice('Projection ready. Ingest observations or select an incident.');
setInterval(() => { if (!paused && !busy) void refresh(); }, 2500);
