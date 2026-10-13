import { readFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';

const bytes = await readFile(new URL('./candles.json', import.meta.url));
const fixture = JSON.parse(bytes);
export const fixtureSha256 = createHash('sha256').update(bytes).digest('hex');
export const source = { name: fixture.source, url: fixture.url, retrievedOn: fixture.retrievedOn, fixtureSha256 };
export const strategy = { fast: 3, slow: 8, allocationBps: 2500, feeBps: 10, initialCashCents: 1000000, intervalMs: 2000 };
export const quotes = fixture.candles.filter(row => row[0] >= fixture.start && row[0] < fixture.endExclusive)
  .sort((a, b) => a[0] - b[0]).map(row => ({ at: new Date((row[0] + fixture.granularitySeconds) * 1000).toISOString(), priceCents: Math.round(row[4] * 100) }));
if (quotes.length < strategy.slow || quotes.some((q, i) => !Number.isSafeInteger(q.priceCents) || q.priceCents <= 0 || (i > 0 && q.at <= quotes[i - 1].at))) throw new Error('Invalid historical quote fixture');

const sum = (end, count) => quotes.slice(end - count + 1, end + 1).reduce((total, quote) => total + BigInt(quote.priceCents), 0n);
export function averages(index) {
  const fast = index >= strategy.fast - 1 ? sum(index, strategy.fast) : null;
  const slow = index >= strategy.slow - 1 ? sum(index, strategy.slow) : null;
  return { fastCents: fast === null ? null : Number(fast) / strategy.fast, slowCents: slow === null ? null : Number(slow) / strategy.slow,
    signal: slow === null ? 'warmup' : fast * BigInt(strategy.slow) > slow * BigInt(strategy.fast) ? 'long' : 'flat' };
}
export function initial() {
  return { index: -1, playing: false, automatic: true, cashCents: strategy.initialCashCents, quantitySats: 0, costCents: 0, realizedCents: 0, feesCents: 0, signal: 'warmup' };
}
const ceil = (a, b) => (a + b - 1n) / b;
const sats = 100000000n;
export function account(model) {
  const markCents = model.index < 0 ? 0 : Number(BigInt(model.quantitySats) * BigInt(quotes[model.index].priceCents) / sats);
  return { cashCents: model.cashCents, quantitySats: model.quantitySats, costCents: model.costCents, realizedCents: model.realizedCents,
    unrealizedCents: markCents - model.costCents, feesCents: model.feesCents, equityCents: model.cashCents + markCents };
}

// Decisions use the previous observed close. Automatic fills use the next close.
// This is a paper execution model, not a liquidity or order-book simulation.
export function transition(current, kind) {
  const model = { ...current };
  let reason = null; let quote = null; let trade = null;
  if (kind === 'play') {
    if (model.index === quotes.length - 1) reason = 'The historical feed has ended. Dispose of this lab to start a new account.';
    else model.playing = true;
  } else if (kind === 'pause') model.playing = false;
  else if (kind === 'auto-on') model.automatic = true;
  else if (kind === 'auto-off') model.automatic = false;
  let side = kind === 'buy' || kind === 'sell' ? kind : null;
  if (kind === 'step') {
    if (model.index === quotes.length - 1) reason = 'The historical feed has ended.';
    else {
      model.index += 1;
      quote = quotes[model.index];
      if (model.automatic && current.signal === 'long' && current.quantitySats === 0) side = 'buy';
      if (model.automatic && current.signal === 'flat' && current.quantitySats > 0) side = 'sell';
      model.signal = averages(model.index).signal;
      if (model.index === quotes.length - 1) model.playing = false;
    }
  } else if (side) {
    if (model.automatic) reason = 'Disable automatic trading before placing a manual paper trade.';
    else if (model.index < 0) reason = 'Consume a quote before trading.';
    else if (side === 'buy' && model.quantitySats > 0) reason = 'A position is already open.';
    else if (side === 'sell' && model.quantitySats === 0) reason = 'There is no position to sell.';
  }
  if (side && !reason) {
    const price = BigInt(quotes[model.index].priceCents);
    let quantity; let notional; let fee;
    if (side === 'buy') {
      const budget = BigInt(model.cashCents) * BigInt(strategy.allocationBps) / 10000n;
      const netBudget = budget * 10000n / (10000n + BigInt(strategy.feeBps));
      quantity = netBudget * sats / price;
      if (quantity === 0n) reason = 'Cash is insufficient for one satoshi and its fee.';
      else {
        notional = ceil(quantity * price, sats);
        fee = ceil(notional * BigInt(strategy.feeBps), 10000n);
        model.cashCents -= Number(notional + fee);
        model.quantitySats = Number(quantity);
        model.costCents = Number(notional + fee);
      }
    } else {
      quantity = BigInt(model.quantitySats);
      notional = quantity * price / sats;
      fee = ceil(notional * BigInt(strategy.feeBps), 10000n);
      const proceeds = Number(notional - fee);
      model.cashCents += proceeds;
      model.realizedCents += proceeds - model.costCents;
      model.quantitySats = 0; model.costCents = 0;
    }
    if (!reason) {
      model.feesCents += Number(fee);
      trade = { side, quantitySats: Number(quantity), priceCents: Number(price), notionalCents: Number(notional), feeCents: Number(fee), marketAt: quotes[model.index].at };
    }
  }
  // An exhausted automatic account still consumes quotes rather than losing feed progress.
  if (reason && kind !== 'step') return { accepted: false, reason, model: current, quote: null, trade: null };
  if (model.cashCents < 0 || model.quantitySats < 0 || model.costCents < 0 || model.cashCents + model.costCents !== strategy.initialCashCents + model.realizedCents) throw new Error('Paper accounting invariant failed');
  return { accepted: reason === null, reason, model, quote, trade };
}
