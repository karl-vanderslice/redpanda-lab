const $ = id => document.getElementById(id);
const storageKey = 'northbridge-preserved-command';
let state = null, paused = false, activeRead = null, viewGeneration = 0, busy = false, preserved = null;
const newId = prefix => `${prefix}-${crypto.randomUUID()}`;
const cents = value => `${value.toLocaleString('en-US')} cents`;
function node(tag, text, className) {
  const value = document.createElement(tag);
  if (text !== undefined) value.textContent = text;
  if (className) value.className = className;
  return value;
}
function message(text, error = false, owner = 'command') {
  const notice = $('notice');
  notice.dataset.owner = owner;
  notice.textContent = text;
  notice.className = error ? 'error' : 'status';
}
function preserve(value) {
  preserved = value;
  try { if (value) localStorage.setItem(storageKey, JSON.stringify(value)); else localStorage.removeItem(storageKey); } catch { /* In-memory recovery works when storage is denied. */ }
  $('uncertain').hidden = !value;
  $('saved-command').textContent = value ? JSON.stringify(value, null, 2) : '';
  controls();
}
try {
  const candidate = JSON.parse(localStorage.getItem(storageKey) || 'null');
  if (candidate && ['/api/transfers', '/api/reviews', '/api/clearings'].includes(candidate.path) && candidate.command && /^[A-Za-z0-9_-]{1,80}$/.test(candidate.command.id)) preserve(candidate);
} catch { /* A denied or invalid stored value does not prevent page use. */ }
$('transfer-id').value = newId('transfer');
function controls() {
  const unavailable = busy || !state?.ready || Boolean(preserved);
  for (const form of ['transfer-form', 'review-form', 'clear-form']) $(form).querySelector('button').disabled = unavailable;
  $('retry-preserved').disabled = busy || !state?.ready || !preserved;
}
async function api(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  return { ok: response.ok, status: response.status, value: await response.json() };
}
function choices(element, values) {
  const signature = JSON.stringify(values);
  if (element.dataset.signature === signature) return;
  if (document.activeElement === element) return;
  const selected = element.value;
  const options = values.map(([value, label]) => { const option = node('option', label); option.value = value; return option; });
  if (!options.length) { const option = node('option', 'No eligible obligation'); option.value = ''; options.push(option); }
  element.replaceChildren(...options);
  if (values.some(([value]) => value === selected)) element.value = selected;
  element.dataset.signature = signature;
}
function render(next) {
  if ($('notice').dataset.owner === 'snapshot') message('');
  state = next;
  $('connection').textContent = next.ready ? `Ordered log · offset ${next.lastOffset}` : `Writes paused · ${next.fault || 'ledger not ready'}`;
  $('policy').textContent = `Risk policy ${next.policy?.version || 'pending'}`;
  $('clock').textContent = `${next.lastDecisionAt} ms`;
  if (next.policy) $('boundaries').textContent = `Hold at ${cents(next.policy.holdAtCents)}; reject above ${cents(next.policy.rejectAboveCents)}. Hold on request ${next.policy.holdAtCount} within ${next.policy.velocityWindowMs / 1000} seconds. The review/blocked accounts are an explicit fictional watchlist. All screened requests count toward velocity.`;
  const accounts = next.accounts.map(a => [a.id, `${a.id} · ${cents(a.availableCents)} available`]);
  choices($('from'), accounts); choices($('to'), accounts);
  if ($('from').value === $('to').value && !$('to').dataset.initialized) { $('to').value = 'treasury'; $('to').dataset.initialized = 'true'; }
  const held = next.transfers.filter(t => t.status === 'held');
  const approved = next.transfers.filter(t => t.status === 'approved');
  choices($('review-target'), held.map(t => [t.id, `${t.id} · ${cents(t.amountCents)}`]));
  choices($('clear-target'), approved.map(t => [t.id, `${t.id} · ${cents(t.amountCents)}`]));
  $('held-count').textContent = `${held.length} held`;
  $('exceptions').replaceChildren(...(held.length ? held.map(t => {
    const row = node('article', undefined, 'exception');
    row.append(node('code', t.id), node('p', `${t.from} → ${t.to} · ${cents(t.amountCents)}`), node('p', `Held: ${t.screening.reasons.join(', ')} · request ${t.screening.recentCount} in the velocity window`, 'warning'));
    return row;
  }) : [node('p', 'No held obligations. Screened exceptions appear here.', 'muted')]));
  $('accounts').replaceChildren(...next.accounts.map(a => {
    const card = node('article', undefined, 'account');
    card.append(node('h3', a.label), node('code', a.id), node('strong', cents(a.balanceCents)), node('p', `${cents(a.reservedCents)} reserved`), node('p', `${cents(a.availableCents)} available`), node('p', `Watchlist: ${a.watch}`, 'muted'));
    return card;
  }));
  $('total').textContent = cents(next.totals.balanceCents);
  $('net').textContent = `Net entries: ${cents(next.totals.entryNetCents)}`;
  $('cleared-count').textContent = `${next.totals.clearedCount} cleared obligations`;
  $('entries').replaceChildren(...next.entries.map(e => {
    const row = node('tr'), identity = node('td');
    identity.append(node('code', e.clearingId), node('br'), node('code', e.transferId));
    row.append(identity, node('td', e.accountId), node('td', `${e.deltaCents > 0 ? '+' : ''}${cents(e.deltaCents)}`), node('td', `${new Date(e.decisionAt).toISOString()} · ${e.decisionAt} ms`));
    return row;
  }));
  if (!next.entries.length) { const row = node('tr'), cell = node('td', 'No locally cleared entries.'); cell.colSpan = 4; row.append(cell); $('entries').append(row); }
  $('transfers').replaceChildren(...(next.transfers.length ? [...next.transfers].reverse().map(t => {
    const row = node('article', undefined, 'transfer-row'), detail = node('div'), amount = node('div', undefined, 'amount');
    detail.append(node('code', t.id), node('p', `${t.from} → ${t.to}`), node('p', `Screened ${new Date(t.screenedAt).toISOString()} · ${t.screening.riskPolicyVersion}`, 'small'), node('p', t.screening.reasons.join(', '), 'small'));
    if (t.review) detail.append(node('p', `Review ${t.review.id}: ${t.review.decision} by ${t.review.reviewer}. ${t.review.note}`, 'small'));
    if (t.clearingId) detail.append(node('p', `Clearing ID: ${t.clearingId}`, 'small'));
    amount.append(node('strong', cents(t.amountCents)), node('p', t.status.toUpperCase(), 'badge'));
    row.append(detail, amount); return row;
  }) : [node('p', 'No transfer instructions have been screened.', 'muted')]));
  controls();
}
async function refresh(automatic = false) {
  if (automatic && (paused || activeRead)) return;
  const generation = ++viewGeneration;
  activeRead = { generation, automatic };
  try {
    const result = await api('/api/state');
    if (generation !== viewGeneration || (automatic && paused)) return;
    if (!result.ok) throw new Error(result.value.error || 'State unavailable.');
    render(result.value);
  } catch (error) {
    if (generation !== viewGeneration || (automatic && paused)) return;
    $('connection').textContent = 'Connection unavailable'; message(error.message, true, 'snapshot'); state = null; controls();
  } finally { if (activeRead?.generation === generation) activeRead = null; }
}
function clock() { return Math.max(Date.now(), (state?.lastDecisionAt || 0) + 1); }
async function lookup(id) {
  const result = await api(`/api/operations/${encodeURIComponent(id)}`);
  $('receipt').textContent = JSON.stringify(result.value, null, 2);
  if (!result.ok) { message(result.value.error || 'Receipt not found.', true); return; }
  if (preserved && preserved.command.id === id) {
    const { kind, ...body } = result.value.operation.command;
    const path = ({ transfer: '/api/transfers', review: '/api/reviews', clear: '/api/clearings' })[kind];
    const expected = path === '/api/reviews' && typeof preserved.command.note === 'string'
      ? { ...preserved.command, note: preserved.command.note.trim() } : preserved.command;
    if (path === preserved.path && Object.keys(body).every(key => body[key] === expected[key]) && Object.keys(body).length === Object.keys(expected).length) preserve(null);
    else { message('This ID belongs to a different command. Keep the preserved payload and resolve the conflict.', true); return; }
  }
  message(`Consumed receipt ${id}: ${result.value.operation.outcome.status}.`);
  await refresh();
}
async function mutate(path, command) {
  if (busy || !state?.ready) return;
  busy = true;
  preserve({ path, command });
  try {
    const result = await api(path, command);
    $('receipt').textContent = JSON.stringify(result.value, null, 2);
    if (result.value.outcomeUnknown || result.status >= 500) throw new Error(result.value.error || 'Completion uncertain.');
    preserve(null);
    if (!result.value.operation) { message(result.value.error || 'Request rejected before append.', true); return; }
    message(`${result.value.operation.command.id}: ${result.value.operation.outcome.status}. Recorded at offset ${result.value.operation.offset}.`, !result.ok);
    if (path === '/api/transfers') $('transfer-id').value = newId('transfer');
    if (path === '/api/reviews') { $('review-form').elements.note.value = ''; $('review-form').elements.confirm.checked = false; }
    if (path === '/api/clearings') $('clear-form').querySelector('input[type="checkbox"]').checked = false;
  } catch (error) { message(`${error.message} Preserve this exact command.`, true); }
  finally { busy = false; controls(); await refresh(); }
}
$('transfer-form').addEventListener('submit', event => {
  event.preventDefault(); if (preserved) return;
  const data = new FormData(event.currentTarget);
  void mutate('/api/transfers', { id: data.get('id'), from: data.get('from'), to: data.get('to'), amountCents: Number(data.get('amountCents')), decisionAt: clock() });
});
$('review-form').addEventListener('submit', event => {
  event.preventDefault(); if (preserved) return;
  const data = new FormData(event.currentTarget);
  void mutate('/api/reviews', { id: newId('review'), transferId: data.get('transferId'), decision: data.get('decision'), reviewer: data.get('reviewer'), note: data.get('note').trim(), decisionAt: clock() });
});
$('clear-form').addEventListener('submit', event => { event.preventDefault(); if (!preserved) void mutate('/api/clearings', { id: newId('clear'), transferId: event.currentTarget.elements.transferId.value, decisionAt: clock() }); });
$('lookup-form').addEventListener('submit', event => { event.preventDefault(); void lookup(event.currentTarget.elements.id.value).catch(error => message(error.message, true)); });
$('inspect-uncertain').addEventListener('click', () => { if (preserved) void lookup(preserved.command.id).catch(error => message(error.message, true)); });
$('retry-preserved').addEventListener('click', () => { if (preserved && state?.ready) void mutate(preserved.path, preserved.command); });
$('refresh').addEventListener('click', () => { void refresh(); });
$('updates').addEventListener('click', () => { paused = !paused; if (paused && activeRead?.automatic) { viewGeneration += 1; activeRead = null; } $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; $('updates').setAttribute('aria-pressed', String(paused)); if (!paused) void refresh(); });
const timer = setInterval(() => { if (!paused && !busy) void refresh(true); }, 3000);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
controls();
void refresh();
