const $ = id => document.getElementById(id);
let state = null, selected = '', articleId = null, pending = null, busy = false, paused = false, refreshing = false, readFailed = false;
const postNodes = new Map(), authorNodes = new Map(), analyticNodes = new Map();
const storageKey = 'commonfield-pending-v1';
function storageWarning() { $('storage').textContent = 'Browser storage is unavailable. This page still works, but copy unresolved commands before closing it; they cannot be recovered after a reload.'; }
try {
  selected = localStorage.getItem('commonfield-viewer') || '';
  const stored = localStorage.getItem(storageKey);
  if (stored) {
    const parsed = JSON.parse(stored);
    if (!parsed || typeof parsed !== 'object' || !/^[a-zA-Z0-9_-]{1,80}$/.test(parsed.id) || !['profile', 'publish', 'feed', 'follow', 'like', 'read'].includes(parsed.type)) throw new Error('Invalid stored command');
    pending = parsed;
  }
} catch (error) { storageWarning(); }
function remember(key, value) {
  try { if (value === null) localStorage.removeItem(key); else localStorage.setItem(key, value); } catch { storageWarning(); }
}
function status(message) { $('status').textContent = message; }
function element(tag, className, text) {
  const node = document.createElement(tag);
  if (className) node.className = className;
  if (text !== undefined) node.textContent = text;
  return node;
}
function button(text, action) {
  const node = element('button', '', text); node.type = 'button'; node.addEventListener('click', action); return node;
}
function lock() {
  const blocked = busy || Boolean(pending) || readFailed || !state?.ready;
  $('recovery').hidden = !pending;
  const payload = pending ? JSON.stringify(pending, null, 2) : '';
  if ($('pending-payload').value !== payload) $('pending-payload').value = payload;
  $('retry').disabled = busy || !pending || readFailed || !state?.ready;
  $('inspect').disabled = busy || !pending;
  $('mode').disabled = blocked || !selected;
  for (const form of [$('profile-form'), $('publish-form')]) form.querySelector('button').disabled = blocked || (form.id === 'publish-form' && !selected);
  $('read-again').disabled = blocked || !selected || !articleId;
  for (const nodes of postNodes.values()) { nodes.like.disabled = blocked || !selected; nodes.read.disabled = blocked || !selected; }
  for (const nodes of authorNodes.values()) nodes.follow.disabled = blocked || !selected || nodes.id === selected;
}
async function request(path, body) {
  const response = await fetch(path, { method: body === undefined ? 'GET' : 'POST', headers: body === undefined ? {} : { 'content-type': 'application/json' }, body: body === undefined ? undefined : JSON.stringify(body), signal: AbortSignal.timeout(65000) });
  return { status: response.status, body: await response.json() };
}
function complete(receipt) {
  $('receipt').textContent = JSON.stringify(receipt, null, 2);
  pending = null; remember(storageKey, null);
  if (receipt.accepted && receipt.command.type === 'profile') { selected = receipt.command.profileId; remember('commonfield-viewer', selected); }
  status(receipt.accepted ? `Consumed ${receipt.command.type} · ${receipt.command.id} · offset ${receipt.offset}${receipt.changed ? '' : ' · state already matched'}` : `Consumed rejection · ${receipt.reason} · ${receipt.command.id}`);
}
async function sendExact() {
  if (!pending || busy) return;
  busy = true; lock();
  try {
    const response = await request('/api/commands', pending);
    if (response.body.command && typeof response.body.accepted === 'boolean') complete(response.body);
    else if ([400, 403, 413, 415].includes(response.status) && response.body.outcomeUnknown === false) {
      const id = pending.id;
      pending = null; remember(storageKey, null);
      status(`Rejected before publication · ${id} · ${response.body.error}`);
    } else status(`${response.body.error || 'No consumed outcome.'} Keep ID ${pending.id}.`);
  } catch (error) { status(`Request outcome unknown. Keep ID ${pending.id}; inspect its receipt before retrying. ${error.message}`); }
  finally { busy = false; await refresh(false); lock(); }
}
async function command(fields) {
  if (busy || pending || readFailed || !state?.ready) { status('Reconnect and resolve any pending command before sending new work.'); return; }
  pending = { id: `cmd-${crypto.randomUUID()}`, ...fields };
  remember(storageKey, JSON.stringify(pending)); lock(); await sendExact();
}
function viewer() { return state?.profiles.find(profile => profile.profileId === selected); }
function reorder(container, nodes) {
  let cursor = container.firstElementChild;
  for (const node of nodes) {
    if (node === cursor) cursor = cursor.nextElementSibling;
    else container.insertBefore(node, cursor);
  }
}
function render() {
  const ids = new Set(state.profiles.map(profile => profile.profileId));
  for (const option of [...$('viewer').options]) if (option.value && !ids.has(option.value)) option.remove();
  for (const profile of state.profiles) {
    let option = [...$('viewer').options].find(item => item.value === profile.profileId);
    if (!option) { option = element('option'); option.value = profile.profileId; $('viewer').append(option); }
    option.textContent = `${profile.name} · ${profile.profileId}${profile.fixture ? ' · fixture' : ''}`;
  }
  if (!ids.has(selected)) selected = '';
  $('viewer').value = selected;
  const current = viewer();
  if (document.activeElement !== $('mode')) $('mode').value = current?.mode || 'all';
  const feed = current ? state.posts.filter(post => current.mode === 'all' || current.follows.includes(post.authorId)) : [];
  $('feed-meta').textContent = current ? `${current.mode === 'all' ? 'All public posts' : 'Followed authors'} · newest log offset first` : 'No reader selected';
  $('feed-empty').hidden = feed.length > 0;
  $('feed-empty').textContent = current ? 'No posts in this feed. Follow an author or select all public posts.' : 'Choose a reader to see a feed.';
  const feedIds = new Set(feed.map(post => post.postId));
  for (const [id, nodes] of postNodes) if (!feedIds.has(id)) { nodes.root.remove(); postNodes.delete(id); }
  for (const post of feed) {
    let nodes = postNodes.get(post.postId);
    if (!nodes) {
      const root = element('article', 'post');
      const title = element('h3', 'post-title'), byline = element('p', 'byline muted'), summary = element('p'), counts = element('p', 'counts muted');
      const actions = element('div', 'actions');
      const read = button('Read local article', () => { void openArticle(post.postId); });
      const like = button('Like', () => {
        const latest = state.posts.find(item => item.postId === post.postId);
        void command({ type: 'like', viewerId: selected, postId: post.postId, liked: !latest.likes.includes(selected) });
      });
      actions.append(read, like); root.append(byline, title, summary, counts, actions);
      nodes = { root, title, byline, summary, counts, read, like }; postNodes.set(post.postId, nodes);
    }
    const author = state.profiles.find(profile => profile.profileId === post.authorId);
    nodes.title.textContent = post.title;
    nodes.byline.textContent = `${author.name} · ${post.fixture ? 'Logged fixture article' : 'Public dispatch'} · ${post.postId}`;
    nodes.summary.textContent = post.summary;
    nodes.counts.textContent = `${post.readCount} read opens / ${post.distinctReaders} distinct reader IDs / ${post.likes.length} current likes`;
    const liked = post.likes.includes(selected); nodes.like.textContent = liked ? 'Unlike' : 'Like'; nodes.like.setAttribute('aria-pressed', String(liked));
    nodes.read.setAttribute('aria-label', `Read local article: ${post.title}`);
    nodes.like.setAttribute('aria-label', `${liked ? 'Unlike' : 'Like'}: ${post.title}`);
  }
  reorder($('feed'), feed.map(post => postNodes.get(post.postId).root));
  for (const profile of state.profiles) {
    let nodes = authorNodes.get(profile.profileId);
    if (!nodes) {
      const root = element('div', 'author'), name = element('strong'), bio = element('p', 'muted');
      const follow = button('Follow', () => { void command({ type: 'follow', viewerId: selected, targetId: profile.profileId, following: !viewer().follows.includes(profile.profileId) }); });
      root.append(name, bio, follow); $('profiles').append(root);
      nodes = { id: profile.profileId, root, name, bio, follow }; authorNodes.set(profile.profileId, nodes);
    }
    nodes.name.textContent = `${profile.name}${profile.fixture ? ' · fixture' : ''}`; nodes.bio.textContent = profile.bio;
    const follows = current?.follows.includes(profile.profileId) || false;
    nodes.follow.textContent = selected === profile.profileId ? 'Selected profile' : follows ? 'Unfollow' : 'Follow'; nodes.follow.setAttribute('aria-pressed', String(follows));
    nodes.follow.setAttribute('aria-label', selected === profile.profileId ? `Selected profile: ${profile.name}` : `${follows ? 'Unfollow' : 'Follow'} ${profile.name}`);
  }
  for (const post of state.posts) {
    let nodes = analyticNodes.get(post.postId);
    if (!nodes) {
      const root = element('tr'); const cells = Array.from({ length: 4 }, () => element('td')); root.append(...cells); $('analytics').append(root);
      nodes = { root, cells }; analyticNodes.set(post.postId, nodes);
    }
    [post.title, post.readCount, post.distinctReaders, post.likes.length].forEach((value, index) => { nodes.cells[index].textContent = String(value); });
  }
  reorder($('analytics'), state.posts.map(post => analyticNodes.get(post.postId).root));
  $('ledger').textContent = `Consumed offset ${state.lastOffset ?? 'none'} · ${state.operations.length} command receipts · ${state.duplicates} broker duplicates`;
  lock();
}
async function refresh(announce = true) {
  if (refreshing) return;
  refreshing = true;
  try {
    const response = await request('/api/state');
    if (response.status !== 200) throw new Error(response.body.error || 'State unavailable');
    readFailed = false;
    state = response.body; render();
    if (!state.ready) status(state.unknown?.message || 'The app is not accepting commands.');
    else if (announce) status(paused ? 'Refreshed. Automatic updates remain paused.' : 'Public edition is current. Only consumed records appear here.');
  } catch (error) {
    readFailed = true;
    status(`Refresh failed: ${error.message}. Previously consumed view retained.`);
    lock();
  }
  finally { refreshing = false; }
}
async function openArticle(postId) {
  if (pending || busy || readFailed || !selected || !state?.ready) return;
  const openingViewer = selected;
  busy = true; lock();
  try {
    const response = await request(`/api/articles/${encodeURIComponent(postId)}`);
    if (response.status !== 200) throw new Error(response.body.error || 'Article unavailable');
    const { post, author } = response.body;
    articleId = post.postId;
    $('article-title').textContent = post.title;
    $('article-byline').textContent = `By ${author.name} · public article · ${post.postId}`;
    $('article-source').textContent = post.fixture ? 'Explicit logged fixture' : 'Reader-published article';
    $('article-body').replaceChildren(...post.body.split(/\n\n+/).map(paragraph => element('p', '', paragraph)));
    $('article').hidden = false; $('article-title').focus();
    busy = false;
    await command({ type: 'read', viewerId: openingViewer, postId, surface: 'article' });
  } catch (error) { status(`Article open failed: ${error.message}`); }
  finally { busy = false; lock(); }
}
$('viewer').addEventListener('change', () => { selected = $('viewer').value; remember('commonfield-viewer', selected); if (state) render(); });
$('mode').addEventListener('change', () => { void command({ type: 'feed', viewerId: selected, mode: $('mode').value }); });
$('profile-form').addEventListener('submit', event => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  void command({ type: 'profile', profileId: `reader-${crypto.randomUUID()}`, name: form.get('name'), bio: form.get('bio') });
});
$('publish-form').addEventListener('submit', event => {
  event.preventDefault(); const form = new FormData(event.currentTarget);
  void command({ type: 'publish', viewerId: selected, postId: `post-${crypto.randomUUID()}`, title: form.get('title'), summary: form.get('summary'), body: form.get('body'), visibility: 'public' });
});
$('inspect').addEventListener('click', async () => {
  if (!pending || busy) return; busy = true; lock();
  try {
    const response = await request(`/api/commands/${encodeURIComponent(pending.id)}`);
    if (response.status === 200) complete(response.body); else status(response.body.error || response.body.message || 'No consumed receipt. Preserve the command.');
  } catch (error) { status(`Receipt lookup failed: ${error.message}. Keep the exact command.`); }
  finally { busy = false; await refresh(false); lock(); }
});
$('retry').addEventListener('click', () => { void sendExact(); });
$('read-again').addEventListener('click', () => { void openArticle(articleId); });
$('close-article').addEventListener('click', () => { $('article').hidden = true; articleId = null; lock(); });
$('refresh').addEventListener('click', () => { void refresh(); });
$('updates').addEventListener('click', () => { paused = !paused; $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; $('updates').setAttribute('aria-pressed', String(paused)); status(paused ? 'Automatic updates paused. Commands still consume and refresh their receipts.' : 'Automatic updates resumed.'); if (!paused) void refresh(); });
lock(); await refresh();
const timer = setInterval(() => { if (!paused && !document.hidden) void refresh(false); }, 2000);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
