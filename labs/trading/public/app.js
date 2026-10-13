'use strict';
const $ = id => document.getElementById(id);
const usd = ticks => new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' }).format(ticks / 100);
const integer = number => new Intl.NumberFormat('en-US').format(number);
let selected = 'WHEAT', snapshot = null, live = true, loading = false;
const preferredDark = window.matchMedia('(prefers-color-scheme: dark)').matches;
let dark = preferredDark;
try { const saved = localStorage.getItem('amber-theme'); if (saved) dark = saved === 'dark'; } catch {}
function theme() { document.body.classList.toggle('dark', dark); $('theme').textContent = dark ? 'Light theme' : 'Dark theme'; }
theme();
$('theme').addEventListener('click', () => { dark = !dark; theme(); try { localStorage.setItem('amber-theme', dark ? 'dark' : 'light'); } catch {} });
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
$('price').addEventListener('input', () => { const ticks = Number($('price').value); $('price-help').textContent = Number.isSafeInteger(ticks) ? `${integer(ticks)} ticks = ${usd(ticks)} / unit` : 'Enter whole USD-cent ticks'; });
function changeCommodity(symbol) {
  selected = symbol;
  $('commodity').value = symbol;
  const contract = snapshot?.commodities.find(c => c.symbol === symbol);
  if (contract) { $('price').value = contract.illustrative_ticks; $('price').dispatchEvent(new Event('input')); }
  if (snapshot) render();
}
$('commodity').addEventListener('change', event => changeCommodity(event.target.value));
function renderBook(orders, target, side) {
  const levels = new Map();
  for (const o of orders.filter(o => o.side === side && o.remaining > 0 && o.status !== 'cancelled')) levels.set(o.price_ticks, (levels.get(o.price_ticks) || 0) + o.remaining);
  const sorted = Array.from(levels).sort((a, b) => side === 'buy' ? b[0] - a[0] : a[0] - b[0]);
  target.replaceChildren();
  if (!sorted.length) target.append(element('p', 'No resting orders. Place a limit order to open this side.', 'empty'));
  for (const [price, quantity] of sorted) {
    const row = element('div', undefined, 'book-level');
    const label = element('div', integer(price)); label.append(element('small', usd(price)));
    row.append(label, element('span', `${integer(quantity)} units`)); target.append(row);
  }
}
function emptyRow(target, count, message) { const row = element('tr'), cell = element('td', message, 'empty'); cell.colSpan = count; row.append(cell); target.append(row); }
function render() {
  const data = snapshot;
  $('connection').textContent = data.ready ? 'Ready / replay complete' : 'Not ready / trading paused';
  $('offset').textContent = data.error || `Next log offset ${integer(data.next_offset)} · all state reconstructed`;
  $('markets').replaceChildren();
  for (const c of data.commodities) {
    const button = element('button', undefined, 'market'); button.type = 'button'; button.setAttribute('aria-pressed', String(c.symbol === selected));
    const history = data.trades.filter(t => t.commodity === c.symbol), last = history.at(-1);
    button.append(element('strong', c.name), element('span', usd(last?.price_ticks ?? c.illustrative_ticks), 'market-price'), element('small', `${c.unit} · ${last ? 'last simulated trade' : 'illustrative reference'}`));
    button.addEventListener('click', () => changeCommodity(c.symbol)); $('markets').append(button);
  }
  const contract = data.commodities.find(c => c.symbol === selected);
  $('book-title').textContent = `${contract.name} / ${selected}`;
  const orders = data.orders.filter(o => o.commodity === selected);
  renderBook(orders, $('bids'), 'buy'); renderBook(orders, $('asks'), 'sell');
  $('trade-count').textContent = integer(data.trades.length);
  $('accepted-count').textContent = integer(data.operations.filter(o => o.status === 'accepted').length);
  $('rejected-count').textContent = integer(data.operations.filter(o => o.status === 'rejected').length);
  $('orders').replaceChildren();
  for (const o of orders.toSorted ? orders.toSorted((a, b) => b.sequence - a.sequence) : [...orders].sort((a, b) => b.sequence - a.sequence)) {
    const row = element('tr');
    row.append(element('td', o.id), element('td', o.side.toUpperCase(), `${o.side}-text`), element('td', integer(o.price_ticks)), element('td', `${integer(o.remaining)} / ${integer(o.quantity)}`));
    const status = element('td'); status.append(element('span', o.status, 'status')); row.append(status);
    const action = element('td');
    if (o.remaining > 0 && o.status !== 'cancelled') {
      const button = element('button', 'Cancel'); button.type = 'button'; button.setAttribute('aria-label', `Cancel order ${o.id}`); button.disabled = !data.ready;
      button.addEventListener('click', async () => {
        const id = newId('cancel'); $('lookup-id').value = id; button.disabled = true;
        message(`Submitting cancellation ${id} for ${o.id}…`);
        try { displayOperation(await request('/api/commands', { id, action: 'cancel', order_id: o.id })); await refresh(); }
        catch (error) { message(`Cancellation outcome unknown. Inspect ${id} before retrying. ${error.message}`, true); }
      }); action.append(button);
    } else action.textContent = '—';
    row.append(action); $('orders').append(row);
  }
  if (!orders.length) emptyRow($('orders'), 6, 'No orders yet. Your first order will appear here after broker consumption.');
  const trades = data.trades.filter(t => t.commodity === selected).slice().reverse();
  $('trades').replaceChildren();
  for (const t of trades) {
    const row = element('tr');
    const taker = t.maker_order === t.buy_order ? t.sell_order : t.buy_order;
    row.append(element('td', t.id), element('td', `${integer(t.price_ticks)} / ${usd(t.price_ticks)}`), element('td', integer(t.quantity)), element('td', `${t.maker_order} → ${taker}`)); $('trades').append(row);
  }
  if (!trades.length) emptyRow($('trades'), 4, 'No trades yet. A crossing buy and sell will execute at the resting order price.');
}
async function refresh() {
  if (loading) return;
  loading = true;
  try { const result = await request('/api/state'); if (result.code !== 200) throw new Error(result.value.error); snapshot = result.value; render(); }
  catch (error) { $('connection').textContent = 'Connection unavailable'; $('offset').textContent = `Cannot read the exchange: ${error.message}`; }
  finally { loading = false; }
}
$('refresh').addEventListener('click', refresh);
$('live').addEventListener('click', () => { live = !live; $('live').setAttribute('aria-pressed', String(live)); $('live').textContent = live ? 'Pause live updates' : 'Resume live updates'; if (live) refresh(); });
refresh();
setInterval(() => { if (live && !document.hidden && !document.activeElement?.closest('#markets, #orders')) refresh(); }, 2000);
