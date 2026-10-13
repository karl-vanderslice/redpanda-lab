const $ = (id) => document.getElementById(id);
const escape = (value) => String(value).replace(/[&<>"']/g, (char) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[char]));
function markup(id, html) {
  const element = $(id);
  if (element.dataset.markup === html) return;
  const focused = element.contains(document.activeElement) ? document.activeElement?.getAttribute('href') : null;
  element.innerHTML = html;
  element.dataset.markup = html;
  if (focused) [...element.querySelectorAll('a')].find((anchor) => anchor.getAttribute('href') === focused)?.focus({ preventScroll: true });
}
let viewerId = `viewer_${crypto.randomUUID()}`;
let theme = matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light';
try { viewerId = localStorage.getItem('courtside-viewer') || viewerId; localStorage.setItem('courtside-viewer', viewerId); theme = localStorage.getItem('courtside-theme') || theme; } catch { /* Storage is optional; this tab remains usable. */ }
document.body.dataset.theme = theme;
function themeLabel() { $('theme').textContent = `Use ${document.body.dataset.theme === 'dark' ? 'light' : 'dark'} theme`; }
themeLabel();
$('theme').onclick = () => { document.body.dataset.theme = document.body.dataset.theme === 'dark' ? 'light' : 'dark'; themeLabel(); try { localStorage.setItem('courtside-theme', document.body.dataset.theme); } catch { /* Optional preference. */ } };
let state;
let currentMatch = null;
let eventSource;
let heartbeatBusy = false;
let telemetryEnabled = true;
let ignoredPauses = 0;
function pauseForNavigation() {
  if (!$('player').paused) {
    ignoredPauses += 1;
    void telemetry('pause', currentMatch?.id).catch(() => {});
    $('player').pause();
  }
}
function showError(message) { $('error').hidden = false; $('error').textContent = message; }
function connection(message) { $('connection').textContent = message; }
async function json(url, options = {}) {
  const response = await fetch(url, { ...options, signal: AbortSignal.timeout(8000) });
  const body = await response.json();
  if (!response.ok) throw new Error(body.error || `HTTP ${response.status}: ${body.status ?? 'request failed'}`);
  return body;
}
async function emit(fields) {
  const id = `event_${crypto.randomUUID()}`;
  $('action-status').textContent = `Publishing ${fields.kind}…`;
  try {
    let operation = await json('/api/events', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id, ...fields }) });
    const deadline = Date.now() + 12000;
    while (['pending', 'unknown'].includes(operation.status) && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 250));
      operation = await json(`/api/operations/${id}`);
    }
    if (operation.status !== 'completed') throw new Error(operation.error || 'Consumer has not completed this operation.');
    $('action-status').textContent = `${fields.kind} projected at offset ${operation.offset}.`;
    $('error').hidden = true;
    return operation;
  } catch (error) {
    showError(`${error.message} Operation: ${id}. Inspect /api/operations/${id} or sports.events before trying another action. Media playback does not depend on the broker.`);
    $('action-status').textContent = 'Control-plane action not confirmed.';
    throw error;
  }
}
function route() {
  const parts = location.pathname.split('/').filter(Boolean);
  const sport = parts[0] === 'sport' ? parts[1] : 'all';
  const match = parts[0] === 'match' ? state.matches.find((item) => item.id === parts[1]) : null;
  if (parts[0] === 'match' && !match) showError('Unknown match. Choose a broadcast from All sports.');
  if (parts[0] === 'sport' && !['watchlist', ...state.sports.map((item) => item.id)].includes(sport)) showError('Unknown sport. Choose All sports.');
  markup('sports', [{ id: 'all', name: 'All sports' }, ...state.sports, { id: 'watchlist', name: 'Watchlist' }].map((item) => `<a data-route href="${item.id === 'all' ? '/' : `/sport/${item.id}`}" ${(!match && sport === item.id) || match?.sport === item.id ? 'aria-current="page"' : ''}>${escape(item.name)}</a>`).join(''));
  $('overview').hidden = Boolean(match);
  $('match').hidden = !match;
  const list = state.matches.filter((item) => sport === 'all' || item.sport === sport || (sport === 'watchlist' && state.viewer.watchlist.includes(item.id)));
  $('overview-title').textContent = sport === 'all' ? 'Every game has a story.' : sport === 'watchlist' ? 'Your next great game.' : `${state.sports.find((item) => item.id === sport)?.name ?? 'Sports'} / On the slate`;
  markup('cards', list.map((item) => `<article class="card"><div class="court ${item.sport}" aria-hidden="true"><span>${escape(item.sport.toUpperCase())} / SYNTHETIC</span></div><div class="card-body"><p class="eyebrow">EXHIBITION · ${escape(item.stage)}</p><h3>${escape(item.headline)}</h3><div class="teams"><span>${escape(item.home)}</span><strong>${item.homeScore}</strong></div><div class="teams"><span>${escape(item.away)}</span><strong>${item.awayScore}</strong></div><p class="meta">${escape(item.venue)} · Revision ${item.revision}</p><a href="/match/${item.id}" data-route>Watch ${escape(item.home)} vs ${escape(item.away)} →</a></div></article>`).join(''));
  $('empty').hidden = list.length !== 0;
  if (!match) {
    if (currentMatch) { pauseForNavigation(); $('player').removeAttribute('src'); $('player').load(); ignoredPauses = 0; }
    currentMatch = null;
    return;
  }
  if (currentMatch?.id !== match.id) {
    pauseForNavigation();
    currentMatch = match;
    $('player').src = match.media;
    $('player').load();
    // load() discards the queued programmatic pause event.
    ignoredPauses = 0;
    $('playback-status').textContent = 'Press the native player’s Play control to watch.';
    $('match-title').textContent = `${match.home} vs ${match.away}`;
    $('match-reference').textContent = match.reference;
    $('stage').textContent = `${match.stage} · ${match.venue}`;
    $('back').href = `/sport/${match.sport}`;
    $('back').textContent = `← All ${state.sports.find((item) => item.id === match.sport).name.toLowerCase()} broadcasts`;
    $('score-delta').innerHTML = state.sports.find((item) => item.id === match.sport).increments.map((value) => `<option value="${value}">+${value}</option>`).join('');
    $('score-side').options[0].textContent = match.home;
    $('score-side').options[1].textContent = match.away;
  } else currentMatch = match;
  markup('scoreboard', `<div class="score-team">${escape(match.home)}<strong>${match.homeScore}</strong></div><small>${escape(match.stage)}<br>Revision ${match.revision}</small><div class="score-team">${escape(match.away)}<strong>${match.awayScore}</strong></div>`);
  const watched = state.viewer.watchlist.includes(match.id);
  $('watchlist').textContent = watched ? 'Remove from watchlist' : 'Add to watchlist';
  $('watchlist').setAttribute('aria-pressed', String(watched));
  for (const side of ['home', 'away']) {
    const followed = state.viewer.follows.includes(match[side]);
    $(`follow-${side}`).textContent = `${followed ? 'Unfollow' : 'Follow'} ${match[side]}`;
    $(`follow-${side}`).setAttribute('aria-pressed', String(followed));
  }
  const metrics = [['Active viewers (all matches)', state.metrics.activeViewers], ['Play events', state.metrics.play], ['Pause events', state.metrics.pause], ['Heartbeats', state.metrics.heartbeat], ['Projected events', state.metrics.applied], ['Your following', state.viewer.follows.length]];
  $('match-metrics').innerHTML = metrics.map(([label, value]) => `<div><dt>${escape(label)}</dt><dd>${value}</dd></div>`).join('');
  markup('watchlist-items', state.viewer.watchlist.length ? state.viewer.watchlist.map((id) => { const item = state.matches.find((entry) => entry.id === id); return `<li><a data-route href="/match/${id}">${escape(item.home)} vs ${escape(item.away)}</a></li>`; }).join('') : '<li>No saved matches yet.</li>');
}
function render(snapshot) {
  state = snapshot;
  connection(state.ready ? 'Scoreboard connected' : 'Replaying scoreboard…');
  $('offset').textContent = `sports.events / offset ${state.lastOffset ?? '—'}`;
  $('feed').innerHTML = state.feed.length ? state.feed.map((event) => {
    const match = state.matches.find((item) => item.id === event.matchId);
    const detail = event.kind === 'score' ? `${match[event.side]} +${event.delta}` : event.kind === 'follow' ? `${event.enabled ? 'Follow' : 'Unfollow'} ${match[event.side]}` : event.kind === 'watchlist' ? `${event.enabled ? 'Saved' : 'Removed'} ${match.home} vs ${match.away}` : `${event.kind} · ${match.home} vs ${match.away} · ${event.position.toFixed(1)}s`;
    return `<li><span class="kind">${escape(event.kind)}</span><span>${escape(detail)}${event.error ? `: ${escape(event.error)}` : ''}</span><span class="event-meta">${event.status} · #${event.offset}</span></li>`;
  }).join('') : '<li><span>No events yet.</span><span>Play a video or emit a score to begin.</span></li>';
  route();
}
function connect() {
  eventSource?.close();
  connection('Connecting to scoreboard…');
  eventSource = new EventSource(`/api/feed?viewer=${encodeURIComponent(viewerId)}`);
  eventSource.addEventListener('state', (event) => { render(JSON.parse(event.data)); $('reconnect').hidden = true; });
  eventSource.onerror = () => { connection('Control plane disconnected'); $('reconnect').hidden = false; };
}
$('reconnect').onclick = () => { telemetryEnabled = true; connect(); };
document.addEventListener('click', (event) => {
  const anchor = event.target.closest('a[data-route]');
  if (!anchor || event.button !== 0 || event.metaKey || event.ctrlKey || event.shiftKey || event.altKey) return;
  event.preventDefault();
  history.pushState({}, '', anchor.getAttribute('href'));
  if (state) route();
  $('main').scrollIntoView({ behavior: 'instant' });
});
addEventListener('popstate', () => { if (state) route(); });
async function control(button, fields) { button.disabled = true; try { await emit(fields); } catch { /* emit presents recovery and operation ID. */ } finally { button.disabled = false; } }
$('score-form').onsubmit = async (event) => {
  event.preventDefault();
  if (!currentMatch) return;
  await control(event.submitter, { kind: 'score', matchId: currentMatch.id, side: $('score-side').value, delta: Number($('score-delta').value), expectedRevision: currentMatch.revision });
};
$('watchlist').onclick = () => { if (currentMatch) void control($('watchlist'), { kind: 'watchlist', matchId: currentMatch.id, viewerId, enabled: !state.viewer.watchlist.includes(currentMatch.id) }); };
for (const side of ['home', 'away']) $(`follow-${side}`).onclick = () => { if (currentMatch) void control($(`follow-${side}`), { kind: 'follow', matchId: currentMatch.id, viewerId, side, enabled: !state.viewer.follows.includes(currentMatch[side]) }); };
async function telemetry(kind, matchId = currentMatch?.id) {
  if (!matchId || !telemetryEnabled) return;
  try { await emit({ kind, matchId, viewerId, position: Number.isFinite($('player').currentTime) ? $('player').currentTime : 0 }); }
  catch (error) { telemetryEnabled = false; $('reconnect').hidden = false; throw error; }
}
$('player').onplay = () => { $('playback-status').textContent = 'Playing original local animation. Heartbeats every 10 seconds while visible.'; void telemetry('play').catch(() => {}); };
$('player').onpause = () => {
  if (ignoredPauses) { ignoredPauses -= 1; return; }
  $('playback-status').textContent = 'Playback paused.';
  void telemetry('pause').catch(() => {});
};
$('player').onerror = () => { if (currentMatch) showError('Video could not be loaded or decoded. Confirm the sports Nix image was built and /media/' + currentMatch.sport + '.mp4 returns video/mp4; use a browser with H.264 support.'); };
async function heartbeat() {
  if (!currentMatch || $('player').paused || document.hidden || heartbeatBusy || !telemetryEnabled) return;
  heartbeatBusy = true;
  try { await telemetry('heartbeat'); } catch { /* Visible operation recovery from emit. */ } finally { heartbeatBusy = false; }
}
let timer = setInterval(heartbeat, 10000);
addEventListener('pagehide', () => { clearInterval(timer); eventSource?.close(); });
addEventListener('pageshow', event => {
  if (event.persisted) { timer = setInterval(heartbeat, 10000); connect(); }
});
try { render(await json(`/api/state?viewer=${encodeURIComponent(viewerId)}`)); connect(); }
catch (error) { showError(`Could not load broadcasts: ${error.message}. Reconnect after the app is healthy.`); $('reconnect').hidden = false; }
