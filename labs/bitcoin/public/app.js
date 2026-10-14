const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = cents => money.format(cents / 100);
const btc = quantity => (quantity / 100000000).toFixed(8);
let state; let events; let busy = false; let updates = true; let loading = false;
let uncertain = null;
try { uncertain = JSON.parse(localStorage.getItem('bitcoin-pending') || 'null'); } catch {}
const preference = matchMedia('(prefers-color-scheme: dark)');
function themeLabel() {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : preference.matches;
  $('theme').textContent = dark ? 'Use light theme' : 'Use dark theme';
}
themeLabel(); preference.addEventListener('change', themeLabel);
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : preference.matches;
  document.documentElement.dataset.theme = dark ? 'light' : 'dark';
  try { localStorage.setItem('bitcoin-theme', document.documentElement.dataset.theme); } catch {}
  themeLabel();
});
function pending(command) {
  uncertain = command;
  try {
    if (command) localStorage.setItem('bitcoin-pending', JSON.stringify(command)); else localStorage.removeItem('bitcoin-pending');
    $('storage-warning').hidden = true;
  } catch {
    $('storage-warning').hidden = command === null;
    $('storage-warning').textContent = 'Browser storage is unavailable. Copy this command ID and action before leaving this page; recovery is retained only in this tab.';
  }
}
function controls() {
  if (!state) return;
  const unavailable = busy || !state.ready || uncertain !== null;
  $('play').disabled = unavailable || state.replay.playing || state.replay.ended;
  $('pause').disabled = unavailable || !state.replay.playing;
  $('step').disabled = unavailable || state.replay.playing || state.replay.ended;
  $('automatic').disabled = unavailable;
  $('automatic').checked = state.replay.automatic;
  $('buy').disabled = unavailable || state.replay.automatic || state.account.quantitySats > 0 || state.prices.length === 0;
  $('sell').disabled = unavailable || state.replay.automatic || state.account.quantitySats === 0;
  $('resolve').disabled = busy || !state.ready || uncertain === null;
}
function line(rows, key, low, range, count) {
  return rows.filter(row => row[key] !== null).map((row, i) => `${i ? 'L' : 'M'}${(row.index / Math.max(count - 1, 1) * 960 + 20).toFixed(2)},${(250 - (row[key] - low) / range * 220).toFixed(2)}`).join(' ');
}
function viewLabel() {
  $('view-status').textContent = updates ? 'View updates follow consumed ledger state. Pausing the view does not pause replay or trading.' : 'View paused. Replay and trading continue. Refresh state reads once; command results also refresh the view.';
}
function render(value) {
  state = value;
  const { account: a, replay: r, prices, trades } = value;
  const latest = prices.at(-1);
  $('price').textContent = latest ? usd(latest.priceCents) : 'Not started';
  $('market-time').textContent = latest ? `Close: ${latest.at.replace('T', ' ').replace('.000Z', ' UTC')}` : 'Consume a quote to begin.';
  $('cash').textContent = usd(a.cashCents); $('position').textContent = `${btc(a.quantitySats)} BTC`;
  $('cost').textContent = `Cost basis: ${usd(a.costCents)}`; $('equity').textContent = usd(a.equityCents);
  for (const [id, cents] of [['realized', a.realizedCents], ['unrealized', a.unrealizedCents], ['fees', a.feesCents]]) {
    $(id).textContent = usd(cents); $(id).dataset.negative = String(cents < 0);
  }
  $('progress').textContent = `${prices.length} / ${r.total} quotes · ${r.ended ? 'Feed ended' : r.playing ? 'Playing' : 'Paused'}`;
  $('signal').textContent = r.signal === 'warmup' ? 'Warming up' : `Latest regime: ${r.signal}`;
  $('offset').textContent = value.lastOffset === null ? 'No consumed offset' : `Consumed offset ${value.lastOffset} · ${value.topic}`;
  if (value.fault) $('receipt').textContent = value.fault;
  const values = prices.flatMap(p => [p.priceCents, p.fastCents, p.slowCents]).filter(v => v !== null);
  const low = values.length ? Math.min(...values) : 0; const range = values.length ? Math.max(...values) - low || 1 : 1;
  $('close-line').setAttribute('d', line(prices, 'priceCents', low, range, r.total));
  $('fast-line').setAttribute('d', line(prices, 'fastCents', low, range, r.total));
  $('slow-line').setAttribute('d', line(prices, 'slowCents', low, range, r.total));
  const description = latest ? `${prices.length} consumed hourly closes. Latest BTC/USD close ${usd(latest.priceCents)}. Short average ${latest.fastCents === null ? 'warming up' : usd(latest.fastCents)}. Long average ${latest.slowCents === null ? 'warming up' : usd(latest.slowCents)}.` : 'No market data consumed yet.';
  $('chart-description').textContent = description;
  $('chart-summary').textContent = description + (values.length ? ` Plotted range: ${usd(low)} to ${usd(Math.max(...values))} per BTC. Scale adjusts to consumed observations.` : ' The chart contains only consumed quotes.');
  $('chart-start').textContent = prices[0] ? prices[0].at.slice(0, 16).replace('T', ' ') + ' UTC' : 'Start the replay to draw the chart.';
  $('chart-end').textContent = latest ? latest.at.slice(11, 16) + ' UTC' : '';
  $('trade-count').textContent = `${trades.length} fills`;
  $('fills').replaceChildren();
  if (!trades.length) {
    const row = document.createElement('tr'); const cell = document.createElement('td'); cell.colSpan = 6;
    cell.textContent = 'No paper fills yet. The automatic strategy needs eight observed closes.'; row.append(cell); $('fills').append(row);
  } else for (const trade of trades) {
    const row = document.createElement('tr');
    for (const text of [trade.marketAt.slice(0, 16).replace('T', ' '), trade.side.toUpperCase(), btc(trade.quantitySats), usd(trade.priceCents), usd(trade.feeCents), trade.offset]) {
      const cell = document.createElement('td'); cell.textContent = text; row.append(cell);
    }
    $('fills').append(row);
  }
  controls();
}
async function command(kind, retained = null) {
  const id = retained?.id || crypto.randomUUID(); busy = true; pending({ id, kind }); controls();
  $('lookup').value = id; $('receipt').textContent = `Publishing ${kind}, command ${id}.`;
  try {
    const response = await fetch('/api/commands', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify({ id, kind }) });
    const receipt = await response.json();
    if (receipt.result || receipt.outcomeUnknown === false) pending(null);
    $('receipt').textContent = receipt.result ? `${receipt.result.accepted ? 'Consumed' : 'Rejected'} ${kind} at offset ${receipt.offset}. ${receipt.result.reason || ''} Command ${id}.` : `${receipt.error} Command ${id}.`;
    await load();
  } catch (error) {
    $('receipt').textContent = uncertain?.id === id ? `Request completion is uncertain for ${id}. Look up the command before repeating it. ${error.message}` : `The command result was received, but refreshing state failed: ${error.message}`;
  }
  finally { busy = false; controls(); }
}
for (const kind of ['play', 'pause', 'step', 'buy', 'sell']) $(kind).addEventListener('click', () => { void command(kind); });
$('automatic').addEventListener('change', event => { void command(event.target.checked ? 'auto-on' : 'auto-off'); });
$('lookup-form').addEventListener('submit', async event => {
  event.preventDefault();
  try {
    const response = await fetch(`/api/commands/${encodeURIComponent($('lookup').value.trim())}`);
    const receipt = await response.json();
    $('receipt').textContent = response.ok ? `Consumed ${receipt.kind}, offset ${receipt.offset}. ${receipt.result.accepted ? 'Accepted.' : receipt.result.reason}` : receipt.error;
    if (response.ok && receipt.id === uncertain?.id) { pending(null); await load(); controls(); }
  } catch (error) { $('receipt').textContent = `Lookup failed: ${error.message}`; }
});
$('resolve').addEventListener('click', () => { if (uncertain) void command(uncertain.kind, uncertain); });
async function load() {
  const response = await fetch('/api/state'); if (!response.ok) throw new Error('State unavailable');
  render(await response.json()); $('connection').textContent = state.ready ? 'Consumed ledger state received' : 'Ledger not ready'; viewLabel();
}
async function refresh() {
  if (loading) return;
  loading = true; $('refresh').setAttribute('aria-busy', 'true');
  try { await load(); }
  catch (error) { $('connection').textContent = 'State unavailable'; $('view-status').textContent = `${state ? 'Showing the last received state.' : 'No account state received.'} ${error.message}. Refresh state to retry.`; }
  finally { loading = false; $('refresh').removeAttribute('aria-busy'); }
}
$('refresh').addEventListener('click', () => { void refresh(); });
$('updates').addEventListener('click', () => {
  updates = !updates; $('updates').setAttribute('aria-pressed', String(updates)); $('updates').textContent = updates ? 'Pause view updates' : 'Resume view updates'; viewLabel();
  if (updates) void refresh();
});
function connect() {
  events?.close(); events = new EventSource('/api/stream');
  events.addEventListener('state', event => {
    if (!updates) return;
    try { render(JSON.parse(event.data)); $('connection').textContent = state.ready ? 'Connected to consumed ledger state' : 'Ledger not ready'; viewLabel(); }
    catch { $('connection').textContent = 'Unreadable ledger update'; $('view-status').textContent = 'Showing the last readable state. Refresh state to retry.'; }
  });
  events.onopen = () => { $('connection').textContent = 'Ledger stream connected'; };
  events.onerror = () => { $('connection').textContent = 'Reconnecting to the ledger'; $('view-status').textContent = 'The stream is reconnecting; displayed state may be stale. Refresh state to read once.'; };
}
if (uncertain) { $('lookup').value = uncertain.id; $('receipt').textContent = `Check the retained ${uncertain.kind} command ${uncertain.id} before issuing another.`; }
void refresh(); connect();
addEventListener('pagehide', () => events?.close());
addEventListener('pageshow', event => { if (event.persisted) { connect(); void refresh(); } });
