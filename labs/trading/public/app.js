'use strict';
const $ = id => document.getElementById(id);
const usd = ticks => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ticks / 100);
const integer = number => new Intl.NumberFormat('en-US').format(number);
let selected = 'WHEAT', snapshot = null, live = true, loading = false;
const preference = window.matchMedia('(prefers-color-scheme: dark)');
try {
  const savedTheme = localStorage.getItem('amber-theme');
  if (savedTheme === 'light' || savedTheme === 'dark') document.documentElement.dataset.theme = savedTheme;
} catch { /* Storage is optional; the system preference still applies. */ }
function theme() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : preference.matches;
  $('theme').textContent = dark ? 'Use light theme' : 'Use dark theme';
}
theme();
preference.addEventListener('change', theme);
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : preference.matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('amber-theme', document.documentElement.dataset.theme); } catch {}
  theme();
});
function newId(prefix = 'web') {
  const bytes = new Uint8Array(16);
  if (window.crypto?.getRandomValues) { window.crypto.getRandomValues(bytes); return `${prefix}-${Array.from(bytes, b => b.toString(16).padStart(2, '0')).join('')}`; }
  // ID uniqueness is operational, not authentication; keep visible for recovery.
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2)}-${Math.random().toString(36).slice(2)}`;
}
$('operation-id').value = newId();
$('new-id').addEventListener('click', () => { $('operation-id').value = newId(); $('operation-id').focus(); });
function element(tag, text, className) { const n = document.createElement(tag); if (text !== undefined) n.textContent = text; if (className) n.className = className; return n; }
function message(text, error = false) { $('feedback').textContent = text; $('feedback').classList.toggle('error', error); }
async function request(path, body) {
  const response = await fetch(path, body === undefined ? {} : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
  const value = await response.json();
  return { code: response.status, value };
}
function displayOperation(result) {
  const { code, value } = result;
  $('lookup-id').value = value.command?.id || value.id || $('lookup-id').value;
  $('lookup-result').textContent = JSON.stringify(value, null, 2);
  if (value.status === 'accepted') message(`Accepted ${value.command.id}. ${value.trade_ids.length} trade(s) executed. Use New ID for your next order.`);
  else if (value.status === 'rejected') message(`Rejected ${value.command.id}: ${value.reason}. This rejection is recorded; use a new ID for a corrected command.`, true);
  else if (value.status === 'pending') message(`Operation ${value.id} is pending. Look up this ID; do not submit under a new ID.`);
  else message(value.error || 'Outcome not observed. Retain this operation ID and inspect it after readiness returns.', code >= 400);
}
$('order-form').addEventListener('submit', async event => {
  event.preventDefault();
  const form = new FormData(event.currentTarget);
  const command = { id: form.get('id'), action: 'order', commodity: form.get('commodity'), side: form.get('side'), price_ticks: Number(form.get('price_ticks')), quantity: Number(form.get('quantity')) };
  $('lookup-id').value = command.id;
  $('submit').disabled = true;
  message(`Submitting ${command.id} to Redpanda…`);
  try { displayOperation(await request('/api/commands', command)); await refresh(); }
  catch (error) { message(`Transport failure. Outcome of ${command.id} is unknown. Keep the ID and look it up; do not create a replacement. ${error.message}`, true); }
  finally { $('submit').disabled = false; }
});
$('lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { displayOperation(await request(`/api/operations/${encodeURIComponent($('lookup-id').value)}`)); }
  catch (error) { message(`Cannot inspect operation: ${error.message}`, true); }
});
function priceHelp() {
  const ticks = Number($('price').value), unit = snapshot?.commodities.find(c => c.symbol === selected)?.unit || 'unit';
  $('price-help').textContent = Number.isSafeInteger(ticks) ? `${integer(ticks)} ticks = ${usd(ticks)} / ${unit}` : 'Enter whole USD-cent ticks';
}
$('price').addEventListener('input', priceHelp);
function changeCommodity(symbol) {
  selected = symbol;
  $('commodity').value = symbol;
  const contract = snapshot?.commodities.find(c => c.symbol === symbol);
  if (contract) { $('price').value = contract.illustrative_ticks; priceHelp(); }
  if (snapshot) render();
}
$('commodity').addEventListener('change', event => changeCommodity(event.target.value));
function renderBook(orders, target, side, unit) {
  const levels = new Map();
  for (const o of orders.filter(o => o.side === side && o.remaining > 0 && o.status !== 'cancelled')) levels.set(o.price_ticks, (levels.get(o.price_ticks) || 0) + o.remaining);
  const sorted = Array.from(levels).sort((a, b) => side === 'buy' ? b[0] - a[0] : a[0] - b[0]);
  target.replaceChildren();
  if (!sorted.length) target.append(element('p', 'No resting orders on this side.', 'empty'));
  for (const [price, quantity] of sorted) {
    const row = element('div', undefined, 'book-level');
    const label = element('div', `${integer(price)} ticks`); label.append(element('small', `${usd(price)} / ${unit}`));
    row.append(label, element('span', `${integer(quantity)} units`)); target.append(row);
  }
}
function emptyRow(target, count, text) { const row = element('tr'), cell = element('td', text, 'empty'); cell.colSpan = count; row.append(cell); target.append(row); }
const marketNodes = new Map(), orderNodes = new Map(), cancelling = new Set();
function render() {
  const data = snapshot;
  $('connection').textContent = data.ready ? 'Ready / replay complete' : 'Not ready / trading paused';
  $('offset').textContent = data.error || `Next log offset ${integer(data.next_offset)} · consumed state`;
  if (!marketNodes.size) $('markets').replaceChildren();
  for (const c of data.commodities) {
    let button = marketNodes.get(c.symbol);
    if (!button) {
      button = element('button', undefined, 'market'); button.type = 'button';
      button.append(element('strong'), element('span', undefined, 'market-price'), element('small'));
      button.addEventListener('click', () => changeCommodity(c.symbol));
      marketNodes.set(c.symbol, button); $('markets').append(button);
    }
    button.setAttribute('aria-pressed', String(c.symbol === selected));
    const history = data.trades.filter(t => t.commodity === c.symbol), last = history.at(-1);
    button.children[0].textContent = c.name;
    button.children[1].textContent = usd(last?.price_ticks ?? c.illustrative_ticks);
    button.children[2].textContent = `${c.unit} · ${last ? 'last simulated trade' : 'illustrative reference'}`;
  }
  const contract = data.commodities.find(c => c.symbol === selected);
  $('book-title').textContent = `${contract.name} / ${selected}`;
  $('book-unit').textContent = `One unit = one ${contract.unit}. One tick = USD 0.01 per unit.`;
  $('quantity-help').textContent = `One unit = one ${contract.unit}.`;
  priceHelp();
  const orders = data.orders.filter(o => o.commodity === selected);
  renderBook(orders, $('bids'), 'buy', contract.unit); renderBook(orders, $('asks'), 'sell', contract.unit);
  $('trade-count').textContent = integer(data.trades.length);
  $('accepted-count').textContent = integer(data.operations.filter(o => o.status === 'accepted').length);
  $('rejected-count').textContent = integer(data.operations.filter(o => o.status === 'rejected').length);
  // Keep keyed order rows and their controls mounted across state reads.
  if (!orderNodes.size) $('orders').replaceChildren();
  const ids = new Set(orders.map(o => o.id));
  for (const [id, row] of orderNodes) if (!ids.has(id)) { row.remove(); orderNodes.delete(id); }
  for (const [index, o] of [...orders].sort((a, b) => b.sequence - a.sequence).entries()) {
    let row = orderNodes.get(o.id);
    if (!row) {
      row = element('tr');
      for (let i = 0; i < 6; i++) row.append(element('td'));
      const button = element('button', 'Cancel'); button.type = 'button'; button.setAttribute('aria-label', `Cancel order ${o.id}`);
      button.addEventListener('click', async () => {
        if (button.disabled) return;
        const id = newId('cancel'); $('lookup-id').value = id; cancelling.add(o.id); button.disabled = true;
        message(`Submitting cancellation ${id} for ${o.id}…`);
        try { displayOperation(await request('/api/commands', { id, action: 'cancel', order_id: o.id })); await refresh(); }
        catch (error) { message(`Cancellation outcome unknown. Inspect ${id} before retrying. ${error.message}`, true); }
        finally { cancelling.delete(o.id); if (snapshot) render(); }
      });
      row.children[5].append(button); orderNodes.set(o.id, row); $('orders').insertBefore(row, $('orders').children[index] || null);
    }
    row.children[0].textContent = o.id; row.children[1].textContent = o.side.toUpperCase(); row.children[1].className = `${o.side}-text`;
    row.children[2].textContent = integer(o.price_ticks); row.children[3].textContent = `${integer(o.remaining)} / ${integer(o.quantity)}`;
    row.children[4].textContent = o.status;
    const button = row.children[5].firstElementChild, closed = o.remaining <= 0 || o.status === 'cancelled';
    button.disabled = closed || !data.ready || cancelling.has(o.id); button.textContent = closed ? 'Closed' : 'Cancel';
  }
  if (!orders.length) emptyRow($('orders'), 6, 'No orders for this commodity. Orders appear after broker consumption.');
  const trades = data.trades.filter(t => t.commodity === selected).slice().reverse();
  $('trades').replaceChildren();
  for (const t of trades) {
    const row = element('tr');
    const taker = t.maker_order === t.buy_order ? t.sell_order : t.buy_order;
    row.append(element('td', t.id), element('td', `${integer(t.price_ticks)} / ${usd(t.price_ticks)}`), element('td', integer(t.quantity)), element('td', `${t.maker_order} → ${taker}`)); $('trades').append(row);
  }
  if (!trades.length) emptyRow($('trades'), 4, 'No trades yet. Crossing orders execute at the resting order price.');
}
async function refresh() {
  if (loading) return;
  loading = true; $('refresh').setAttribute('aria-busy', 'true');
  try {
    const result = await request('/api/state'); if (result.code !== 200) throw new Error(result.value.error);
    snapshot = result.value; render();
    $('view-status').textContent = live ? 'View updates every 2 seconds. Pausing the view does not stop the exchange.' : 'View paused. Refresh state reads once; the exchange continues.';
  }
  catch (error) { $('connection').textContent = 'Connection unavailable'; $('offset').textContent = `Cannot read the exchange: ${error.message}`; $('view-status').textContent = snapshot ? 'Showing the last successful read. Refresh state to try again.' : 'No state received. Refresh state to try again.'; }
  finally { loading = false; $('refresh').removeAttribute('aria-busy'); }
}
$('refresh').addEventListener('click', refresh);
$('live').addEventListener('click', () => {
  live = !live; $('live').setAttribute('aria-pressed', String(live)); $('live').textContent = live ? 'Pause view updates' : 'Resume view updates';
  $('view-status').textContent = live ? 'View updates resumed.' : 'View paused. Refresh state reads once; the exchange continues.';
  if (live) refresh();
});
refresh();
setInterval(() => { if (live && !document.hidden) refresh(); }, 2000);
