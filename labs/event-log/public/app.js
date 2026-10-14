'use strict';
const $ = id => document.getElementById(id);
const storageKey = 'folio-harbor-pending-v1';
let state = null, selected = null, paused = false, fetching = false, busy = false, pending = null, readFailed = false;
const itemNodes = new Map(), ledgerNodes = new Map();
try {
  const saved = JSON.parse(sessionStorage.getItem(storageKey));
  if (saved && typeof saved.command?.id === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(saved.command.id)) pending = { command: saved.command, canRetry: false };
} catch { /* Storage denial does not disable command recovery in this page. */ }
function savePending() {
  try { if (pending) sessionStorage.setItem(storageKey, JSON.stringify(pending)); else sessionStorage.removeItem(storageKey); } catch { /* Keep the exact input in memory and visibly on the page. */ }
}
const pretty = value => JSON.stringify(value, null, 2);
function message(text) { $('message').textContent = text; }
function recovery() {
  $('pending-box').hidden = !pending;
  $('submit').disabled = busy || Boolean(pending) || readFailed || !state?.ready;
  $('rebuild').disabled = busy || state?.rebuilding === true;
  $('recover').disabled = busy;
  $('retry').hidden = !pending?.canRetry;
  $('retry').disabled = busy || readFailed || !state?.ready;
  if (pending) {
    $('pending-copy').textContent = `Completion for ${pending.command.id} is not established. Keep this exact input. Look up its receipt; if absent, close the old writer with a successful rebuild before retrying. Do not invent a replacement identifier.`;
    $('pending-input').textContent = pretty(pending.command);
  }
}
function fields() {
  const kind = $('kind').value;
  for (const [group, input, visible] of [
    ['title-field', 'title', kind === 'create'], ['revision-field', 'revision', kind !== 'create'],
    ['assignee-field', 'assignee', kind === 'assign'], ['note-field', 'note', kind === 'close' || kind === 'reopen'],
  ]) { $(group).hidden = !visible; $(input).required = visible; $(input).disabled = !visible; }
}
function newId() { $('command-id').value = crypto.randomUUID(); }
function facts(item) {
  $('item-facts').replaceChildren();
  if (!item) return;
  for (const [term, value] of [['Identifier', item.id], ['State / revision', `${item.status} / ${item.revision}`], ['Archivist', item.assignee ?? 'Unassigned'], ['Last note', item.note ?? 'No note'], ['Last command', item.lastCommandId]]) {
    const dt = document.createElement('dt'), dd = document.createElement('dd');
    dt.textContent = term; dd.textContent = value; $('item-facts').append(dt, dd);
  }
}
function selectItem(id) {
  selected = id;
  const item = state?.projection.items.find(value => value.id === id);
  if (!item) return;
  $('item-id').value = item.id; $('revision').value = item.revision;
  $('kind').value = item.status === 'open' ? 'assign' : 'reopen';
  $('assignee').value = item.assignee ?? ''; fields(); newId(); render();
  $('item-heading').focus();
}
$('item-heading').tabIndex = -1;
function render() {
  if (!state) return;
  $('owner').textContent = readFailed ? 'Connection unavailable · consumed view retained' : state.rebuilding ? 'Rebuilding · workspace held until full replay is ready' : state.ready ? 'Ready · full startup prefix consumed' : `Not ready · ${state.fault ?? 'Starting replay'}`;
  if (!state.ready) { recovery(); return; }
  const projection = state.projection;
  $('offset').textContent = projection.lastOffset ?? 'Empty log';
  $('record-count').textContent = `${projection.commands.length} / ${projection.ledger.length}`;
  $('duplicates').textContent = projection.duplicates;
  const query = $('filter').value.toLocaleLowerCase();
  let matches = 0;
  const liveIds = new Set(projection.items.map(item => item.id));
  for (const [id, node] of itemNodes) if (!liveIds.has(id)) { node.remove(); itemNodes.delete(id); }
  for (const item of projection.items) {
    let node = itemNodes.get(item.id);
    if (!node) {
      node = document.createElement('li'); const button = document.createElement('button'); button.type = 'button';
      button.addEventListener('click', () => selectItem(item.id)); node.append(button); $('items').append(node); itemNodes.set(item.id, node);
    }
    node.firstChild.textContent = `${item.id} · ${item.title}\n${item.status} / r${item.revision}`;
    node.firstChild.setAttribute('aria-current', String(selected === item.id));
    node.hidden = !`${item.id} ${item.title}`.toLocaleLowerCase().includes(query);
    if (!node.hidden) matches += 1;
  }
  $('index-count').textContent = `${matches} shown / ${projection.items.length} indexed`;
  const item = projection.items.find(value => value.id === selected);
  $('item-heading').textContent = item ? item.title : 'Open a folio';
  $('item-summary').textContent = item ? 'Derived from accepted records. Expected revision stays as entered until you select the item again.' : 'Select an indexed item, or create a new work item.';
  facts(item);
  const receipts = new Map(projection.commands.map(receipt => [receipt.id, receipt]));
  const liveOffsets = new Set(projection.ledger.map(entry => entry.offset));
  for (const [offset, node] of ledgerNodes) if (!liveOffsets.has(offset)) { node.remove(); ledgerNodes.delete(offset); }
  for (const entry of projection.ledger) {
    if (ledgerNodes.has(entry.offset)) continue;
    const receipt = receipts.get(entry.commandId);
    const li = document.createElement('li'), offset = document.createElement('span'), details = document.createElement('details'), summary = document.createElement('summary'), pre = document.createElement('pre'), button = document.createElement('button');
    offset.className = 'offset'; offset.textContent = `#${entry.offset}`;
    summary.textContent = `${receipt.command.itemId} · ${receipt.command.kind} · ${entry.duplicate ? 'identical duplicate' : receipt.result.accepted ? 'accepted' : 'rejected'} · ${receipt.result.code} · ${receipt.id}`;
    pre.textContent = pretty(receipt.record); button.type = 'button'; button.textContent = 'Inspect this receipt';
    button.addEventListener('click', () => { $('receipt-id').value = receipt.id; $('receipt').textContent = pretty(receipt); $('receipt-status').textContent = 'Consumed receipt, including the original physical offset.'; });
    details.append(summary, pre, button); li.append(offset, details); $('ledger').append(li); ledgerNodes.set(entry.offset, li);
  }
  $('ledger-empty').hidden = projection.ledger.length > 0;
  if (state.lastRebuild) {
    $('rebuild-result').textContent = state.lastRebuild.equal ? 'Exact projection equality verified after full replay.' : 'Replay completed with a different prefix view. Inspect evidence; late records may have arrived before the old owner closed.';
    $('replay-evidence').textContent = pretty(state.lastRebuild);
  } else { $('rebuild-result').textContent = 'No explicit rebuild in this process.'; $('replay-evidence').textContent = 'No rebuild evidence yet.'; }
  recovery();
}
async function request(path, command) {
  const response = await fetch(path, { ...(command === undefined ? {} : { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(command) }), signal: AbortSignal.timeout(command === undefined ? 15000 : 120000) });
  const body = await response.json();
  return { status: response.status, body };
}
async function refresh() {
  if (fetching) return;
  fetching = true;
  try {
    const result = await request('/api/state');
    if (result.status !== 200) throw new Error(result.body.error ?? 'State request failed.');
    if (readFailed) message(pending ? 'Connection restored. Look up the preserved command receipt before retrying.' : 'Connection restored. Consumed view updated.');
    readFailed = false;
    state = result.body; render();
  } catch (error) {
    readFailed = true;
    $('owner').textContent = 'Connection unavailable · consumed view retained';
    recovery();
    message(`${error.message} Keep any submitted command id and look it up after reconnecting.`);
  }
  finally { fetching = false; }
}
function resolved(receipt) {
  pending = null; savePending(); recovery();
  $('receipt-id').value = receipt.id; $('receipt').textContent = pretty(receipt);
  message(`${receipt.result.accepted ? 'Accepted' : 'Rejected'}: ${receipt.result.code}. Consumed command ${receipt.id} at offset ${receipt.offset}.`);
  newId();
}
async function submit(command) {
  busy = true; pending = { command, canRetry: false }; savePending(); recovery();
  try {
    const result = await request('/api/commands', command);
    if (result.body.record && [200, 409].includes(result.status)) resolved(result.body);
    else if (result.body.outcomeUnknown) message(result.body.error);
    else { pending = null; savePending(); message(result.body.error ?? 'Request rejected before append. Correct the input and try again.'); }
  } catch (error) { message(`${error.message} Completion is unknown. Preserve the exact input shown below.`); }
  finally { busy = false; recovery(); await refresh(); }
}
async function recover() {
  if (!pending) return;
  busy = true; recovery();
  try {
    const result = await request(`/api/commands/${encodeURIComponent(pending.command.id)}`);
    if (result.status === 200) resolved(result.body);
    else message(`${result.body.error} ${pending.canRetry ? 'The old owner was closed by your successful rebuild; retry only the preserved input.' : 'A successful rebuild is required before retrying an absent receipt.'}`);
  } catch (error) { message(`${error.message} Keep the preserved input and look it up again.`); }
  finally { busy = false; recovery(); }
}
$('command-form').addEventListener('submit', event => {
  event.preventDefault(); if (busy || pending) return;
  const kind = $('kind').value;
  const command = { id: $('command-id').value, kind, itemId: $('item-id').value };
  if (kind === 'create') command.title = $('title').value;
  else { command.expectedRevision = Number($('revision').value); if (kind === 'assign') command.assignee = $('assignee').value; else command.note = $('note').value; }
  void submit(command);
});
$('kind').addEventListener('change', fields);
$('filter').addEventListener('input', render);
$('new-item').addEventListener('click', () => { selected = null; $('kind').value = 'create'; $('item-id').value = ''; $('title').value = ''; fields(); newId(); render(); $('item-id').focus(); });
$('recover').addEventListener('click', () => { void recover(); });
$('retry').addEventListener('click', () => { if (pending?.canRetry && !busy) void submit(pending.command); });
$('rebuild').addEventListener('click', async () => {
  if (busy) return;
  busy = true; recovery(); message('Closing the old owner and rebuilding from the broker.');
  try {
    const result = await request('/api/rebuild', {});
    if (result.status !== 200 || !result.body.ready) throw new Error(result.body.error ?? 'Rebuild did not become ready.');
    if (pending) { pending.canRetry = true; savePending(); }
    message(result.body.replay.equal ? 'Actual-log rebuild finished with exact projection equality.' : 'Actual-log rebuild finished. The consumed prefix changed; inspect replay evidence.');
  } catch (error) { message(`${error.message} Retry rebuild or inspect app logs. Do not retry an uncertain command yet.`); }
  finally { busy = false; recovery(); await refresh(); if (pending?.canRetry) await recover(); }
});
$('receipt-form').addEventListener('submit', async event => {
  event.preventDefault();
  try { const result = await request(`/api/commands/${encodeURIComponent($('receipt-id').value)}`); $('receipt-status').textContent = result.status === 200 ? 'Consumed immutable receipt.' : result.body.error; $('receipt').textContent = pretty(result.body); }
  catch (error) { $('receipt-status').textContent = `${error.message} Refresh and look up the same id again.`; }
});
$('updates').addEventListener('click', () => { paused = !paused; $('updates').setAttribute('aria-pressed', String(paused)); $('updates').textContent = paused ? 'Resume updates' : 'Pause updates'; if (!paused) void refresh(); });
$('refresh').addEventListener('click', () => { void refresh(); });
newId(); fields(); recovery(); void refresh();
const timer = setInterval(() => { if (!paused && !document.hidden) void refresh(); }, 2000);
window.addEventListener('pagehide', () => clearInterval(timer), { once: true });
