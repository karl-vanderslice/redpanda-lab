const $ = (id) => document.getElementById(id);
let tenants = [];
let initialized = false;
const regionalCards = new Map();
let submitting = false;
let operation;
let paused = false;
let timer;
let refreshTask;
let refreshController;
let lookingUp = false;
let globalObserved = false;

function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
function placement() {
  const tenant = tenants.find((item) => item.id === $('tenant').value);
  if (tenant) $('placement').textContent = `${tenant.country} → ${tenant.region.toUpperCase()} cluster → partition ${tenant.partition}. Kafka key: ${tenant.id}.`;
}
$('tenant').addEventListener('change', placement);

function controls() {
  const unresolved = submitting || Boolean(operation);
  $('tenant').disabled = !initialized || unresolved;
  $('amount').readOnly = unresolved;
  $('note').readOnly = unresolved;
  $('submit').disabled = !initialized || unresolved;
}

function createRegion(region) {
  const card = node('article', undefined, 'region-column');
  const heading = node('header', undefined, 'region-heading');
  heading.append(node('p', 'Home-cluster source', 'eyebrow'), node('h3', region.toUpperCase()));
  const status = node('p', 'Awaiting source evidence.', 'status');
  const exportState = node('p', 'Awaiting exporter evidence.', 'export-state');
  const table = node('table', undefined, 'shard-table');
  table.append(node('caption', 'Regional consumer progress'));
  const head = node('thead'), header = node('tr');
  ['Shard', 'Offset', 'Records', 'Units'].forEach((text) => { const th = node('th', text); th.scope = 'col'; header.append(th); });
  head.append(header);
  const rows = node('tbody');
  table.append(head, rows);
  const details = node('details', undefined, 'private-records');
  details.append(node('summary', 'Inspect regional private records'));
  const note = node('p', 'Latest eight records returned by this home region. Tenant IDs and notes below are resident source fields, not exported summary fields.', 'field-note');
  const records = node('ol', undefined, 'records');
  details.append(note, records);
  card.append(heading, status, exportState, table, details);
  $('regional-empty')?.remove();
  $('regional').append(card);
  const view = { status, exportState, rows, records, observed: false };
  regionalCards.set(region, view);
  return view;
}

function renderState(state) {
  tenants = state.tenants;
  if (!initialized) {
    $('tenant').replaceChildren(...tenants.map((tenant) => {
      const option = node('option', `${tenant.id} (${tenant.country}, ${tenant.region.toUpperCase()})`);
      option.value = tenant.id;
      return option;
    }));
    initialized = true;
    controls();
    placement();
  }
  for (const region of state.regions) {
    const view = regionalCards.get(region.region) || createRegion(region.region);
    const available = region.available && region.brokerAvailable && region.ready;
    view.status.textContent = available ? 'Home cluster available' : region.available ? 'Home cluster unavailable or replaying; source values may be stale.' : `Regional service unavailable. ${view.observed ? 'Previous gateway observation retained; values are stale.' : 'No source values observed.'}`;
    view.status.className = available ? 'status' : 'status offline';
    view.exportState.textContent = region.available ? `Export: ${region.federation || 'unavailable'}${region.federationError ? ` · ${region.federationError}` : ''}` : `Export: not observed · ${region.error || 'Regional service unavailable.'}`;
    if (!region.available) continue;
    view.observed = true;
    view.rows.replaceChildren(...(region.shards || []).map((shard) => {
      const row = node('tr');
      [shard.partition, shard.sourceOffset, shard.count, shard.totalAmount].forEach((value) => row.append(node('td', String(value))));
      return row;
    }));
    view.records.replaceChildren(...(region.records || []).slice(-8).map((record) => {
      const item = node('li');
      item.append(node('p', `${record.event.tenantId} · p${record.partition} @ ${record.offset}`, 'record-location'), node('p', `${record.event.amount} synthetic units`), node('p', record.event.privateNote, 'private-note'));
      return item;
    }));
    if (!view.records.children.length) view.records.append(node('li', 'No records yet.'));
  }
  const global = state.global;
  $('global-status').textContent = global.available && global.brokerAvailable && global.ready ? 'Global consumer available. Snapshots update asynchronously.' : global.available ? 'Global cluster unavailable or replaying. Displayed snapshots may be stale.' : `Global service unavailable. ${globalObserved ? 'Previous gateway observation retained; snapshots are stale.' : 'No global snapshots observed.'}`;
  if (global.available) {
    globalObserved = true;
    const summaries = [...(global.summaries || [])].sort((a, b) => a.region.localeCompare(b.region) || a.partition - b.partition);
    $('summaries').replaceChildren(...summaries.map((summary) => {
      const row = node('tr');
      const labels = ['Region', 'Partition', 'Source offset', 'Records', 'Total units'];
      [summary.region.toUpperCase(), summary.partition, summary.sourceOffset, summary.count, summary.totalAmount].forEach((value, index) => {
        const cell = node('td', String(value));
        cell.dataset.label = labels[index];
        row.append(cell);
      });
      return row;
    }));
    if (!summaries.length) {
      const row = node('tr'), cell = node('td', 'No snapshots consumed yet.');
      cell.colSpan = 5;
      row.append(cell);
      $('summaries').append(row);
    }
    $('totals').textContent = `${summaries.reduce((sum, item) => sum + item.count, 0)} exported records · ${summaries.reduce((sum, item) => sum + item.totalAmount, 0)} synthetic units. No tenant IDs or private notes in this projection.`;
  }
  $('connection').textContent = 'Operator gateway connected. Regional availability is checked independently.';
  $('last-refresh').textContent = `Last gateway observation: ${new Date().toLocaleTimeString()}.`;
}

