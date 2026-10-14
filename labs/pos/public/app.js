const $ = id => document.getElementById(id);
const form = $('basket-form');
const prices = { coffee: 350, sandwich: 725, cookie: 225 };
const money = cents => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(cents / 100);
const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const rows = new Map();
let state, busy = false, locked = false, activeStatus = null, paused = false, timer, controller, generation = 0;
$('checkout-id').value = newId('sale');
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : 'status'; }
function controls() {
  const ready = state?.ready === true;
  for (const input of form.querySelectorAll('input, select')) input.disabled = locked || busy || !ready;
  $('source').disabled = locked || busy || !ready || $('tender').value === 'cash';
  $('pay').disabled = locked || busy || !ready || !state.providers[$('tender').value].available;
  $('new-checkout').disabled = busy || (locked && !['completed', 'declined', 'rejected'].includes(activeStatus));
  $('lookup').disabled = busy;
  for (const row of rows.values()) {
    row.refund.disabled = busy || !ready || !row.refundable;
    row.resume.disabled = busy || !ready || !row.resumable;
  }
}
function tenderChanged() {
  const tender = $('tender').value;
  $('source-label').hidden = tender === 'cash';
  const values = state?.sources[tender] || [];
  const previous = $('source').value;
  $('source').replaceChildren(...values.map(value => {
    const option = document.createElement('option'); option.value = value; option.textContent = value; return option;
  }));
  if (values.includes(previous)) $('source').value = previous;
  providerDescription(); controls();
}
function providerDescription() {
  const tender = $('tender').value;
  const provider = state?.providers[tender];
  $('provider-state').textContent = tender === 'cash' ? 'Cash records tender locally. No payment service is called.' : provider?.available ? `${tender === 'stripe' ? 'Stripe test mode' : 'Square sandbox'} is configured. Checkout calls the real sandbox API.` : provider?.reason || 'Checking sandbox configuration…';
}
function basketTotal() {
  const total = Object.entries(prices).reduce((sum, [sku, price]) => sum + price * Number(form.elements[sku].value || 0), 0);
  $('basket-total').textContent = `Total ${money(total)}`;
}
form.addEventListener('input', basketTotal);
$('tender').addEventListener('change', tenderChanged);
$('new-checkout').addEventListener('click', () => {
  locked = false; activeStatus = null; $('checkout-id').value = newId('sale'); message('New ID ready. Set quantities, then checkout.'); controls();
});
async function json(path, body) {
  const response = await fetch(path, { ...(body !== undefined ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : {}), signal: AbortSignal.timeout(75000) });
  const value = await response.json();
  if (!response.ok && !value.operation) throw Object.assign(new Error(value.error || 'Request failed.'), { code: response.status, unknown: value.outcomeUnknown });
  return value;
}
function describe(operation) {
  return `${operation.kind === 'refund' ? 'Refund' : 'Checkout'} ${operation.id}: ${operation.status}, ${money(operation.amountCents)}. ${operation.status === 'unknown' || operation.status === 'pending' ? 'Keep this ID. Use Resume to reconcile; do not submit a replacement.' : operation.status === 'completed' ? 'Receipt committed.' : 'No completed tender recorded.'}`;
}
async function action(path, body, checkoutAction = false) {
  busy = true; controls();
  try {
    const result = await json(path, body);
    if (checkoutAction) activeStatus = result.operation.status;
    message(describe(result.operation), result.operation.status === 'unknown' || result.operation.status === 'declined');
  } catch (error) {
    if (checkoutAction) activeStatus = error.code && error.code < 500 && !error.unknown ? 'rejected' : 'unknown';
    message(`${error.message} ${!error.code || error.code >= 500 || error.unknown ? 'Completion may be unknown. Keep the original ID and look it up before resuming.' : ''}`, true);
  } finally {
    busy = false;
    try { await refresh(); } catch { /* The original action result stays visible. */ }
    controls();
  }
}
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || locked) return;
  const tender = $('tender').value;
  const command = { id: $('checkout-id').value, tender, basket: Object.keys(prices).map(sku => ({ sku, quantity: Number(form.elements[sku].value) })).filter(item => item.quantity !== 0), ...(tender !== 'cash' ? { source: $('source').value } : {}) };
  locked = true; activeStatus = 'unknown';
  await action('/api/checkouts', command, true);
});
$('lookup').addEventListener('click', async () => {
  busy = true; controls();
  try {
    const result = await json(`/api/operations/${encodeURIComponent($('checkout-id').value)}`);
    locked = true; activeStatus = result.operation.status; message(describe(result.operation));
  } catch (error) { message(`${error.message} Keep the ID if a request was interrupted.`, true); }
  finally { busy = false; controls(); }
});
function makeRow(operation) {
  const tr = document.createElement('tr');
  const cells = Array.from({ length: 5 }, () => { const td = document.createElement('td'); tr.append(td); return td; });
  const actions = document.createElement('td'); actions.className = 'actions'; tr.append(actions);
  const refund = document.createElement('button'); refund.type = 'button'; refund.textContent = 'Full refund'; refund.setAttribute('aria-label', `Full refund for ${operation.id}`);
  const resume = document.createElement('button'); resume.type = 'button'; resume.textContent = 'Resume'; resume.setAttribute('aria-label', `Resume ${operation.id}`);
  actions.append(refund, resume);
  const row = { tr, cells, refund, resume, refundId: null, refundable: false, resumable: false };
  refund.addEventListener('click', () => {
    row.refundId ||= newId('refund');
    message(`Refund ID ${row.refundId}. Keep this ID if the request is interrupted.`);
    void action('/api/refunds', { id: row.refundId, checkoutId: operation.id });
  });
  resume.addEventListener('click', () => { void action(`/api/operations/${encodeURIComponent(operation.id)}/resume`, {}); });
  $('receipts').append(tr); rows.set(operation.id, row); return row;
}
function render(value) {
  const first = !state; state = value;
  $('connection').textContent = value.ready ? `Ledger ready · ${value.totals.salesCount} sales · ${value.totals.unsettledCount} unsettled${paused ? ' · updates paused' : ''}` : value.fault || 'Ledger unavailable. Keep operation IDs.';
  $('connection').className = value.ready ? 'status' : 'warning';
  for (const [id, field] of [['gross', 'grossCents'], ['refunded', 'refundedCents'], ['net', 'netCents'], ['cash', 'cashBalanceCents']]) $(id).textContent = money(value.totals[field]);
  $('offset').textContent = `Offset ${value.lastOffset ?? '—'} · ${value.duplicates} duplicate records`;
  $('empty').hidden = value.operations.length !== 0;
  const reserved = new Set(value.operations.filter(operation => operation.kind === 'refund').map(operation => operation.command.checkoutId));
  for (const operation of value.operations) {
    const row = rows.get(operation.id) || makeRow(operation);
    const text = [`${operation.kind} · ${operation.id}`, operation.kind === 'refund' ? `Receipt ${operation.command.checkoutId}` : operation.lines.map(line => `${line.quantity} × ${line.name}`).join(', '), money(operation.amountCents), operation.tender, `${operation.status} · ${operation.reason}`];
    row.cells.forEach((cell, index) => { cell.textContent = text[index]; });
    row.refundable = operation.kind === 'checkout' && operation.status === 'completed' && !reserved.has(operation.id);
    row.resumable = ['pending', 'unknown'].includes(operation.status);
    row.refund.hidden = operation.kind !== 'checkout'; row.resume.hidden = !row.resumable;
    if (locked && operation.id === $('checkout-id').value) activeStatus = operation.status;
  }
  $('provider-summary').textContent = ['stripe', 'square'].map(provider => `${provider === 'stripe' ? 'Stripe test mode' : 'Square sandbox'}: ${value.providers[provider].available ? 'available (credentials configured; connectivity checked at checkout)' : 'disabled'}`).join(' · ');
  if (first) tenderChanged(); else { providerDescription(); controls(); }
}
async function refresh() { render(await json('/api/state')); }
async function poll() {
  if (paused) return;
  const ownGeneration = generation;
  const ownController = new AbortController();
  controller = ownController;
  try {
    const response = await fetch('/api/state', { signal: ownController.signal });
    if (!response.ok) throw new Error('State unavailable');
    const value = await response.json(); if (!paused && generation === ownGeneration) render(value);
  } catch (error) {
    if (error.name !== 'AbortError' && generation === ownGeneration) { $('connection').textContent = 'Connection lost. Keep original operation IDs.'; state = state ? { ...state, ready: false } : undefined; controls(); }
  } finally {
    if (controller === ownController) controller = null;
    if (!paused && generation === ownGeneration) timer = setTimeout(poll, 2000);
  }
}
$('updates').addEventListener('click', () => {
  paused = !paused; generation += 1; clearTimeout(timer); controller?.abort();
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; $('updates').setAttribute('aria-pressed', String(paused));
  if (paused) $('connection').textContent = 'Updates paused. Checkout and lookup still work.';
  else void poll();
});
controls(); void poll();
