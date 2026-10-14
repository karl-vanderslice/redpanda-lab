export const policy = Object.freeze({ version: 'northbridge-risk-1', holdAtCents: 100000, rejectAboveCents: 500000, velocityWindowMs: 60000, holdAtCount: 4 });
export const fixtures = Object.freeze([
  { id: 'operating', label: 'Operating account', balanceCents: 1000000, watch: 'none' },
  { id: 'treasury', label: 'Treasury account', balanceCents: 1000000, watch: 'none' },
  { id: 'reserve', label: 'Small reserve', balanceCents: 10000, watch: 'none' },
  { id: 'review', label: 'Fixture review counterparty', balanceCents: 100000, watch: 'review' },
  { id: 'blocked', label: 'Fixture blocked counterparty', balanceCents: 100000, watch: 'block' },
]);
export function fail(status, message, details = {}) { return Object.assign(new Error(message), { status, ...details }); }
export function identifier(value) {
  if (typeof value !== 'string' || !/^[A-Za-z0-9_-]{1,80}$/.test(value) || value === 'fixture-v1') throw fail(400, 'Use a 1–80 character ID containing letters, digits, underscore or hyphen.');
  return value;
}
export function timestamp(value) {
  if (!Number.isSafeInteger(value) || value < 0 || value > 8640000000000000) throw fail(400, 'decisionAt must be an integer epoch millisecond in the JavaScript date range.');
  return value;
}
export const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
function fields(body, keys) {
  if (!body || typeof body !== 'object' || Array.isArray(body) || Object.keys(body).some(key => !keys.includes(key)) || keys.some(key => !Object.hasOwn(body, key))) throw fail(400, `Expected exactly: ${keys.join(', ')}.`);
}
export function command(kind, body) {
  const keys = kind === 'transfer' ? ['id', 'from', 'to', 'amountCents', 'decisionAt'] : kind === 'review' ? ['id', 'transferId', 'decision', 'reviewer', 'note', 'decisionAt'] : kind === 'clear' ? ['id', 'transferId', 'decisionAt'] : null;
  if (!keys) throw fail(400, 'Unknown command kind.');
  fields(body, keys);
  const value = { kind, id: identifier(body.id), decisionAt: timestamp(body.decisionAt) };
  if (kind === 'transfer') {
    value.from = identifier(body.from); value.to = identifier(body.to);
    if (value.from === value.to) throw fail(400, 'Choose different debit and credit accounts.');
    if (!Number.isSafeInteger(body.amountCents) || body.amountCents < 1 || body.amountCents > 1000000000) throw fail(400, 'amountCents must be an integer from 1 to 1000000000.');
    value.amountCents = body.amountCents;
  } else {
    value.transferId = identifier(body.transferId);
    if (kind === 'review') {
      if (!['approve', 'reject'].includes(body.decision)) throw fail(400, 'decision must be approve or reject.');
      value.decision = body.decision; value.reviewer = identifier(body.reviewer);
      if (typeof body.note !== 'string' || body.note.trim().length < 1 || body.note.length > 240) throw fail(400, 'Supply a review note of 1–240 characters.');
      value.note = body.note.trim();
    }
  }
  return value;
}
export function emptyState() { return { initialized: false, policy: null, accounts: new Map(), transfers: new Map(), operations: new Map(), entries: [], lastDecisionAt: 0 }; }
export function initialize(state, record) {
  if (state.initialized || !same(record, { schema: 1, kind: 'fixtures', id: 'fixture-v1', policy, accounts: fixtures })) throw new Error('Invalid clearing fixture/policy record.');
  state.policy = record.policy;
  for (const account of record.accounts) state.accounts.set(account.id, { ...account, reservedCents: 0 });
  state.initialized = true;
}
export function evaluate(state, cmd) {
  if (!state.initialized) throw fail(503, 'Fixtures are not consumed.');
  if (cmd.decisionAt < state.lastDecisionAt) throw fail(409, 'decisionAt precedes the last recorded decision. Use a current fixture clock before publishing.');
  if (cmd.kind === 'transfer') {
    const from = state.accounts.get(cmd.from), to = state.accounts.get(cmd.to);
    if (!from || !to) throw fail(404, 'Unknown fixture account.');
    const recentCount = [...state.transfers.values()].filter(t => t.from === cmd.from && t.screenedAt > cmd.decisionAt - state.policy.velocityWindowMs && t.screenedAt <= cmd.decisionAt).length + 1;
    const reasons = [];
    if (from.watch === 'block' || to.watch === 'block') reasons.push('fixture-watchlist-block');
    if (cmd.amountCents > state.policy.rejectAboveCents) reasons.push('amount-reject');
    if (cmd.amountCents > from.balanceCents - from.reservedCents) reasons.push('insufficient-funds');
    let status = reasons.length ? 'rejected' : 'approved';
    if (!reasons.length) {
      if (from.watch === 'review' || to.watch === 'review') reasons.push('fixture-watchlist-review');
      if (cmd.amountCents >= state.policy.holdAtCents) reasons.push('amount-review');
      if (recentCount >= state.policy.holdAtCount) reasons.push('velocity-review');
      if (reasons.length) status = 'held';
      else reasons.push('screening-passed');
    }
    return { httpStatus: status === 'rejected' ? 422 : 200, status, reasons, riskPolicyVersion: state.policy.version, recentCount, reservedCents: status === 'rejected' ? 0 : cmd.amountCents };
  }
  const transfer = state.transfers.get(cmd.transferId);
  if (!transfer) return { httpStatus: 404, status: 'denied', reason: 'transfer-not-found' };
  if (cmd.kind === 'review') {
    if (transfer.status !== 'held') return { httpStatus: 409, status: 'denied', reason: 'transfer-not-held' };
    return { httpStatus: 200, status: cmd.decision === 'approve' ? 'approved' : 'rejected', reason: `manual-${cmd.decision}`, releasedCents: cmd.decision === 'reject' ? transfer.amountCents : 0 };
  }
  if (transfer.status !== 'approved') return { httpStatus: 409, status: 'denied', reason: transfer.status === 'cleared' ? 'already-cleared' : 'transfer-not-approved' };
  return { httpStatus: 200, status: 'cleared', clearingId: cmd.id, transferId: transfer.id,
    entries: [{ accountId: transfer.from, deltaCents: -transfer.amountCents }, { accountId: transfer.to, deltaCents: transfer.amountCents }] };
}
export function consume(state, record, metadata) {
  if (record.schema !== 1 || record.kind !== 'execution' || metadata.key !== record.command?.id) throw new Error('Invalid clearing execution envelope.');
  const { kind, ...body } = record.command;
  const cmd = command(kind, body);
  if (!same(cmd, record.command)) throw new Error('Noncanonical clearing command.');
  const prior = state.operations.get(cmd.id);
  if (prior) {
    if (!same(prior.record, record)) throw new Error('Conflicting clearing identity in log.');
    return false;
  }
  const outcome = evaluate(state, cmd);
  if (!same(outcome, record.outcome)) throw new Error('Clearing outcome does not match deterministic replay.');
  if (kind === 'transfer') {
    state.transfers.set(cmd.id, { id: cmd.id, from: cmd.from, to: cmd.to, amountCents: cmd.amountCents, screenedAt: cmd.decisionAt,
      status: outcome.status, screening: outcome, review: null, clearingId: null });
    state.accounts.get(cmd.from).reservedCents += outcome.reservedCents;
  } else if (outcome.status !== 'denied') {
    const transfer = state.transfers.get(cmd.transferId);
    transfer.status = outcome.status;
    if (kind === 'review') {
      transfer.review = { id: cmd.id, decision: cmd.decision, reviewer: cmd.reviewer, note: cmd.note, decisionAt: cmd.decisionAt };
      state.accounts.get(transfer.from).reservedCents -= outcome.releasedCents;
    } else {
      transfer.clearingId = cmd.id;
      state.accounts.get(transfer.from).reservedCents -= transfer.amountCents;
      for (const entry of outcome.entries) {
        state.accounts.get(entry.accountId).balanceCents += entry.deltaCents;
        state.entries.push({ clearingId: cmd.id, transferId: transfer.id, decisionAt: cmd.decisionAt, ...entry });
      }
    }
  }
  state.lastDecisionAt = cmd.decisionAt;
  state.operations.set(cmd.id, { command: cmd, outcome, offset: metadata.offset, record });
  return true;
}
export function view(state) {
  const accounts = [...state.accounts.values()].map(a => ({ ...a, availableCents: a.balanceCents - a.reservedCents }));
  return { initialized: state.initialized, policy: state.policy, fixtureBalances: fixtures, lastDecisionAt: state.lastDecisionAt, accounts,
    totals: { balanceCents: accounts.reduce((sum, a) => sum + a.balanceCents, 0), reservedCents: accounts.reduce((sum, a) => sum + a.reservedCents, 0),
      entryNetCents: state.entries.reduce((sum, e) => sum + e.deltaCents, 0), clearedCount: [...state.transfers.values()].filter(t => t.status === 'cleared').length },
    transfers: [...state.transfers.values()], entries: state.entries, operations: [...state.operations.values()] };
}