async function checkOperation(signal) {
  if (!operation || submitting || lookingUp) return;
  const current = operation;
  lookingUp = true;
  try {
    const response = await fetch(`/api/operations/${current.region}/${current.id}`, { signal: signal ? AbortSignal.any([signal, AbortSignal.timeout(5000)]) : AbortSignal.timeout(5000) });
    const result = await response.json();
    if (signal?.aborted || operation !== current || submitting) return;
    if (response.ok) {
      $('result').textContent = `${result.status} · ${current.region.toUpperCase()} · partition ${result.partition} · offset ${result.offset ?? 'not observed'} · operation ${current.id}`;
      if (result.status === 'completed') { operation = undefined; controls(); }
    } else {
      $('result').textContent = `Operation ${current.id} · home region ${current.region.toUpperCase()} · ${response.status === 404 ? 'not observed; absence is not proof that publication failed' : result.error || `HTTP ${response.status}`}. Inspect the home region and logs; do not create a new ID for an uncertain write.`;
    }
  } catch (failure) {
    if (!signal?.aborted && operation === current && !submitting) $('result').textContent = `Lookup failed: ${failure.message}. Outcome remains unresolved. Operation ${current.id}, home region ${current.region.toUpperCase()}. Inspect before retrying.`;
  } finally { lookingUp = false; }
}

function refresh() {
  if (refreshTask) return refreshTask;
  refreshController = new AbortController();
  const controller = refreshController;
  refreshTask = (async () => {
    try {
      const response = await fetch('/api/state', { signal: AbortSignal.any([controller.signal, AbortSignal.timeout(10000)]) });
      if (!response.ok) throw new Error(`HTTP ${response.status}`);
      const state = await response.json();
      if (controller.signal.aborted) return;
      renderState(state);
      await checkOperation(controller.signal);
    } catch (failure) {
      if (!controller.signal.aborted) $('connection').textContent = `Gateway refresh failed: ${failure.message}. Existing values may be stale.`;
    } finally { refreshTask = undefined; refreshController = undefined; }
  })();
  return refreshTask;
}
function schedule() {
  clearTimeout(timer);
  if (!paused) timer = setTimeout(async () => { await refresh(); schedule(); }, 2500);
}
$('updates').addEventListener('click', () => {
  paused = !paused;
  clearTimeout(timer);
  if (paused) refreshController?.abort();
  $('updates').textContent = paused ? 'Resume updates' : 'Pause updates';
  $('updates').setAttribute('aria-pressed', String(paused));
  $('poll-state').textContent = paused ? 'Automatic updates paused. Refresh now and Check operation still read the gateway.' : 'Automatic refresh every 2.5 seconds.';
  $('connection').textContent = paused ? 'Automatic reads paused. Displayed values are the last observation, not live evidence.' : 'Automatic reads resumed. Awaiting next gateway observation.';
  schedule();
});
$('refresh').addEventListener('click', async () => { await refresh(); schedule(); });
$('check-operation').addEventListener('click', async () => {
  if (!operation) { $('result').textContent = 'No unresolved operation to check.'; return; }
  await checkOperation();
});
$('record').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (submitting) return;
  if (operation) { $('result').textContent = `Resolve operation ${operation.id} before another submission. Inspect its home region and logs; do not create a new ID for an uncertain write.`; return; }
  const tenant = tenants.find((item) => item.id === $('tenant').value);
  if (!tenant) { $('result').textContent = 'Wait for the tenant registry before submitting.'; return; }
  const input = Object.freeze({ id: crypto.randomUUID(), tenantId: tenant.id, amount: Number($('amount').value), privateNote: $('note').value });
  operation = Object.freeze({ id: input.id, region: tenant.region, input });
  submitting = true;
  controls();
  $('check-operation').hidden = false;
  $('result').textContent = `Publishing ${input.id} to ${tenant.region.toUpperCase()}…`;
  try {
    const response = await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    $('result').textContent = response.ok ? `${result.status} · ${tenant.region.toUpperCase()} · partition ${result.partition} · offset ${result.offset ?? 'pending'} · operation ${input.id}` : `${result.error} · outcome ${result.outcome || 'rejected'} · operation ${input.id}`;
    if (result.status === 'completed' || result.outcome === 'not-attempted' || (response.status >= 400 && response.status < 500)) operation = undefined;
  } catch (failure) {
    $('result').textContent = `${failure.message}. Outcome unknown. Operation ${input.id}, home region ${tenant.region}. Inspect before retrying.`;
  } finally {
    submitting = false;
    controls();
    if (!paused) { await refresh(); schedule(); }
  }
});
await refresh();
schedule();
