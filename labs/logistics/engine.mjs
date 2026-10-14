import { isDeepStrictEqual } from 'node:util';

export const fixture = [
  { id: 'driver-1', name: 'Alex', position: { x: 2, y: 2 }, tripId: null },
  { id: 'driver-2', name: 'Blair', position: { x: 8, y: 2 }, tripId: null },
  { id: 'driver-3', name: 'Casey', position: { x: 5, y: 8 }, tripId: null },
];
export const fixtureId = 'synthetic-grid-v1';
export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, outcomeUnknown: false, ...details });
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
function point(value) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).sort().join(',') !== 'x,y' ||
      !['x', 'y'].every(key => Number.isFinite(value[key]) && value[key] >= 0 && value[key] <= 20)) {
    throw fail(400, 'Positions require numeric x and y between 0 and 20 km.');
  }
  return { x: value.x, y: value.y };
}
export function validate(value, internal = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !identifier(value.id)) throw fail(400, 'Use a 1–80 character mutation id (letters, digits, underscore or hyphen).');
  if (value.id === fixtureId && !internal) throw fail(400, 'This id is reserved for the fixture.');
  let command;
  switch (value.kind) {
    case 'fleet':
      if (!internal || value.id !== fixtureId) throw fail(400, 'Unsupported command.');
      command = { id: value.id, kind: value.kind }; break;
    case 'location':
      if (!identifier(value.driverId)) throw fail(400, 'A driverId is required.');
      command = { id: value.id, kind: value.kind, driverId: value.driverId, position: point(value.position) }; break;
    case 'request':
      if (!identifier(value.tripId)) throw fail(400, 'A tripId is required.');
      command = { id: value.id, kind: value.kind, tripId: value.tripId, pickup: point(value.pickup), destination: point(value.destination) }; break;
    case 'pickup': case 'complete': case 'cancel':
      if (!identifier(value.tripId)) throw fail(400, 'A tripId is required.');
      command = { id: value.id, kind: value.kind, tripId: value.tripId }; break;
    default: throw fail(400, 'Supported kinds: location, request, pickup, complete, cancel.');
  }
  // Reject ignored fields rather than silently assigning one id to different input.
  if (!internal && !isDeepStrictEqual(value, command)) throw fail(400, 'Unexpected command fields.');
  return command;
}
export const initial = () => ({ drivers: new Map(), trips: new Map() });
const at = (a, b) => a.x === b.x && a.y === b.y;
const denied = reason => ({ accepted: false, reason, effect: null });
export function decide(model, command) {
  if (command.kind === 'fleet') {
    if (model.drivers.size || model.trips.size) return denied('Fleet is already initialized.');
    return { accepted: true, reason: null, effect: { type: 'fleet', fixtureId, drivers: fixture } };
  }
  if (command.kind === 'location') {
    if (!model.drivers.has(command.driverId)) return denied('Unknown driver.');
    return { accepted: true, reason: null, effect: { type: 'location', driverId: command.driverId, position: command.position } };
  }
  if (command.kind === 'request') {
    if (model.trips.has(command.tripId)) return denied('Trip id already exists.');
    const distance = driver => (driver.position.x - command.pickup.x) ** 2 + (driver.position.y - command.pickup.y) ** 2;
    const candidates = [...model.drivers.values()].filter(driver => driver.tripId === null).sort((a, b) => distance(a) - distance(b) || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
    if (!candidates.length) return denied('No available drivers.');
    return { accepted: true, reason: null, effect: { type: 'assigned', tripId: command.tripId, driverId: candidates[0].id, pickup: command.pickup, destination: command.destination } };
  }
  const trip = model.trips.get(command.tripId);
  if (!trip) return denied('Unknown trip.');
  const driver = model.drivers.get(trip.driverId);
  if (command.kind === 'cancel') {
    if (trip.status !== 'assigned') return denied('Only an assigned trip can be cancelled before pickup.');
    return { accepted: true, reason: null, effect: { type: 'cancelled', tripId: trip.id } };
  }
  if (command.kind === 'pickup') {
    if (trip.status !== 'assigned') return denied('Pickup requires an assigned trip.');
    if (!at(driver.position, trip.pickup)) return denied('Update the driver location to the pickup first.');
    return { accepted: true, reason: null, effect: { type: 'picked-up', tripId: trip.id } };
  }
  if (trip.status !== 'picked-up') return denied('Completion requires a picked-up trip.');
  if (!at(driver.position, trip.destination)) return denied('Update the driver location to the destination first.');
  return { accepted: true, reason: null, effect: { type: 'completed', tripId: trip.id } };
}
export function applyResult(model, command, result, offset) {
  if (command.kind === 'request' && result.accepted === true) {
    // Assignment is authoritative event data: replay never dispatches again.
    const effect = result.effect;
    if (!effect || effect.type !== 'assigned' || effect.tripId !== command.tripId ||
        !isDeepStrictEqual(effect.pickup, command.pickup) || !isDeepStrictEqual(effect.destination, command.destination) ||
        model.trips.has(command.tripId) || model.drivers.get(effect.driverId)?.tripId !== null || result.reason !== null ||
        Object.keys(effect).sort().join(',') !== 'destination,driverId,pickup,tripId,type') throw new Error('Invalid recorded assignment');
  } else if (!isDeepStrictEqual(result, decide(model, command))) throw new Error('Recorded transition disagrees with fleet history');
  if (!result.accepted) return;
  const effect = result.effect;
  switch (effect.type) {
    case 'fleet':
      for (const driver of effect.drivers) model.drivers.set(driver.id, structuredClone(driver));
      break;
    case 'location':
      Object.assign(model.drivers.get(effect.driverId), { position: effect.position, locationOffset: offset }); break;
    case 'assigned':
      model.trips.set(effect.tripId, { id: effect.tripId, driverId: effect.driverId, pickup: effect.pickup, destination: effect.destination, status: 'assigned', assignedOffset: offset, lastOffset: offset });
      model.drivers.get(effect.driverId).tripId = effect.tripId; break;
    case 'picked-up': case 'completed': case 'cancelled': {
      const trip = model.trips.get(effect.tripId);
      trip.status = effect.type; trip.lastOffset = offset;
      if (effect.type !== 'picked-up') model.drivers.get(trip.driverId).tripId = null;
      break;
    }
    default: throw new Error('Unknown event effect');
  }
}
