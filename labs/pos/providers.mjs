import { fail } from './model.mjs';

export const versions = Object.freeze({ stripe: '2026-09-30.endive', square: '2026-09-16' });
const stripeKey = process.env.STRIPE_TEST_SECRET_KEY || '';
const squareToken = process.env.SQUARE_SANDBOX_ACCESS_TOKEN || '';
const squareLocation = process.env.SQUARE_SANDBOX_LOCATION_ID || '';
const enabled = process.env.POS_SANDBOX_ENABLED === '1';
const stripeValid = /^sk_test_[A-Za-z0-9]+$/.test(stripeKey);
const squareValid = /^[A-Za-z0-9_-]+$/.test(squareLocation) && squareToken.length > 0 && !/[\r\n]/.test(squareToken);
export function configuration() {
  return {
    cash: { available: true, mode: 'local ledger' },
    stripe: { available: enabled && stripeValid, mode: 'test only', version: versions.stripe,
      reason: stripeKey && !stripeValid ? 'Rejected key: only sk_test_ secret keys are accepted. Live and restricted keys are prohibited.' : !enabled ? 'Set POS_SANDBOX_ENABLED=1 to authorize sandbox requests.' : !stripeKey ? 'STRIPE_TEST_SECRET_KEY is missing.' : null },
    square: { available: enabled && squareValid, mode: 'sandbox only', version: versions.square,
      reason: !enabled ? 'Set POS_SANDBOX_ENABLED=1 to authorize sandbox requests.' : !squareValid ? 'Set SQUARE_SANDBOX_ACCESS_TOKEN and SQUARE_SANDBOX_LOCATION_ID.' : null },
  };
}
export function requireProvider(tender) {
  if (!configuration()[tender]?.available) throw fail(409, 'This sandbox provider is disabled. Cash works without credentials.');
}
// Origins and versions are constants: callers cannot select a live Square host,
// forward credentials across redirects, or use an account-default API version.
async function request(provider, path, method = 'GET', body, key) {
  requireProvider(provider);
  const headers = provider === 'stripe'
    ? { authorization: `Bearer ${stripeKey}`, 'Stripe-Version': versions.stripe }
    : { authorization: `Bearer ${squareToken}`, 'Square-Version': versions.square };
  if (body !== undefined) headers['content-type'] = provider === 'stripe' ? 'application/x-www-form-urlencoded' : 'application/json';
  if (provider === 'stripe' && key) headers['Idempotency-Key'] = key;
  const origin = provider === 'stripe' ? 'https://api.stripe.com' : 'https://connect.squareupsandbox.com';
  try {
    const response = await fetch(origin + path, { method, headers, redirect: 'error', signal: AbortSignal.timeout(15000),
      ...(body !== undefined ? { body: provider === 'stripe' ? new URLSearchParams(body).toString() : JSON.stringify(body) } : {}) });
    const chunks = []; let bytes = 0;
    for await (const chunk of response.body) {
      bytes += chunk.length;
      if (bytes > 262144) throw new Error('Provider response too large');
      chunks.push(chunk);
    }
    const data = JSON.parse(Buffer.concat(chunks).toString());
    return { code: response.status, data };
  } catch {
    // Never copy raw upstream errors, bodies, client secrets or credential headers
    // into the HTTP response, Kafka records, or application logs.
    return { code: 0, data: null };
  }
}
export async function providerScope(tender) {
  requireProvider(tender);
  if (tender === 'stripe') {
    const { code, data } = await request('stripe', '/v1/account');
    if (code !== 200 || !/^acct_[A-Za-z0-9]+$/.test(data?.id)) throw fail(502, 'Stripe test account could not be verified. This attempt sent no new payment mutation.');
    return data.id;
  }
  const { code, data } = await request('square', `/v2/locations/${encodeURIComponent(squareLocation)}`);
  const location = data?.location;
  if (code !== 200 || location?.id !== squareLocation || location?.currency !== 'USD' || typeof location?.merchant_id !== 'string' || !/^[A-Za-z0-9_-]+$/.test(location.merchant_id)) throw fail(502, 'Square USD sandbox location could not be verified. This attempt sent no new payment mutation.');
  return `${location.merchant_id}:${squareLocation}`;
}
function unknown(code, reason = 'provider-response-unknown', providerId = null) { return { status: 'unknown', reason, providerId, httpStatus: 502, providerHttpStatus: code }; }
function observed(status, providerId, code) { return { status, reason: status === 'declined' ? 'provider-declined' : status === 'pending' ? 'provider-pending' : 'provider-completed', providerId, httpStatus: status === 'completed' ? 200 : status === 'declined' ? 422 : 202, providerHttpStatus: code }; }
function normalizeStripe(operation, response) {
  const { code, data } = response;
  const isSale = operation.command.kind === 'checkout';
  const object = isSale ? (data?.object === 'payment_intent' ? data : data?.error?.payment_intent) : data;
  const valid = object && (isSale ? object.object === 'payment_intent' && /^pi_[A-Za-z0-9]+$/.test(object.id) && object.livemode === false : object.object === 'refund' && /^re_[A-Za-z0-9]+$/.test(object.id) && object.payment_intent === operation.details.paymentId)
    && object.amount === operation.details.amountCents && object.currency === 'usd'
    && (!operation.providerId || object.id === operation.providerId);
  if (!valid) return unknown(code, 'provider-response-unknown', operation.providerId);
  const providerId = object.id;
  // A server/auth/rate-limit failure cannot establish a debit or a decline.
  if (!(code >= 200 && code < 300) && code !== 402) return unknown(code, 'provider-response-unknown', providerId);
  if (isSale) {
    if (object.status === 'succeeded' && object.amount_received === operation.details.amountCents) return observed('completed', providerId, code);
    if (['requires_payment_method', 'canceled'].includes(object.status)) return observed('declined', providerId, code);
    if (['processing', 'requires_action', 'requires_confirmation', 'requires_capture'].includes(object.status)) return observed('pending', providerId, code);
  } else {
    if (object.status === 'succeeded') return observed('completed', providerId, code);
    if (['failed', 'canceled'].includes(object.status)) return observed('declined', providerId, code);
    if (['pending', 'requires_action'].includes(object.status)) return observed('pending', providerId, code);
  }
  return unknown(code, 'provider-response-unknown', providerId);
}
function normalizeSquare(operation, response) {
  const { code, data } = response;
  const isSale = operation.command.kind === 'checkout';
  const object = isSale ? data?.payment : data?.refund;
  const paymentMethodDecline = code >= 400 && code < 500 && data?.errors?.some(error => error.category === 'PAYMENT_METHOD_ERROR' && ['CARD_DECLINED', 'GENERIC_DECLINE', 'EXPIRED_CARD', 'CVV_FAILURE'].includes(error.code));
  if (!object) {
    const declined = !operation.providerId && paymentMethodDecline;
    return declined ? observed('declined', null, code) : unknown(code, 'provider-response-unknown', operation.providerId);
  }
  const valid = /^[A-Za-z0-9_-]{1,192}$/.test(object.id || '') && object.amount_money?.amount === operation.details.amountCents && object.amount_money?.currency === 'USD'
    && (isSale ? object.location_id === operation.scope.split(':')[1] : object.payment_id === operation.details.paymentId)
    && (!operation.providerId || object.id === operation.providerId);
  if (!valid) return unknown(code, 'provider-response-unknown', operation.providerId);
  if (isSale && object.status === 'FAILED' && paymentMethodDecline) return observed('declined', object.id, code);
  if (code < 200 || code >= 300) return unknown(code, 'provider-response-unknown', object.id);
  if (object.status === 'COMPLETED') return observed('completed', object.id, code);
  if (['FAILED', 'CANCELED', 'REJECTED'].includes(object.status)) return observed('declined', object.id, code);
  if (['APPROVED', 'PENDING'].includes(object.status)) return observed('pending', object.id, code);
  return unknown(code, 'provider-response-unknown', object.id);
}
export async function invoke(operation) {
  const provider = operation.details.tender;
  const isSale = operation.command.kind === 'checkout';
  let response;
  if (provider === 'stripe') {
    const path = isSale ? '/v1/payment_intents' : '/v1/refunds';
    if (operation.providerId) response = await request(provider, `${path}/${encodeURIComponent(operation.providerId)}`);
    else response = await request(provider, path, 'POST', isSale
      ? { amount: operation.details.amountCents, currency: 'usd', payment_method: operation.command.source, 'allowed_payment_method_types[]': 'card', confirm: 'true', 'metadata[pos_operation]': operation.command.id }
      : { payment_intent: operation.details.paymentId, amount: operation.details.amountCents, 'metadata[pos_operation]': operation.command.id }, operation.providerKey);
    return normalizeStripe(operation, response);
  }
  const path = isSale ? '/v2/payments' : '/v2/refunds';
  if (operation.providerId) response = await request(provider, `${path}/${encodeURIComponent(operation.providerId)}`);
  else response = await request(provider, path, 'POST', isSale
    ? { source_id: operation.command.source, idempotency_key: operation.providerKey, amount_money: { amount: operation.details.amountCents, currency: 'USD' }, autocomplete: true, location_id: operation.scope.split(':')[1] }
    : { payment_id: operation.details.paymentId, idempotency_key: operation.providerKey, amount_money: { amount: operation.details.amountCents, currency: 'USD' } });
  return normalizeSquare(operation, response);
}
