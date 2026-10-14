import { isDeepStrictEqual } from 'node:util';

export const catalog = Object.freeze([
  { sku: 'coffee', name: 'Coffee', priceCents: 350 },
  { sku: 'sandwich', name: 'Sandwich', priceCents: 725 },
  { sku: 'cookie', name: 'Cookie', priceCents: 225 },
]);
export const sources = Object.freeze({
  stripe: ['pm_card_visa', 'pm_card_chargeDeclinedExpiredCard'],
  square: ['cnon:card-nonce-ok', 'cnon:card-nonce-declined'],
});
export const fail = (status, message, details = {}) => Object.assign(new Error(message), { status, ...details });
export function identifier(value) {
  if (typeof value !== 'string' || !/^[a-zA-Z0-9_-]{1,80}$/.test(value)) throw fail(400, 'IDs must contain 1–80 letters, digits, underscores or hyphens.');
  return value;
}
function fields(value, allowed) {
  if (!value || typeof value !== 'object' || Array.isArray(value) || Object.keys(value).some(key => !allowed.includes(key))) throw fail(400, 'Unexpected request fields.');
}
export function checkout(value) {
  fields(value, ['id', 'basket', 'tender', 'source']);
  const id = identifier(value.id);
  if (!['cash', 'stripe', 'square'].includes(value.tender)) throw fail(400, 'Choose cash, stripe or square tender.');
  if (!Array.isArray(value.basket) || value.basket.length < 1 || value.basket.length > catalog.length) throw fail(400, 'Choose at least one catalog item.');
  const seen = new Set();
  const basket = value.basket.map(item => {
    fields(item, ['sku', 'quantity']);
    if (!catalog.some(product => product.sku === item.sku) || seen.has(item.sku) || !Number.isInteger(item.quantity) || item.quantity < 1 || item.quantity > 20) throw fail(400, 'Use unique catalog SKUs with integer quantities from 1 to 20.');
    seen.add(item.sku);
    return { sku: item.sku, quantity: item.quantity };
  }).sort((a, b) => a.sku.localeCompare(b.sku));
  if (value.tender === 'cash' && value.source !== undefined) throw fail(400, 'Cash does not accept a payment source.');
  if (value.tender !== 'cash' && !sources[value.tender].includes(value.source)) throw fail(400, 'Use one of the displayed public sandbox test sources; never enter card details.');
  return { id, kind: 'checkout', basket, tender: value.tender, ...(value.tender !== 'cash' ? { source: value.source } : {}) };
}
export function refund(value) {
  fields(value, ['id', 'checkoutId']);
  return { id: identifier(value.id), kind: 'refund', checkoutId: identifier(value.checkoutId) };
}
export function empty(value) { fields(value, []); }
export function saleDetails(command) {
  const lines = command.basket.map(item => {
    const product = catalog.find(product => product.sku === item.sku);
    return { ...item, name: product.name, priceCents: product.priceCents, lineCents: product.priceCents * item.quantity };
  });
  return { lines, amountCents: lines.reduce((total, item) => total + item.lineCents, 0), currency: 'USD', tender: command.tender };
}
export function requestDetails(command, operations) {
  if (command.kind === 'checkout') return saleDetails(command);
  const sale = operations.get(command.checkoutId);
  if (!sale || sale.command.kind !== 'checkout') throw fail(404, 'Receipt not found.');
  if (sale.status !== 'completed') throw fail(409, 'Only completed sales can be refunded.');
  if ([...operations.values()].some(operation => operation.command.kind === 'refund' && operation.command.checkoutId === command.checkoutId)) throw fail(409, 'A full refund is already reserved for this receipt. Resume its original ID.');
  return { lines: sale.details.lines, amountCents: sale.details.amountCents, currency: 'USD', tender: sale.details.tender, paymentId: sale.providerId, scope: sale.scope };
}
export function same(a, b) { return isDeepStrictEqual(a, b); }
export function totals(operations) {
  const values = [...operations.values()];
  const completed = values.filter(operation => operation.status === 'completed');
  const sales = completed.filter(operation => operation.command.kind === 'checkout');
  const refunds = completed.filter(operation => operation.command.kind === 'refund');
  const sum = items => items.reduce((total, operation) => total + operation.details.amountCents, 0);
  const grossCents = sum(sales), refundedCents = sum(refunds);
  return { salesCount: sales.length, refundsCount: refunds.length, grossCents, refundedCents, netCents: grossCents - refundedCents,
    cashBalanceCents: sum(sales.filter(operation => operation.details.tender === 'cash')) - sum(refunds.filter(operation => operation.details.tender === 'cash')),
    unsettledCount: values.filter(operation => ['pending', 'unknown'].includes(operation.status)).length };
}
