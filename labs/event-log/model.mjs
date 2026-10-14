import { isDeepStrictEqual } from 'node:util';

export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, outcomeUnknown: false, ...details });
const identifier = value => typeof value === 'string' && /^[A-Za-z0-9_-]{1,80}$/.test(value);
const text = (value, limit) => typeof value === 'string' && value.length > 0 && value.length <= limit && value.trim() === value && !/[\u0000-\u001f\u007f]/.test(value);
export function validate(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !identifier(value.id) || !identifier(value.itemId)) {
    throw fail(400, 'Command id and itemId require 1–80 letters, digits, underscores or hyphens.');
  }
  let command;
  if (value.kind === 'create') {
    if (!text(value.title, 160)) throw fail(400, 'Use a trimmed title of 1–160 characters without control characters.');
    command = { id: value.id, kind: value.kind, itemId: value.itemId, title: value.title };
  } else if (['assign', 'close', 'reopen'].includes(value.kind)) {
    if (!Number.isSafeInteger(value.expectedRevision) || value.expectedRevision < 1 || value.expectedRevision >= Number.MAX_SAFE_INTEGER) {
      throw fail(400, 'expectedRevision must be a positive safe integer below the maximum safe integer.');
    }
    command = { id: value.id, kind: value.kind, itemId: value.itemId, expectedRevision: value.expectedRevision };
    if (value.kind === 'assign') {
      if (!text(value.assignee, 80)) throw fail(400, 'Use a trimmed assignee of 1–80 characters without control characters.');
      command.assignee = value.assignee;
    } else {
      if (!text(value.note, 240)) throw fail(400, 'Use a trimmed audit note of 1–240 characters without control characters.');
      command.note = value.note;
    }
  } else throw fail(400, 'Supported kinds: create, assign, close, reopen.');
  if (!isDeepStrictEqual(command, value)) throw fail(400, 'Unexpected command fields.');
  return command;
}
export const initial = () => ({ items: new Map() });
const denied = (code, before) => ({ accepted: false, code, before: before ?? null, after: null });
export function decide(model, command) {
  const before = model.items.get(command.itemId) ?? null;
  if (command.kind === 'create') {
    if (before) return denied('item-exists', before);
    return { accepted: true, code: 'created', before: null, after: {
      id: command.itemId, title: command.title, status: 'open', assignee: null,
      revision: 1, lastCommandId: command.id, note: null,
    } };
  }
  if (!before) return denied('item-missing', null);
  if (before.revision !== command.expectedRevision) return denied('revision-conflict', before);
  if (command.kind === 'assign') {
    if (before.status !== 'open') return denied('assignment-requires-open', before);
    if (before.assignee === command.assignee) return denied('already-assigned', before);
  }
  if (command.kind === 'close') {
    if (before.status !== 'open') return denied('close-requires-open', before);
    if (before.assignee === null) return denied('close-requires-assignee', before);
  }
  if (command.kind === 'reopen' && before.status !== 'closed') return denied('reopen-requires-closed', before);
  const after = { ...before, revision: before.revision + 1, lastCommandId: command.id };
  if (command.kind === 'assign') after.assignee = command.assignee;
  else { after.status = command.kind === 'close' ? 'closed' : 'open'; after.note = command.note; }
  return { accepted: true, code: { assign: 'assigned', close: 'closed', reopen: 'reopened' }[command.kind], before, after };
}
export function applyResult(model, command, result) {
  if (!isDeepStrictEqual(result, decide(model, command))) throw new Error('Execution record disagrees with the ordered item history');
  if (result.accepted) model.items.set(command.itemId, structuredClone(result.after));
}
