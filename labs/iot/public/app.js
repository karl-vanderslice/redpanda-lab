function viewError(text) {
  const region = document.getElementById('view-error');
  if (region.textContent !== text) region.textContent = text;
}
const byId = id => document.getElementById(id);
const form = byId('reading');
const fields = byId('fields');
const result = byId('result');
const retry = byId('retry');
const deviceInput = byId('device');
const sequence = byId('sequence');
const temperature = byId('temperature');
const battery = byId('battery');
const commandId = byId('command-id');
let state = null;
let paused = false;
let sending = false;
let timer;
let controller;
let stopped = false;
let initialized = false;
let pending = null;
let viewGeneration = 0;
let observedAt = null;
const receiptSequences = new Map();
function freshness(stale = false) {
  byId('freshness').textContent = observedAt ? `${stale ? 'Stale view' : paused ? 'Paused view' : 'View observed'} · ${observedAt.toLocaleTimeString()}. Not a sensor timestamp.` : 'No state observed yet.';
}
try { pending = JSON.parse(sessionStorage.getItem('iot-pending') || 'null'); } catch { /* Storage is optional. */ }
function savePending() {
  try {
    if (pending) sessionStorage.setItem('iot-pending', JSON.stringify(pending));
    else sessionStorage.removeItem('iot-pending');
  } catch { /* The visible ID remains available when storage is denied. */ }
}
function element(tag, text, className) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  if (className) node.className = className;
  return node;
}
function chosen() { return state?.devices.find(device => device.id === deviceInput.value); }
function explainLimits() {
  const device = chosen();
  if (device) byId('limits').textContent = `Safe range: ${device.minC} to ${device.maxC} °C, inclusive. Low battery: below ${device.lowBatteryBelow}%.`;
}
function nextSequence() {
  const device = chosen();
  if (device) sequence.value = String(Math.max(device.last?.sequence || 0, receiptSequences.get(device.id) || 0) + 1);
}
function preset(kind) {
  const device = chosen();
  if (!device) return;
  temperature.value = String(kind === 'hot' ? device.maxC + 5 : device.normalC);
  battery.value = kind === 'low' ? '10' : '90';
}
function render(snapshot) {
  state = snapshot;
  viewError(snapshot.ready ? '' : 'Gateway paused. Inspect the unresolved reading and restart to replay.');
  observedAt = new Date();
  freshness();
  fields.disabled = sending || Boolean(pending) || !snapshot.ready;
  byId('connection').textContent = snapshot.ready
    ? `Gateway ready · ${paused ? 'automatic updates paused' : 'updates every 2 seconds'}`
    : 'Gateway paused · inspect the unresolved reading and restart to replay';
  byId('connection').className = snapshot.ready ? 'status' : 'warning';
  byId('offset').textContent = `Offset ${snapshot.lastOffset ?? '—'} · duplicate records ${snapshot.duplicates}`;
  byId('devices').replaceChildren(...snapshot.devices.map(device => {
    const card = element('article');
    card.append(element('h3', device.id), element('p', `Safe: ${device.minC} to ${device.maxC} °C · battery ≥ ${device.lowBatteryBelow}%`, 'muted'));
    card.append(element('p', device.last ? `${device.last.temperatureC} °C · ${device.last.batteryPercent}% battery` : 'No reading yet', 'measurement'));
    if (device.last) card.append(element('p', `Sequence ${device.last.sequence} · reading ${device.last.id}`, 'muted')); 
    const active = Object.entries(device.activeAlerts).filter(([, id]) => id).map(([type]) => type === 'battery' ? 'Low battery' : 'Temperature');
    card.append(element('p', active.length ? active.join(' · ') : device.last ? 'Within thresholds' : 'Awaiting telemetry', active.length ? 'warning' : 'status'));
    return card;
  }));
  const open = snapshot.alerts.filter(alert => alert.closedBy === null).length;
  byId('alert-summary').textContent = `${open} open · ${snapshot.alerts.length - open} cleared`;
  byId('alerts').replaceChildren(...snapshot.alerts.slice().reverse().map(alert => element('li',
    `${alert.deviceId} · ${alert.type === 'battery' ? 'Low battery' : 'Temperature'} · ${alert.closedBy === null ? 'OPEN' : 'CLEARED'} · opened at offset ${alert.openedOffset}${alert.closedBy === null ? '' : `, cleared at offset ${alert.closedOffset}`}`,
    alert.closedBy === null ? 'warning' : 'muted')));
  if (!snapshot.alerts.length) byId('alerts').append(element('li', 'No alerts recorded.'));
  const history = snapshot.devices.flatMap(device => device.history).sort((a, b) => {
    const left = BigInt(a.offset), right = BigInt(b.offset);
    return left === right ? 0 : left > right ? -1 : 1;
  }).slice(0, 20);
  byId('history').replaceChildren(...history.map(reading => element('li',
    `${reading.deviceId} · #${reading.sequence} · ${reading.temperatureC} °C · ${reading.batteryPercent}% · offset ${reading.offset} · ${reading.id}`)));
  if (!history.length) byId('history').append(element('li', 'Send the first reading above.'));
  explainLimits();
  if (!initialized) {
    initialized = true;
    if (!pending) { nextSequence(); preset('normal'); }
  }
}
function hold() {
  fields.disabled = true;
  retry.hidden = sending;
  retry.disabled = sending;
}
function complete(operation) {
  result.className = operation.accepted ? 'status' : 'warning';
  result.textContent = operation.accepted
    ? `Reading ${operation.command.id} consumed at offset ${operation.offset}. ${operation.alerts.map(alert => `${alert.type} ${alert.action}`).join('; ') || 'No alert change.'}`
    : `Reading ${operation.command.id} rejected at offset ${operation.offset}: ${operation.reason}`;
  pending = null;
  savePending();
  fields.disabled = !state?.ready;
  retry.hidden = true;
  commandId.value = crypto.randomUUID();
  const deviceId = operation.command.deviceId;
  receiptSequences.set(deviceId, Math.max(receiptSequences.get(deviceId) || 0, operation.lastSequence));
  nextSequence();
}
async function refresh(manual = false) {
  if (stopped || (!manual && paused) || controller) return;
  const generation = viewGeneration;
  const ownController = new AbortController();
  controller = ownController;
  byId('refresh').disabled = true;
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.any([ownController.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error(`State unavailable (${response.status}).`);
    const snapshot = await response.json();
    if (stopped || generation !== viewGeneration || (!manual && paused)) return;
    render(snapshot);
    if (pending && !sending) {
      const receipt = snapshot.operations.find(operation => operation.command.id === pending.id);
      if (receipt && Object.entries(pending).every(([key, value]) => receipt.command[key] === value)) complete(receipt);
    }
  } catch (error) {
    if (!stopped && generation === viewGeneration && error.name !== 'AbortError') {
      byId('connection').textContent = `Updates unavailable: ${error.message} Last observed values remain visible.`;
      byId('connection').className = 'error';
      if (state) state = { ...state, ready: false };
      fields.disabled = true;
      freshness(true);
      viewError(byId('connection').textContent);
    }
  } finally {
    if (controller === ownController) controller = null;
    byId('refresh').disabled = false;
  }
}
async function send() {
  if (sending || !pending) return;
  sending = true;
  hold();
  result.className = 'status';
  result.textContent = `Waiting for consumed reading ${pending.id}…`;
  try {
    const response = await fetch('/api/readings', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(pending), signal: AbortSignal.timeout(65000) });
    const body = await response.json();
    if (response.status >= 500 || body.outcomeUnknown) throw new Error(body.error || 'Gateway unavailable.');
    if (body.command) {
      complete(body);
      // Consumed receipt remains authoritative even when the view is paused or stale.
      if (!paused) await refresh();
    } else {
      result.className = 'error';
      result.textContent = body.error || `Reading rejected (${response.status}).`;
      pending = null;
      savePending();
      fields.disabled = !state?.ready;
      retry.hidden = true;
      commandId.value = crypto.randomUUID();
    }
  } catch (error) {
    result.className = 'warning';
    result.textContent = `${error.message} Completion may be unknown. Keep ID ${pending.id} and these exact values. Inspect state; restart the app to replay, then retry this same reading. Never submit a replacement.`;
  } finally {
    sending = false;
    if (pending) hold();
    else fields.disabled = !state?.ready;
  }
}
form.addEventListener('submit', event => {
  event.preventDefault();
  if (pending || sending) return;
  pending = { id: commandId.value, deviceId: deviceInput.value, sequence: Number(sequence.value), temperatureC: Number(temperature.value), batteryPercent: Number(battery.value) };
  savePending();
  void send();
});
retry.addEventListener('click', () => { void send(); });
deviceInput.addEventListener('change', () => { nextSequence(); preset('normal'); explainLimits(); });
for (const [id, kind] of [['normal', 'normal'], ['hot', 'hot'], ['low', 'low']]) byId(id).addEventListener('click', () => preset(kind));
byId('updates').addEventListener('click', () => {
  paused = !paused;
  viewGeneration += 1;
  byId('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  byId('updates').setAttribute('aria-pressed', String(paused));
  if (paused) {
    controller?.abort();
    byId('connection').textContent = 'Automatic view updates paused. Commands and manual refresh still work.';
    freshness();
  } else void refresh();
});
byId('refresh').addEventListener('click', () => { void refresh(true); });
if (pending) {
  commandId.value = pending.id;
  deviceInput.value = pending.deviceId;
  sequence.value = pending.sequence;
  temperature.value = pending.temperatureC;
  battery.value = pending.batteryPercent;
  hold();
  result.className = 'warning';
  result.textContent = `Unresolved reading ${pending.id}. Checking for a consumed receipt; keep the exact ID and payload.`;
} else { commandId.value = crypto.randomUUID(); fields.disabled = true; }
async function poll() {
  await refresh();
  if (!stopped) timer = setTimeout(poll, 2000);
}
void poll();
window.addEventListener('pagehide', () => { stopped = true; viewGeneration += 1; clearTimeout(timer); controller?.abort(); });
window.addEventListener('pageshow', () => { if (stopped) { stopped = false; void poll(); } });
