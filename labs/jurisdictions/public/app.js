const $ = (id) => document.getElementById(id);
let tenants = [];
let initialized = false;
const regionalCards = new Map();
let submitting = false;
let operation;
let theme;
try { theme = localStorage.getItem('jurisdictions-theme'); } catch { /* Storage is optional. */ }
if (['light', 'dark'].includes(theme)) document.documentElement.dataset.theme = theme;
$('theme').addEventListener('click', () => {
  const dark = document.documentElement.dataset.theme ? document.documentElement.dataset.theme === 'dark' : matchMedia('(prefers-color-scheme: dark)').matches;
  theme = dark ? 'light' : 'dark';
  document.documentElement.dataset.theme = theme;
  try { localStorage.setItem('jurisdictions-theme', theme); } catch { /* Keep page-local choice. */ }
});
function placement() {
  const tenant = tenants.find((item) => item.id === $('tenant').value);
  if (tenant) $('placement').textContent = `${tenant.country} → ${tenant.region.toUpperCase()} cluster → partition ${tenant.partition}. Kafka key: ${tenant.id}.`;
}
$('tenant').addEventListener('change', placement);
function node(tag, text, className) {
  const element = document.createElement(tag);
  if (text !== undefined) element.textContent = text;
  if (className) element.className = className;
  return element;
}
async function refresh() {
  try {
    const response = await fetch('/api/state', { signal: AbortSignal.timeout(10000) });
    if (!response.ok) throw new Error(`HTTP ${response.status}`);
    const state = await response.json();
    tenants = state.tenants;
    if (!initialized) {
      $('tenant').replaceChildren(...tenants.map((tenant) => { const option = node('option', `${tenant.id} (${tenant.country}, ${tenant.region.toUpperCase()})`); option.value = tenant.id; return option; }));
      placement(); initialized = true;
    }
    for (const region of state.regions) {
      let view = regionalCards.get(region.region);
      if (!view) {
        const card = node('article', undefined, 'card');
        const status = node('p');
        const exportState = node('p');
        const table = node('table'); table.append(node('caption', 'Local partition progress'));
        const head = node('thead'), header = node('tr');
        ['Shard', 'Offset', 'Records'].forEach((text) => header.append(node('th', text)));
        head.append(header);
        const rows = node('tbody'); table.append(head, rows);
        const details = node('details'); details.append(node('summary', 'Inspect regional private records'));
        const records = node('ol', undefined, 'records'); details.append(records);
        card.append(node('h3', region.region.toUpperCase()), status, exportState, table, details);
        $('regional').append(card);
        view = { status, exportState, rows, records };
        regionalCards.set(region.region, view);
      }
      const available = region.available && region.brokerAvailable && region.ready;
      view.status.textContent = available ? 'Home cluster available' : 'Home cluster unavailable or replaying';
      view.status.className = available ? 'status' : 'status offline';
      view.exportState.textContent = `Export: ${region.federation || 'unavailable'}`;
      view.rows.replaceChildren(...(region.shards || []).map((shard) => {
        const row = node('tr'); [shard.partition, shard.sourceOffset, shard.count].forEach((value) => row.append(node('td', String(value)))); return row;
      }));
      view.records.replaceChildren(...(region.records || []).slice(-8).map((record) => node('li', `${record.event.tenantId} · p${record.partition} @ ${record.offset} · ${record.event.amount} units · ${record.event.privateNote}`)));
      if (!view.records.children.length) view.records.append(node('li', region.available ? 'No records yet.' : region.error || 'Regional service unavailable.'));
    }
    $('global-status').textContent = state.global.available && state.global.brokerAvailable && state.global.ready ? 'Global consumer available. Snapshots update asynchronously.' : 'Global cluster unavailable or replaying. Displayed snapshots may be stale.';
    const summaries = state.global.summaries || [];
    $('summaries').replaceChildren(...summaries.sort((a, b) => a.region.localeCompare(b.region) || a.partition - b.partition).map((summary) => {
      const row = node('tr'); [summary.region.toUpperCase(), summary.partition, summary.sourceOffset, summary.count, summary.totalAmount].forEach((value) => row.append(node('td', String(value)))); return row;
    }));
    $('totals').textContent = `${summaries.reduce((sum, item) => sum + item.count, 0)} exported records · ${summaries.reduce((sum, item) => sum + item.totalAmount, 0)} synthetic units. No tenant IDs or private notes in this projection.`;
    $('connection').textContent = 'Operator gateway connected. Regional availability is checked independently.';
    if (operation && !submitting) {
      const result = await fetch(`/api/operations/${operation.region}/${operation.id}`, { signal: AbortSignal.timeout(5000) });
      if (result.ok) {
        const state = await result.json();
        $('result').textContent = `${state.status} · ${operation.region.toUpperCase()} · partition ${state.partition} · offset ${state.offset ?? 'not observed'} · operation ${operation.id}`;
        if (state.status === 'completed') operation = undefined;
      }
    }
  } catch (failure) { $('connection').textContent = `Gateway refresh failed: ${failure.message}. Existing values may be stale.`; }
}
$('record').addEventListener('submit', async (event) => {
  event.preventDefault();
  if (operation) { $('result').textContent = `Resolve operation ${operation.id} before another submission. Inspect its home region and logs; do not create a new ID for an uncertain write.`; return; }
  const tenant = tenants.find((item) => item.id === $('tenant').value);
  const input = { id: crypto.randomUUID(), tenantId: tenant.id, amount: Number($('amount').value), privateNote: $('note').value };
  operation = { id: input.id, region: tenant.region }; submitting = true; $('submit').disabled = true;
  $('result').textContent = `Publishing ${input.id} to ${tenant.region.toUpperCase()}…`;
  try {
    const response = await fetch('/api/events', { method: 'POST', headers: { 'content-type': 'application/json' }, body: JSON.stringify(input), signal: AbortSignal.timeout(15000) });
    const result = await response.json();
    $('result').textContent = response.ok ? `${result.status} · ${tenant.region.toUpperCase()} · partition ${result.partition} · offset ${result.offset ?? 'pending'} · operation ${input.id}` : `${result.error} · outcome ${result.outcome || 'rejected'} · operation ${input.id}`;
    if (result.status === 'completed' || result.outcome === 'not-attempted' || (response.status >= 400 && response.status < 500)) operation = undefined;
  } catch (failure) { $('result').textContent = `${failure.message}. Outcome unknown. Operation ${input.id}, home region ${tenant.region}. Inspect before retrying.`; }
  finally { submitting = false; $('submit').disabled = false; void refresh(); }
});
await refresh();
setInterval(refresh, 2500);
