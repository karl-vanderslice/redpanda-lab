function viewError(text) {
  const region = document.getElementById('view-error');
  if (region.textContent !== text) region.textContent = text;
}
const $ = id => document.getElementById(id);
const mutations = [...document.querySelectorAll('[data-mutation]')];
let state = null, pending = null, busy = false, paused = false, timer, controller, stopped = false, generation = 0, observedAt = null, absentReceipt = false;
try {
  const saved = JSON.parse(localStorage.getItem('logistics-pending') || 'null');
  if (saved && typeof saved.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(saved.id)) pending = saved;
} catch { /* Storage is optional; receipt ids also appear on screen. */ }
$('trip-id').value = `trip-${crypto.randomUUID().slice(0, 8)}`;
function controls() {
  for (const form of document.querySelectorAll('form')) {
    for (const input of form.querySelectorAll('input, select, button')) input.disabled = busy || Boolean(pending) || !state?.ready;
  }
  for (const button of mutations) button.disabled = busy || Boolean(pending) || !state?.ready;
  $('lookup').hidden = !pending;
  $('lookup').disabled = busy;
  $('pending-command').hidden = !pending;
  $('pending-command').textContent = pending ? JSON.stringify(pending, null, 2) : '';
  $('retry-panel').hidden = !pending || !absentReceipt;
  $('retry').disabled = busy || !pending || !absentReceipt || !state?.ready || !$('reconciled').checked;
}
function freshness(stale = false) {
  $('freshness').textContent = observedAt ? `${stale ? 'Stale view' : paused ? 'Paused view' : 'View observed'} · ${observedAt.toLocaleTimeString()}. Not a location observation time.` : 'No state observed yet.';
}
function remember(command) {
  pending = command;
  absentReceipt = false;
  $('reconciled').checked = false;
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
function row(values, labels) {
  const node = element('tr');
  values.forEach((value, index) => { const cell = element('td', value); cell.dataset.label = labels[index]; node.append(cell); });
  return node;
}
const position = point => `(${point.x}, ${point.y})`;
function svg(tag, attributes = {}, text) {
  const node = document.createElementNS('http://www.w3.org/2000/svg', tag);
  for (const [key, value] of Object.entries(attributes)) node.setAttribute(key, value);
  if (text !== undefined) node.textContent = text;
  return node;
}
const sx = x => 35 + x * 20;
const sy = y => 425 - y * 20;
function render(next) {
  state = next; observedAt = new Date(); freshness();
  viewError(next.ready ? '' : next.fault || 'Event log unavailable. Keep original mutation IDs.');
  $('connection').textContent = next.ready ? `Consumed events only${paused ? ' · view paused' : ''}` : next.fault || 'Event log unavailable';
  $('connection').className = next.ready ? 'status' : 'warning';
  $('fleet-count').textContent = `${next.available} available · ${next.drivers.length - next.available} busy`;
  $('drivers').replaceChildren(...next.drivers.map(driver => row([`${driver.name} · ${driver.id}`, position(driver.position), driver.tripId ? 'Busy' : 'Available', driver.tripId || '—'], ['Driver', 'Position', 'Availability', 'Active trip'])));
  $('trips').replaceChildren(...next.trips.map(trip => row([trip.id, trip.driverId, trip.status, `${position(trip.pickup)} → ${position(trip.destination)}`], ['Trip', 'Driver', 'Status', 'Pickup → destination'])));
  $('trip-empty').hidden = next.trips.length > 0; $('trip-empty').textContent = 'No trips recorded.';
  $('offset').textContent = `${next.topic} · partition 0 · offset ${next.lastOffset ?? 'none'} · ${next.duplicates} duplicate events`;
  $('receipts').replaceChildren(...next.commands.slice(-8).reverse().map(command => element('li', `${command.kind} · ${command.id} · offset ${command.offset} · ${command.accepted ? 'accepted' : command.reason}`)));
  if (!next.commands.length) $('receipts').append(element('li', 'No command receipts recorded.'));
  const shapes = [];
  for (let n = 0; n <= 20; n += 5) {
    shapes.push(svg('line', { x1: sx(n), y1: sy(0), x2: sx(n), y2: sy(20), class: 'axis' }));
    shapes.push(svg('line', { x1: sx(0), y1: sy(n), x2: sx(20), y2: sy(n), class: 'axis' }));
    shapes.push(svg('text', { x: sx(n), y: 448, 'text-anchor': 'middle' }, `${n}`));
    if (n > 0) shapes.push(svg('text', { x: 5, y: sy(n) + 4 }, `${n}`));
  }
  for (const trip of next.trips.filter(trip => ['assigned', 'picked-up'].includes(trip.status))) {
    const line = svg('line', { x1: sx(trip.pickup.x), y1: sy(trip.pickup.y), x2: sx(trip.destination.x), y2: sy(trip.destination.y), class: 'route' });
    line.append(svg('title', {}, `${trip.id}: endpoint connector ${position(trip.pickup)} to ${position(trip.destination)}; not a road path`)); shapes.push(line);
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
  if (controller || stopped || (automatic && paused)) return;
  const ownController = new AbortController(), ownGeneration = generation;
  controller = ownController; $('refresh').disabled = true;
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.any([ownController.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error(`State request failed (${response.status}).`);
    const next = await response.json();
    if (!stopped && generation === ownGeneration && !(automatic && paused)) render(next);
  } catch (error) {
    if (!stopped && error.name !== 'AbortError' && generation === ownGeneration && !(automatic && paused)) {
      if (state) state = { ...state, ready: false };
      controls(); $('connection').textContent = `Disconnected: ${error.message} Last observed coordinates remain visible.`; $('connection').className = 'error'; freshness(true);
      viewError($('connection').textContent);
    }
  } finally { if (controller === ownController) controller = null; $('refresh').disabled = false; }
}
function sameCommand(a, b) {
  if (a === b) return true;
  if (!a || !b || typeof a !== 'object' || typeof b !== 'object') return false;
  const keys = Object.keys(a);
  return keys.length === Object.keys(b).length && keys.every(key => Object.hasOwn(b, key) && sameCommand(a[key], b[key]));
}
function settled(operation) {
  if (pending && !sameCommand(operation.command, pending)) throw new Error('Receipt payload differs from the retained original command. Keep its ID and reconcile the conflict.');
  feedback(`${operation.result.accepted ? 'Recorded' : 'Rejected'}: ${operation.command.kind} · ${operation.id} · offset ${operation.offset}${operation.result.reason ? ` · ${operation.result.reason}` : ''}`, !operation.result.accepted);
  remember(null);
}
async function submitPending() {
  if (busy || !pending || !state?.ready) return;
  const command = pending;
  busy = true; absentReceipt = false; $('reconciled').checked = false; controls();
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
  } finally { busy = false; controls(); if (!paused) await refresh(); }
}
async function mutate(command) {
  if (busy || pending || !state?.ready) return;
  remember({ ...command, id: crypto.randomUUID() });
  await submitPending();
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
    else {
      absentReceipt = response.status === 404;
      $('reconciled').checked = false;
      feedback(`Mutation ${id}: ${value.error} Stop the old writer, reconcile the broker and restart to replay before retrying an absent receipt.`, true);
    }
  } catch (error) { feedback(`Mutation ${id}: receipt lookup failed (${error.message}). Keep this id.`, true); }
  finally { busy = false; controls(); if (!paused) await refresh(); }
});
$('reconciled').addEventListener('change', controls);
$('retry').addEventListener('click', () => {
  if (pending && absentReceipt && $('reconciled').checked && state?.ready && !busy) void submitPending();
});
$('refresh').addEventListener('click', () => { void refresh(); });
function schedule() {
  clearTimeout(timer);
  if (paused || stopped) return;
  timer = setTimeout(async () => { await refresh(true); schedule(); }, 2000);
}
$('updates').addEventListener('click', () => {
  paused = !paused; generation += 1; controller?.abort();
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  $('updates').setAttribute('aria-pressed', String(paused));
  if (paused) { $('connection').textContent = 'Automatic view updates paused. Commands, lookup and manual refresh still work.'; freshness(); }
  else void refresh();
  schedule();
});
window.addEventListener('pagehide', () => { stopped = true; generation += 1; clearTimeout(timer); controller?.abort(); });
window.addEventListener('pageshow', () => { if (stopped) { stopped = false; void refresh(); schedule(); } });
if (pending) feedback(`Pending mutation ${pending.id}. Look up its receipt before another action.`, true);
controls();
await refresh();
schedule();
