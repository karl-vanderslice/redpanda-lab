const $ = id => document.getElementById(id);
const mutations = [...document.querySelectorAll('[data-mutation]')];
let state = null, pending = null, busy = false, paused = false, timer, refreshInFlight = false, stopped = false;
try {
  const saved = JSON.parse(localStorage.getItem('logistics-pending') || 'null');
  if (saved && typeof saved.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(saved.id)) pending = saved;
} catch { /* Storage is optional; receipt ids also appear on screen. */ }
$('trip-id').value = `trip-${crypto.randomUUID().slice(0, 8)}`;
function controls() {
  for (const button of mutations) button.disabled = busy || Boolean(pending) || !state?.ready;
  $('lookup').hidden = !pending;
  $('lookup').disabled = busy;
}
function remember(command) {
  pending = command;
  try {
    if (command) localStorage.setItem('logistics-pending', JSON.stringify(command));
    else localStorage.removeItem('logistics-pending');
  } catch { /* Stable id remains visible if storage is blocked. */ }
  controls();
}
function feedback(message, error = false) {
  $('feedback').textContent = message;
  $('feedback').className = error ? 'error' : 'status';
}
function element(tag, text) {
  const node = document.createElement(tag);
  if (text !== undefined) node.textContent = text;
  return node;
}
function row(values) {
  const node = element('tr');
  for (const value of values) node.append(element('td', value));
  return node;
}
const position = point => `(${point.x}, ${point.y})`;
function svg(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
const sx = x => 20 + x * 20;
const sy = y => 420 - y * 20;
function render(next) {
  state = next;
  $('connection').textContent = next.ready ? 'Live projection · consumed events only' : next.fault || 'Event log unavailable';
  $('connection').className = next.ready ? 'status' : 'warning';
  $('fleet-count').textContent = `${next.available} available · ${next.drivers.length - next.available} busy`;
  $('drivers').replaceChildren(...next.drivers.map(driver => row([`${driver.name} · ${driver.id}`, position(driver.position), driver.tripId ? 'Busy' : 'Available', driver.tripId || '—'])));
  $('trips').replaceChildren(...next.trips.map(trip => row([trip.id, trip.driverId, trip.status, `${position(trip.pickup)} → ${position(trip.destination)}`])));
  $('trip-empty').hidden = next.trips.length > 0;
  $('offset').textContent = `${next.topic} · partition 0 · offset ${next.lastOffset ?? 'none'} · ${next.duplicates} duplicate events`;
  $('receipts').replaceChildren(...next.commands.slice(-8).reverse().map(command => element('li', `${command.kind} · ${command.id} · offset ${command.offset} · ${command.accepted ? 'accepted' : command.reason}`)));
  const shapes = [];
  for (let n = 0; n <= 20; n += 5) {
    shapes.push(svg('line', { x1: sx(n), y1: sy(0), x2: sx(n), y2: sy(20), class: 'axis' }));
    shapes.push(svg('line', { x1: sx(0), y1: sy(n), x2: sx(20), y2: sy(n), class: 'axis' }));
    shapes.push(svg('text', { x: sx(n), y: 438, 'text-anchor': 'middle' }, `${n}`));
    if (n > 0) shapes.push(svg('text', { x: 0, y: sy(n) + 4 }, `${n}`));
  }
  for (const trip of next.trips.filter(trip => ['assigned', 'picked-up'].includes(trip.status))) {
    const line = svg('line', { x1: sx(trip.pickup.x), y1: sy(trip.pickup.y), x2: sx(trip.destination.x), y2: sy(trip.destination.y), class: 'route' });
    line.append(svg('title', {}, `${trip.id}: ${position(trip.pickup)} to ${position(trip.destination)}`)); shapes.push(line);
    shapes.push(svg('circle', { cx: sx(trip.pickup.x), cy: sy(trip.pickup.y), r: 8, class: 'pickup' }));
    shapes.push(svg('rect', { x: sx(trip.destination.x) - 5, y: sy(trip.destination.y) - 5, width: 10, height: 10, class: 'destination' }));
  }
  for (const driver of next.drivers) {
    const marker = svg('circle', { cx: sx(driver.position.x), cy: sy(driver.position.y), r: 5, class: 'driver' });
    marker.append(svg('title', {}, `${driver.name} ${position(driver.position)} ${driver.tripId ? 'busy' : 'available'}`)); shapes.push(marker);
    shapes.push(svg('text', { x: Math.min(sx(driver.position.x) + 9, 365), y: Math.max(sy(driver.position.y) - 9, 14) }, driver.name));
  }
  $('map').replaceChildren(...shapes);
  controls();
}
async function refresh(automatic = false) {
  if (refreshInFlight || stopped) return;
  refreshInFlight = true;
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`State request failed (${response.status}).`);
    const next = await response.json();
    if (!stopped && !(automatic && paused)) render(next);
  } catch (error) {
    if (!stopped && !(automatic && paused)) { state = null; controls(); $('connection').textContent = `Disconnected: ${error.message}`; }
  } finally { refreshInFlight = false; }
}
function settled(operation) {
  feedback(`${operation.result.accepted ? 'Recorded' : 'Rejected'}: ${operation.command.kind} · ${operation.id} · offset ${operation.offset}${operation.result.reason ? ` · ${operation.result.reason}` : ''}`, !operation.result.accepted);
  remember(null);
}
async function mutate(command) {
  if (busy || pending || !state?.ready) return;
  busy = true;
  command.id = crypto.randomUUID();
  remember(command);
  feedback(`Recording ${command.kind} · mutation ${command.id}…`);
  try {
    const response = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(70000) });
    const value = await response.json();
    if (value.result && (response.ok || response.status === 409)) settled(value);
    else if (response.status < 500 && !value.outcomeUnknown) {
      feedback(`${value.error} · mutation ${command.id}`, true); remember(null);
    } else throw new Error(value.error || `Request failed (${response.status})`);
  } catch (error) {
    feedback(`Outcome unknown · mutation ${command.id}. ${error.message}. Look up the receipt; do not submit a replacement.`, true);
  } finally { busy = false; controls(); await refresh(); }
}
$('request').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  void mutate({ kind: 'request', tripId: data.get('tripId'), pickup: { x: Number(data.get('px')), y: Number(data.get('py')) }, destination: { x: Number(data.get('dx')), y: Number(data.get('dy')) } });
});
$('location').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  void mutate({ kind: 'location', driverId: data.get('driverId'), position: { x: Number(data.get('x')), y: Number(data.get('y')) } });
});
$('progress').addEventListener('submit', event => {
  event.preventDefault(); const data = new FormData(event.currentTarget);
  void mutate({ kind: event.submitter?.value || 'pickup', tripId: data.get('tripId') });
});
$('lookup').addEventListener('click', async () => {
  if (!pending || busy) return;
  busy = true; controls();
  const id = pending.id;
  try {
    const response = await fetch(`/api/commands/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const value = await response.json();
    if (response.ok) settled(value);
    else feedback(`Mutation ${id}: ${value.error} Stop the old writer and reconcile the broker before retrying an absent receipt.`, true);
  } catch (error) { feedback(`Mutation ${id}: receipt lookup failed (${error.message}). Keep this id.`, true); }
  finally { busy = false; controls(); await refresh(); }
});
function schedule() {
  clearTimeout(timer);
  if (paused || stopped) return;
  timer = setTimeout(async () => { await refresh(true); schedule(); }, 2000);
}
$('updates').addEventListener('click', () => {
  paused = !paused;
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  $('updates').setAttribute('aria-pressed', String(paused));
  if (!paused) void refresh();
  schedule();
});
window.addEventListener('pagehide', () => { stopped = true; clearTimeout(timer); });
window.addEventListener('pageshow', () => { if (stopped) { stopped = false; void refresh(); schedule(); } });
if (pending) feedback(`Pending mutation ${pending.id}. Look up its receipt before another action.`, true);
controls();
await refresh();
schedule();
