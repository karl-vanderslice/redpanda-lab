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
  if (device) sequence.value = String((device.last?.sequence || 0) + 1);
}
function preset(kind) {
  const device = chosen();
  if (!device) return;
  temperature.value = String(kind === 'hot' ? device.maxC + 5 : device.normalC);
  battery.value = kind === 'low' ? '10' : '90';
}
function render(snapshot) {
  state = snapshot;
  byId('connection').textContent = snapshot.ready
    ? `Gateway ready · ${paused ? 'automatic updates paused' : 'updates every 2 seconds'}`
    : 'Gateway paused · inspect the unresolved reading and restart to replay';
  byId('connection').className = snapshot.ready ? 'status' : 'warning';
  byId('offset').textContent = `Offset ${snapshot.lastOffset ?? '—'} · duplicate records ${snapshot.duplicates}`;
  byId('devices').replaceChildren(...snapshot.devices.map(device => {
    const card = element('article');
    card.append(element('h3', device.id), element('p', `Safe: ${device.minC} to ${device.maxC} °C · battery ≥ ${device.lowBatteryBelow}%`, 'muted'));
    card.append(element('p', device.last ? `${device.last.temperatureC} °C · ${device.last.batteryPercent}% battery · sequence ${device.last.sequence}` : 'No reading yet'));
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
  fields.disabled = false;
  retry.hidden = true;
  commandId.value = crypto.randomUUID();
  nextSequence();
}
async function refresh() {
  if (stopped || paused || controller) return;
  controller = new AbortController();
  try {
    const response = await fetch('/api/state', { signal: controller.signal });
    if (!response.ok) throw new Error(`State unavailable (${response.status}).`);
    const snapshot = await response.json();
    if (stopped || paused) return;
    render(snapshot);
    if (pending && !sending) {
      const receipt = snapshot.operations.find(operation => operation.command.id === pending.id);
      if (receipt && Object.entries(pending).every(([key, value]) => receipt.command[key] === value)) complete(receipt);
    }
  } catch (error) {
    if (!stopped && !paused) {
      byId('connection').textContent = `Updates unavailable: ${error.message}`;
      byId('connection').className = 'error';
    }
  } finally { controller = null; }
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
      // An unavailable refresh cannot undo an already observed consumed receipt.
      try {
        const snapshotResponse = await fetch('/api/state', { signal: AbortSignal.timeout(10000) });
        if (!snapshotResponse.ok) throw new Error(`State unavailable (${snapshotResponse.status}).`);
        render(await snapshotResponse.json());
        nextSequence();
      } catch (error) {
        byId('connection').textContent = `Reading consumed; updates unavailable: ${error.message}`;
        byId('connection').className = 'error';
      }
    } else {
      result.className = 'error';
      result.textContent = body.error || `Reading rejected (${response.status}).`;
      pending = null;
      savePending();
      fields.disabled = false;
      retry.hidden = true;
      commandId.value = crypto.randomUUID();
    }
  } catch (error) {
    result.className = 'warning';
    result.textContent = `${error.message} Completion may be unknown. Keep ID ${pending.id} and these exact values. Inspect state; restart the app to replay, then retry this same reading. Never submit a replacement.`;
  } finally {
    sending = false;
    if (pending) hold();
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
  byId('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  byId('updates').setAttribute('aria-pressed', String(paused));
  if (paused) { controller?.abort(); byId('connection').textContent = 'Automatic updates paused'; }
  else void refresh();
});
if (pending) {
  commandId.value = pending.id;
  deviceInput.value = pending.deviceId;
  sequence.value = pending.sequence;
  temperature.value = pending.temperatureC;
  battery.value = pending.batteryPercent;
  hold();
  result.className = 'warning';
  result.textContent = `Unresolved reading ${pending.id}. Checking for a consumed receipt; keep the exact ID and payload.`;
} else commandId.value = crypto.randomUUID();
async function poll() {
  await refresh();
  if (!stopped) timer = setTimeout(poll, 2000);
}
void poll();
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); controller?.abort(); });
