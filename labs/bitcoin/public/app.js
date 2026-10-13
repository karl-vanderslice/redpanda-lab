const $ = id => document.getElementById(id);
const money = new Intl.NumberFormat('en-US', { style: 'currency', currency: 'USD' });
const usd = cents => money.format(cents / 100);
const btc = quantity => (quantity / 100000000).toFixed(8);
let state; let events; let busy = false;
let uncertain = null;
try { uncertain = JSON.parse(localStorage.getItem('bitcoin-pending') || 'null'); } catch {}
let theme;
try { theme = localStorage.getItem('bitcoin-theme'); } catch {}
if (!['light', 'dark'].includes(theme)) theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
function setTheme(value) {
  theme = value; document.documentElement.dataset.theme = value;
  $('theme').textContent = value === 'dark' ? 'Light theme' : 'Dark theme';
  $('theme').setAttribute('aria-pressed', String(value === 'dark'));
  try { localStorage.setItem('bitcoin-theme', value); } catch {}
}
setTheme(theme);
$('theme').addEventListener('click', () => setTheme(theme === 'dark' ? 'light' : 'dark'));
function pending(command) {
  uncertain = command;
  try { if (command) localStorage.setItem('bitcoin-pending', JSON.stringify(command)); else localStorage.removeItem('bitcoin-pending'); } catch {}
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
  $('chart-description').textContent = latest ? `${prices.length} consumed hourly closes. Latest BTC/USD close ${usd(latest.priceCents)}. Short average ${latest.fastCents === null ? 'warming up' : usd(latest.fastCents)}. Long average ${latest.slowCents === null ? 'warming up' : usd(latest.slowCents)}.` : 'No market data consumed yet.';
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
$('lookup-button').addEventListener('click', async () => {
  try {
    const response = await fetch(`/api/commands/${encodeURIComponent($('lookup').value.trim())}`);
    const receipt = await response.json();
    $('receipt').textContent = response.ok ? `Consumed ${receipt.kind}, offset ${receipt.offset}. ${receipt.result.accepted ? 'Accepted.' : receipt.result.reason}` : receipt.error;
    if (response.ok && receipt.id === uncertain?.id) { pending(null); await load(); controls(); }
  } catch (error) { $('receipt').textContent = `Lookup failed: ${error.message}`; }
});
$('resolve').addEventListener('click', () => { if (uncertain) void command(uncertain.kind, uncertain); });
async function load() { const response = await fetch('/api/state'); if (!response.ok) throw new Error('State unavailable'); render(await response.json()); }
function connect() {
  events?.close(); events = new EventSource('/api/stream');
  events.addEventListener('state', event => render(JSON.parse(event.data)));
  events.onopen = () => { $('connection').textContent = 'Connected to consumed ledger state'; };
  events.onerror = () => { $('connection').textContent = 'Reconnecting to the ledger'; };
}
if (uncertain) { $('lookup').value = uncertain.id; $('receipt').textContent = `Check the retained ${uncertain.kind} command ${uncertain.id} before issuing another.`; }
void load().catch(error => { $('receipt').textContent = error.message; }); connect();
addEventListener('pagehide', () => events?.close());
addEventListener('pageshow', event => { if (event.persisted) { connect(); void load().catch(console.error); } });
