const $ = id => document.getElementById(id);
const pendingKey = 'inventory-pending-v1';
let paused = false, refreshing = false, writing = false, state = null, rendered = '', pending = null;
try {
  const saved = JSON.parse(localStorage.getItem(pendingKey) || 'null');
  if (saved && typeof saved.id === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(saved.id) && typeof saved.kind === 'string') pending = saved;
} catch { /* Recovery storage is optional; keep the on-page receipt and command. */ }
function preserve(command) {
  pending = command;
  try { if (command) localStorage.setItem(pendingKey, JSON.stringify(command)); else localStorage.removeItem(pendingKey); } catch { /* In-memory recovery remains available. */ }
  $('pending').hidden = !pending;
  $('pending-description').textContent = pending ? `Preserved input: ${JSON.stringify(pending)}` : '';
  if (pending) $('lookup-id').value = pending.id;
  $('retry-confirm').checked = false;
  controls();
}
function controls() {
  $('submit').disabled = writing || !!pending || !state?.ready;
  $('retry').disabled = writing || !pending || !state?.ready || !$('retry-confirm').checked;
  $('new-id').disabled = writing || !!pending;
}
function fields() {
  const kind = $('kind').value;
  const usesStock = ['receive', 'reserve', 'transfer'].includes(kind);
  $('stock-fields').hidden = !usesStock;
  for (const id of ['product', 'location', 'units']) $(id).disabled = !usesStock;
  $('destination-field').hidden = kind !== 'transfer';
  $('destination').disabled = kind !== 'transfer';
  const usesReservation = ['reserve', 'release', 'fulfill'].includes(kind);
  $('reservation-field').hidden = !usesReservation;
  $('reservation-id').required = usesReservation;
  $('reservation-id').disabled = !usesReservation;
  $('operation-help').textContent = {
    receive: 'Receiving adds units to the selected location.', reserve: 'Reservations hold available units in place until released or fulfilled.',
    release: 'Release an active reservation. On-hand stock does not change.', fulfill: 'Fulfill an active reservation once. This deducts its units from on-hand stock; no shipment is sent.',
    transfer: 'Transfer only available units. Reserved units remain at the source.',
  }[kind];
}
function newId() { $('command-id').value = `cmd-${crypto.randomUUID()}`; }
$('new-id').addEventListener('click', newId);
$('kind').addEventListener('change', fields);
$('retry-confirm').addEventListener('change', controls);
function row(values, firstHeader = false) {
  const tr = document.createElement('tr');
  values.forEach((value, index) => {
    const td = document.createElement(firstHeader && index === 0 ? 'th' : 'td');
    if (td.tagName === 'TH') td.scope = 'row';
    td.textContent = String(value); tr.append(td);
  });
  return tr;
}
function render(next) {
  state = next;
  $('connection').textContent = next.ready ? 'Log ready · consumer applied' : 'Writes paused · log not ready';
  $('offset').textContent = `Consumed offset ${next.lastOffset ?? 'none'} · ${next.duplicates} duplicate records`;
  $('fault').hidden = !next.fault;
  $('fault').textContent = next.fault || '';
  $('updated').textContent = `Refreshed ${new Date().toLocaleTimeString()}`;
  controls();
  const signature = JSON.stringify([next.catalog, next.stock, next.reservations, next.totals, next.commands]);
  if (rendered === signature || !next.catalog) return;
  rendered = signature;
  const productName = id => next.catalog.products.find(value => value.id === id)?.name || id;
  const locationName = id => next.catalog.locations.find(value => value.id === id)?.name || id;
  $('stock').replaceChildren(...next.catalog.products.map(product => row([
    `${product.name} / ${product.unit === 'roll' ? 'rolls' : 'units'}`,
    ...next.catalog.locations.flatMap(location => {
      const stock = next.stock.find(value => value.productId === product.id && value.locationId === location.id);
      return [stock.onHand, stock.reserved, stock.available];
    }),
  ], true)));
  $('totals').replaceChildren(...next.totals.map(total => {
    const line = document.createElement('p');
    const name = document.createElement('strong'); name.textContent = productName(total.productId);
    const quantity = document.createElement('span'); quantity.textContent = `${total.initial} + ${total.received} = ${total.onHand} + ${total.fulfilled}`;
    line.append(name, quantity); return line;
  }));
  $('reservation-empty').hidden = next.reservations.length !== 0;
  $('reservations').replaceChildren(...next.reservations.map(value => row([`${value.id} / ${productName(value.productId)}`, locationName(value.locationId), value.units, value.status], true)));
  $('commands').replaceChildren(...next.commands.slice(-30).reverse().map(value => row([value.offset, value.id, value.kind, value.accepted ? 'Accepted' : `Rejected: ${value.reason}`])));
  $('command-count').textContent = `${next.commands.length} durable commands`;
}
async function refresh() {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`Snapshot HTTP ${response.status}`);
    render(await response.json());
  } catch (error) {
    $('connection').textContent = `Projection unavailable: ${error.message}`;
    if (state) state = { ...state, ready: false };
    controls();
  } finally { refreshing = false; }
}
function showReceipt(body) { $('receipt').textContent = JSON.stringify(body, null, 2); }
async function submit(command) {
  if (writing) return;
  writing = true; preserve(command);
  $('command-status').textContent = `Waiting for consumed outcome: ${command.id}`;
  try {
    const response = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command), signal: AbortSignal.timeout(75000) });
    const body = await response.json(); showReceipt(body);
    if (body.id === command.id && body.result && body.offset !== undefined) {
      preserve(null);
      $('command-status').textContent = body.result.accepted ? `Accepted at offset ${body.offset}.` : `Durably rejected at offset ${body.offset}: ${body.result.reason}.`;
    } else if (body.outcomeUnknown) {
      $('command-status').textContent = body.error || 'Outcome unknown. Look up the preserved id.';
    } else {
      preserve(null);
      $('command-status').textContent = body.error || `Command HTTP ${response.status}`;
    }
  } catch (error) {
    $('command-status').textContent = `Completion unknown: ${error.message}. The exact input is preserved below. Look up its id before any retry.`;
  } finally { writing = false; controls(); await refresh(); }
}
$('command-form').addEventListener('submit', event => {
  event.preventDefault();
  if (pending || writing || !state?.ready) return;
  const kind = $('kind').value;
  const command = { id: $('command-id').value, kind };
  if (['receive', 'reserve', 'transfer'].includes(kind)) Object.assign(command, { productId: $('product').value, locationId: $('location').value, units: Number($('units').value) });
  if (['reserve', 'release', 'fulfill'].includes(kind)) command.reservationId = $('reservation-id').value;
  if (kind === 'transfer') command.destinationId = $('destination').value;
  void submit(command);
});
$('lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  const id = $('lookup-id').value;
  try {
    const response = await fetch(`/api/commands/${encodeURIComponent(id)}`, { cache: 'no-store', signal: AbortSignal.timeout(10000) });
    const body = await response.json(); showReceipt(body);
    if (response.ok && body.id === id) {
      if (pending?.id === id) preserve(null);
      $('command-status').textContent = `Receipt found at offset ${body.offset}: ${body.result.accepted ? 'accepted' : `rejected (${body.result.reason})`}.`;
    } else $('command-status').textContent = body.error || `Receipt lookup HTTP ${response.status}`;
  } catch (error) { $('command-status').textContent = `Receipt lookup unavailable: ${error.message}`; }
  await refresh();
});
$('retry').addEventListener('click', () => {
  if (pending && $('retry-confirm').checked && state?.ready && !writing) void submit(pending);
});
$('updates').addEventListener('click', () => {
  paused = !paused;
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  $('updates').setAttribute('aria-pressed', String(paused));
  if (!paused) void refresh();
});
$('refresh').addEventListener('click', () => { void refresh(); });
newId(); fields(); preserve(pending); void refresh();
setInterval(() => { if (!paused) void refresh(); }, 2500);
