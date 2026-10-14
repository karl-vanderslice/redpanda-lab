import { isDeepStrictEqual } from 'node:util';

export const topic = 'inventory.events.v1';
export const fixtureId = 'catalog-v1';
export const limit = 1_000_000_000;
// This versioned manifest is published once. The consumer owns every visible unit.
export const catalog = Object.freeze({
  locations: [{ id: 'north', name: 'North warehouse' }, { id: 'quay', name: 'Quay stockroom' }],
  products: [{ id: 'field-tote', name: 'Field tote', unit: 'unit' }, { id: 'shelf-tray', name: 'Shelf tray', unit: 'unit' }, { id: 'packing-wrap', name: 'Packing wrap', unit: 'roll' }],
  stock: [
    { locationId: 'north', productId: 'field-tote', onHand: 12, reserved: 0, available: 12 },
    { locationId: 'quay', productId: 'field-tote', onHand: 8, reserved: 0, available: 8 },
    { locationId: 'north', productId: 'shelf-tray', onHand: 18, reserved: 0, available: 18 },
    { locationId: 'quay', productId: 'shelf-tray', onHand: 10, reserved: 0, available: 10 },
    { locationId: 'north', productId: 'packing-wrap', onHand: 24, reserved: 0, available: 24 },
    { locationId: 'quay', productId: 'packing-wrap', onHand: 16, reserved: 0, available: 16 },
  ],
});
export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, outcomeUnknown: false, ...details });
const identifier = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{1,80}$/.test(value);
export function validate(value, internal = false) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || !identifier(value.id)) throw fail(400, 'Use an id of 1–80 letters, digits, underscores or hyphens.');
  if (value.id === fixtureId && !internal) throw fail(400, 'The catalog id is reserved.');
  let command;
  switch (value.kind) {
    case 'initialize':
      if (!internal || value.id !== fixtureId) throw fail(400, 'Initialization is internal.');
      command = { id: value.id, kind: value.kind }; break;
    case 'receive': case 'reserve': case 'transfer': {
      if (!identifier(value.productId) || !identifier(value.locationId)) throw fail(400, 'A productId and locationId are required.');
      if (!Number.isSafeInteger(value.units) || value.units < 1 || value.units > limit) throw fail(400, `Units must be an integer between 1 and ${limit}.`);
      command = { id: value.id, kind: value.kind, productId: value.productId, locationId: value.locationId, units: value.units };
      if (value.kind === 'reserve') {
        if (!identifier(value.reservationId)) throw fail(400, 'A reservationId is required.');
        command.reservationId = value.reservationId;
      }
      if (value.kind === 'transfer') {
        if (!identifier(value.destinationId)) throw fail(400, 'A destinationId is required.');
        command.destinationId = value.destinationId;
      }
      break;
    }
    case 'release': case 'fulfill':
      if (!identifier(value.reservationId)) throw fail(400, 'A reservationId is required.');
      command = { id: value.id, kind: value.kind, reservationId: value.reservationId }; break;
    default: throw fail(400, 'Supported kinds: receive, reserve, release, fulfill, transfer.');
  }
  if (!isDeepStrictEqual(value, command)) throw fail(400, 'Unexpected command fields.');
  return command;
}
export const initial = () => ({ catalog: null, stock: new Map(), reservations: new Map(), totals: new Map() });
const key = (locationId, productId) => `${locationId}/${productId}`;
const denied = reason => ({ accepted: false, reason, effect: null });
const cell = (previous, onHand, reserved) => ({ ...previous, onHand, reserved, available: onHand - reserved });
export function decide(model, command) {
  if (command.kind === 'initialize') {
    if (model.catalog !== null) return denied('already_initialized');
    const totals = catalog.products.map(product => {
      const onHand = catalog.stock.filter(stock => stock.productId === product.id).reduce((sum, stock) => sum + stock.onHand, 0);
      return { productId: product.id, initial: onHand, received: 0, fulfilled: 0, onHand, reserved: 0, available: onHand };
    });
    return { accepted: true, reason: null, effect: { catalog: structuredClone(catalog), stock: structuredClone(catalog.stock), reservation: null, totals } };
  }
  if (!model.catalog) return denied('not_initialized');
  let reservation = null, stock = [], total;
  if (command.kind === 'release' || command.kind === 'fulfill') {
    const previous = model.reservations.get(command.reservationId);
    if (!previous) return denied('unknown_reservation');
    if (previous.status !== 'reserved') return denied('reservation_not_active');
    const source = model.stock.get(key(previous.locationId, previous.productId));
    stock = [cell(source, source.onHand - (command.kind === 'fulfill' ? previous.units : 0), source.reserved - previous.units)];
    reservation = { ...previous, status: command.kind === 'fulfill' ? 'fulfilled' : 'released', lastCommandId: command.id };
    total = { ...model.totals.get(previous.productId) };
    total.reserved -= previous.units;
    if (command.kind === 'fulfill') { total.onHand -= previous.units; total.fulfilled += previous.units; }
    total.available = total.onHand - total.reserved;
  } else {
    const source = model.stock.get(key(command.locationId, command.productId));
    if (!model.totals.has(command.productId)) return denied('unknown_product');
    if (!source) return denied('unknown_location');
    total = { ...model.totals.get(command.productId) };
    if (command.kind === 'receive') {
      if (total.initial + total.received + command.units > limit) return denied('lifetime_stock_limit');
      stock = [cell(source, source.onHand + command.units, source.reserved)];
      total.received += command.units; total.onHand += command.units; total.available += command.units;
    } else if (command.kind === 'reserve') {
      if (model.reservations.has(command.reservationId)) return denied('reservation_id_exists');
      if (source.available < command.units) return denied('insufficient_available');
      stock = [cell(source, source.onHand, source.reserved + command.units)];
      reservation = { id: command.reservationId, productId: command.productId, locationId: command.locationId, units: command.units, status: 'reserved', createdCommandId: command.id, lastCommandId: command.id };
      total.reserved += command.units; total.available -= command.units;
    } else {
      const destination = model.stock.get(key(command.destinationId, command.productId));
      if (!destination) return denied('unknown_destination');
      if (command.destinationId === command.locationId) return denied('same_location');
      if (source.available < command.units) return denied('insufficient_available');
      stock = [cell(source, source.onHand - command.units, source.reserved), cell(destination, destination.onHand + command.units, destination.reserved)];
    }
  }
  return { accepted: true, reason: null, effect: { stock, reservation, totals: [total] } };
}
export function applyResult(model, command, result) {
  if (!isDeepStrictEqual(result, decide(model, command))) throw new Error('Recorded inventory outcome disagrees with preceding history');
  if (!result.accepted) return;
  const effect = result.effect;
  if (command.kind === 'initialize') model.catalog = structuredClone(effect.catalog);
  for (const stock of effect.stock) model.stock.set(key(stock.locationId, stock.productId), structuredClone(stock));
  if (effect.reservation) model.reservations.set(effect.reservation.id, structuredClone(effect.reservation));
  for (const total of effect.totals) model.totals.set(total.productId, structuredClone(total));
}
