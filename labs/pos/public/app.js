function viewError(text) {
  const region = document.getElementById('view-error');
  if (region.textContent !== text) region.textContent = text;
}
const $ = id => document.getElementById(id);
const form = $('basket-form');
const prices = { coffee: 350, sandwich: 725, cookie: 225 };
const formatter = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const money = cents => formatter.format(cents / 100);
const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const rows = new Map();
let state, busy = false, locked = false, activeStatus = null, paused = false, timer, controller, generation = 0, stopped = false, observedAt = null;
let pending = null;
try {
  const saved = JSON.parse(sessionStorage.getItem('pos-pending') || 'null');
  if (saved && ['/api/checkouts', '/api/refunds'].includes(saved.path) && typeof saved.body?.id === 'string') pending = saved;
} catch { /* IDs and payloads remain visible when storage is denied. */ }
let absentReceipt = false;
function remember(value) {
  pending = value;
  absentReceipt = false; $('retry-reconciled').checked = false;
  try {
    if (value) sessionStorage.setItem('pos-pending', JSON.stringify(value));
    else sessionStorage.removeItem('pos-pending');
  } catch { /* Recovery also works without browser storage. */ }
  recovery();
}
function message(text, error = false) { $('message').textContent = text; $('message').className = error ? 'error' : 'status'; }
function currentId() { return pending?.body.id || $('checkout-id').value; }
function recovery() {
  $('recovery-id').textContent = pending ? `Retained original operation ID: ${pending.body.id}` : `Checkout ID: ${$('checkout-id').value}`;
  $('recovery-payload').hidden = !pending;
  $('recovery-payload').textContent = pending ? JSON.stringify(pending.body, null, 2) : '';
  $('retry-panel').hidden = !pending || !absentReceipt || Boolean(state?.operations.some(item => item.id === pending.body.id));
}
function freshness(stale = false) {
  $('freshness').textContent = observedAt ? `${stale ? 'Stale view' : paused ? 'Paused view' : 'View observed'} · ${observedAt.toLocaleTimeString()}. Not a payment timestamp.` : 'No state observed yet.';
}
function controls() {
  const ready = state?.ready === true;
  const retained = Boolean(pending);
  for (const input of form.querySelectorAll('input, select')) input.disabled = locked || busy || retained || !ready;
  $('source').disabled = locked || busy || retained || !ready || $('tender').value === 'cash';
  $('pay').disabled = locked || busy || retained || !ready || !state?.providers[$('tender').value]?.available;
  $('new-checkout').disabled = busy || retained || (locked && !['completed', 'declined', 'rejected'].includes(activeStatus));
  $('lookup').disabled = busy;
  const operation = state?.operations.find(item => item.id === currentId());
  $('resume-current').hidden = !operation || !['pending', 'unknown'].includes(operation.status);
  $('resume-current').disabled = busy || !ready || !state?.providers[operation?.tender]?.available;
  const retryTender = pending?.path === '/api/checkouts' ? pending.body.tender : state?.operations.find(item => item.id === pending?.body.checkoutId)?.tender;
  const retryProvider = state?.providers[retryTender];
  $('retry-original').disabled = busy || !ready || !pending || !absentReceipt || Boolean(operation) || !$('retry-reconciled').checked || !retryProvider?.available;
  $('retry-reason').textContent = !pending ? '' : !ready ? 'The ledger must be ready after replay.' : !retryTender ? 'The original receipt must be available before retrying its refund.' : !retryProvider?.available ? retryProvider?.reason || 'Original tender unavailable.' : 'Retry sends the original ID and unchanged payload. An absent receipt alone is not authorization to retry.';
  for (const row of rows.values()) {
    row.refund.disabled = busy || retained || !ready || !row.refundable || !row.providerAvailable;
    row.resume.disabled = busy || !ready || !row.resumable || !row.providerAvailable || (retained && pending.body.id !== row.id);
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
  $('provider-state').textContent = tender === 'cash' ? 'Cash records tender locally. No payment service is called.' : provider?.available ? `${tender === 'stripe' ? 'Stripe test mode' : 'Square sandbox'} is configured. Connectivity is checked at checkout, not here.` : provider?.reason || 'Checking sandbox configuration…';
}
function basketTotal() {
  const total = Object.entries(prices).reduce((sum, [sku, price]) => sum + price * Number(form.elements[sku].value || 0), 0);
  $('basket-total').textContent = `Total ${money(total)} · ${total} cents`;
}
function sameRequest(operation, request) {
  if (operation.id !== request.body.id || operation.kind !== (request.path === '/api/refunds' ? 'refund' : 'checkout')) return false;
  return Object.entries(request.body).every(([key, value]) => key === 'basket'
    ? JSON.stringify([...value].sort((a, b) => a.sku.localeCompare(b.sku))) === JSON.stringify(operation.command.basket)
    : operation.command[key] === value);
}
function observeOperation(operation) {
  if (operation.id === $('checkout-id').value && operation.kind === 'checkout') { locked = true; activeStatus = operation.status; }
  if (pending && sameRequest(operation, pending) && ['completed', 'declined'].includes(operation.status)) remember(null);
}
async function json(path, body) {
  const response = await fetch(path, { ...(body !== undefined ? { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(body) } : { cache: 'no-store' }), signal: AbortSignal.timeout(75000) });
  const value = await response.json();
  if (!response.ok && !value.operation) throw Object.assign(new Error(value.error || 'Request failed.'), { code: response.status, unknown: value.outcomeUnknown, operationId: value.operationId });
  return value;
}
function describe(operation) {
  return `${operation.kind === 'refund' ? 'Refund' : 'Checkout'} ${operation.id}: ${operation.status}, ${money(operation.amountCents)} (${operation.amountCents} cents). ${['unknown', 'pending'].includes(operation.status) ? 'Keep this ID. Resume reconciles the original operation; do not submit a replacement.' : operation.status === 'completed' ? 'Receipt committed.' : 'No completed tender recorded.'}`;
}
async function action(path, body, checkoutAction = false) {
  if (busy) return;
  busy = true; absentReceipt = false; $('retry-reconciled').checked = false; recovery(); controls();
  try {
    const result = await json(path, body);
    if (checkoutAction) activeStatus = result.operation.status;
    observeOperation(result.operation);
    message(describe(result.operation), ['unknown', 'declined'].includes(result.operation.status));
  } catch (error) {
    const uncertain = !error.code || error.code >= 500 || error.unknown || Boolean(error.operationId);
    if (checkoutAction) activeStatus = uncertain ? 'unknown' : 'rejected';
    // Only a definitive rejection before ledger admission releases this input.
    if (!uncertain && pending?.path === path && pending.body.id === body.id) remember(null);
    message(`${error.message} ${uncertain ? `Keep original ID ${currentId()} and the retained payload. Look up its consumed receipt before resuming.` : ''}`, true);
  } finally {
    busy = false;
    if (!paused) await refresh();
    recovery(); controls();
  }
}
form.addEventListener('input', basketTotal);
$('tender').addEventListener('change', tenderChanged);
form.addEventListener('submit', async event => {
  event.preventDefault();
  if (busy || locked || pending || !state?.ready) return;
  const tender = $('tender').value;
  const command = { id: $('checkout-id').value, tender, basket: Object.keys(prices).map(sku => ({ sku, quantity: Number(form.elements[sku].value) })).filter(item => item.quantity !== 0), ...(tender !== 'cash' ? { source: $('source').value } : {}) };
  locked = true; activeStatus = 'unknown';
  remember({ path: '/api/checkouts', body: command });
  await action('/api/checkouts', command, true);
});
$('new-checkout').addEventListener('click', () => {
  if (busy || pending) return;
  locked = false; activeStatus = null; $('checkout-id').value = newId('sale'); message('New checkout ID ready.'); recovery(); controls();
});
$('lookup').addEventListener('click', async () => {
  if (busy) return;
  busy = true; controls();
  absentReceipt = false; $('retry-reconciled').checked = false;
  try {
    const result = await json(`/api/operations/${encodeURIComponent(currentId())}`);
    if (pending && !sameRequest(result.operation, pending)) throw new Error('This receipt does not match the retained request. Keep the original ID and payload; reconcile the conflict.');
    observeOperation(result.operation); message(describe(result.operation));
  } catch (error) {
    absentReceipt = Boolean(pending) && error.code === 404;
    message(`${error.message} Keep original ID ${currentId()}. An absent receipt does not prove the request failed. Stop the old writer, reconcile the broker and restart to replay before retrying.`, true);
  }
  finally { busy = false; recovery(); controls(); if (!paused) await refresh(); }
});
$('resume-current').addEventListener('click', () => { void action(`/api/operations/${encodeURIComponent(currentId())}/resume`, {}); });
$('retry-reconciled').addEventListener('change', controls);
$('retry-original').addEventListener('click', () => {
  if (pending && !busy && !$('retry-original').disabled) void action(pending.path, pending.body, pending.path === '/api/checkouts');
});
function makeRow(operation) {
  const tr = document.createElement('tr');
  const labels = ['Operation', 'Items', 'Total', 'Tender', 'Status'];
  const cells = labels.map(label => { const td = document.createElement('td'); td.dataset.label = label; tr.append(td); return td; });
  const actions = document.createElement('td'); actions.className = 'actions'; actions.dataset.label = 'Action'; tr.append(actions);
  const refund = document.createElement('button'); refund.type = 'button'; refund.textContent = 'Full refund'; refund.setAttribute('aria-label', `Full refund for ${operation.id}`);
  const resume = document.createElement('button'); resume.type = 'button'; resume.textContent = 'Resume'; resume.setAttribute('aria-label', `Resume ${operation.id}`);
  actions.append(refund, resume);
  const row = { id: operation.id, tr, cells, refund, resume, refundId: null, refundable: false, resumable: false, providerAvailable: false };
  refund.addEventListener('click', () => {
    if (busy || pending) return;
    row.refundId ||= newId('refund');
    const body = { id: row.refundId, checkoutId: operation.id };
    remember({ path: '/api/refunds', body });
    message(`Refund ID ${row.refundId}. Original payload retained until resolved.`);
    void action('/api/refunds', body);
  });
  resume.addEventListener('click', () => { void action(`/api/operations/${encodeURIComponent(operation.id)}/resume`, {}); });
  $('receipts').append(tr); rows.set(operation.id, row); return row;
}
function render(value) {
  const first = !state; state = value; observedAt = new Date(); freshness();
  viewError(value.ready ? '' : value.fault || 'Ledger unavailable. Keep original operation IDs.');
  $('connection').textContent = value.ready ? `Ledger ready · ${value.totals.salesCount} sales · ${value.totals.unsettledCount} unsettled${paused ? ' · view paused' : ''}` : value.fault || 'Ledger unavailable. Keep operation IDs.';
  $('connection').className = value.ready ? 'status' : 'warning';
  for (const [id, field] of [['gross', 'grossCents'], ['refunded', 'refundedCents'], ['net', 'netCents'], ['cash', 'cashBalanceCents']]) $(id).textContent = money(value.totals[field]);
  $('offset').textContent = `Offset ${value.lastOffset ?? '—'} · ${value.duplicates} duplicate records`;
  $('empty').hidden = value.operations.length !== 0; $('empty').textContent = 'No receipts recorded.';
  const reserved = new Set(value.operations.filter(operation => operation.kind === 'refund').map(operation => operation.command.checkoutId));
  for (const operation of value.operations) {
    const row = rows.get(operation.id) || makeRow(operation);
    const provider = value.providers[operation.tender];
    const text = [`${operation.kind} · ${operation.id}`, operation.kind === 'refund' ? `Receipt ${operation.command.checkoutId}` : operation.lines.map(line => `${line.quantity} × ${line.name}`).join(', '), `${money(operation.amountCents)} · ${operation.amountCents} cents`, operation.tender, `${operation.status} · ${operation.reason}${provider?.available ? '' : ` · ${provider?.reason || 'Tender unavailable'}`}`];
    row.cells.forEach((cell, index) => { if (cell.textContent !== text[index]) cell.textContent = text[index]; });
    row.refundable = operation.kind === 'checkout' && operation.status === 'completed' && !reserved.has(operation.id);
    row.resumable = ['pending', 'unknown'].includes(operation.status);
    row.providerAvailable = provider?.available === true;
    row.refund.hidden = operation.kind !== 'checkout'; row.resume.hidden = !row.resumable;
    observeOperation(operation);
  }
  $('provider-summary').textContent = ['stripe', 'square'].map(provider => `${provider === 'stripe' ? 'Stripe test mode' : 'Square sandbox'}: ${value.providers[provider].available ? 'configured; connectivity checked at checkout' : value.providers[provider].reason || 'disabled'}`).join(' · ');
  if (first) tenderChanged(); else { providerDescription(); controls(); }
  recovery();
}
async function refresh(automatic = false) {
  if (stopped || controller || (automatic && paused)) return;
  const ownGeneration = generation, ownController = new AbortController(); controller = ownController; $('refresh').disabled = true;
  try {
    const response = await fetch('/api/state', { cache: 'no-store', signal: AbortSignal.any([ownController.signal, AbortSignal.timeout(10000)]) });
    if (!response.ok) throw new Error(`State unavailable (${response.status}).`);
    const value = await response.json();
    if (!stopped && generation === ownGeneration && !(automatic && paused)) render(value);
  } catch (error) {
    if (!stopped && error.name !== 'AbortError' && generation === ownGeneration) {
      $('connection').textContent = `${error.message} Last observed values remain visible; keep original operation IDs.`; $('connection').className = 'error';
      state = state ? { ...state, ready: false } : undefined; freshness(true); controls();
      viewError($('connection').textContent);
    }
  } finally { if (controller === ownController) controller = null; $('refresh').disabled = false; }
}
function schedule() {
  clearTimeout(timer);
  if (!paused && !stopped) timer = setTimeout(async () => { await refresh(true); schedule(); }, 2000);
}
$('updates').addEventListener('click', () => {
  paused = !paused; generation += 1; clearTimeout(timer); controller?.abort();
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; $('updates').setAttribute('aria-pressed', String(paused));
  if (paused) { $('connection').textContent = 'Automatic view updates paused. Commands, lookup and manual refresh still work.'; freshness(); }
  else void refresh().then(schedule);
});
$('refresh').addEventListener('click', () => { void refresh(); });
window.addEventListener('pagehide', () => { stopped = true; generation += 1; clearTimeout(timer); controller?.abort(); });
window.addEventListener('pageshow', () => { if (stopped) { stopped = false; void refresh().then(schedule); } });
$('checkout-id').value = pending?.path === '/api/checkouts' ? pending.body.id : newId('sale');
if (pending) {
  locked = pending.path === '/api/checkouts'; activeStatus = locked ? 'unknown' : null;
  if (pending.path === '/api/checkouts') {
    for (const sku of Object.keys(prices)) form.elements[sku].value = pending.body.basket.find(item => item.sku === sku)?.quantity || 0;
    $('tender').value = pending.body.tender;
  }
  message(`Unresolved original operation ${pending.body.id}. Look up its receipt before another request.`, true);
}
basketTotal(); recovery(); controls(); await refresh();
if (pending?.body.source) $('source').value = pending.body.source;
schedule();
