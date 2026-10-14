# Point of sale

A quantity basket, receipts and full refunds. Synthetic USD catalog: coffee 350 cents, sandwich 725, cookie 225. No tax, tips or inventory. Cash is a local tender ledger, not a connected drawer.

```sh
labs/run pos up
labs/run pos urls
```

Open the app URL: set quantities → **Cash** → **Checkout** → **Full refund**. The refund restores net sales and cash balance. **New checkout ID** starts another basket; **Pause updates** stops polling.

## Ledger

`pos.events.v1`: one partition, schema 1, keyed by `operationId`. Records carry `eventId`, `operationId`, `kind`, `at`:

- `requested`: immutable command, priced lines, tender and random UUID provider key; committed before any external API call.
- `bound`: original sandbox account/location, verified before the first payment attempt.
- `attempt`: durable first-attempt timestamp, before any payment/refund HTTP call.
- `observed`: allowlisted provider object ID, status and HTTP status; never raw responses or secrets.

Redpanda owns receipts and recovery. **One writer** serializes mutations through consumed-event completion, not producer ACK. Replay deduplicates event IDs and validates prices/refund reservations. No scaling, arbitrary broker writes or snapshot fallback; expired history prevents startup.
Shutdown stops admission and drains admitted work. A forced kill can still leave a provider outcome unknown.

`pending` is unfinished; `unknown` lacks evidence; only `completed` changes totals. `declined` is terminal. Full refunds reserve a receipt once, even when unsettled or declined. No partial refunds or replacement refund IDs.

## API

All POSTs require same-origin `application/json`; curl without an Origin header is supported.

| Route | Body / response |
| --- | --- |
| `GET /health` | `{ready}` |
| `GET /api/state` | Catalog, provider availability, totals, operations, last offset |
| `POST /api/checkouts` | `{id,tender,basket:[{sku,quantity}],source?}` |
| `POST /api/refunds` | `{id,checkoutId}` |
| `GET /api/operations/:id` | Operation and consumed records |
| `POST /api/operations/:id/resume` | `{}`; explicit recovery |
| `GET /metrics` | Receipt counts, cents and unsettled operations |

IDs: 1–80 letters/digits/`_`/`-`; unique SKUs, quantity 1–20. Prices are server-owned. Identical IDs return recorded state without another provider call; conflicts return 409. Status: 200 completed, 202 pending, 422 declined, 400 invalid, 409 conflict/disabled, 5xx infrastructure.

## Sandboxes

Export server-only variables before `labs/run pos up`. Credentials never belong in browser inputs, URLs or ledger records:

- `POS_SANDBOX_ENABLED=1`: explicit authorization for external sandbox requests.
- `STRIPE_TEST_SECRET_KEY`: only `sk_test_` keys; all other prefixes, including live keys, are rejected.
- `SQUARE_SANDBOX_ACCESS_TOKEN` and `SQUARE_SANDBOX_LOCATION_ID`: a USD sandbox seller/location.

Missing credentials disable adapters. “Available” means configured, not connectivity-tested. Only public [Stripe test sources](https://docs.stripe.com/testing) (`pm_card_visa`, `pm_card_chargeDeclinedExpiredCard`) and [Square sandbox sources](https://developer.squareup.com/docs/devtools/sandbox/payments) (`cnon:card-nonce-ok`, `cnon:card-nonce-declined`) are accepted. No card fields or live funds.

Stripe: `https://api.stripe.com`, [2026-09-30.endive](https://docs.stripe.com/api/versioning), `Idempotency-Key`. Form-encoded [PaymentIntent](https://docs.stripe.com/api/payment_intents/create): `amount`, `currency=usd`, `payment_method`, [`allowed_payment_method_types[]=card`](https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents), `confirm=true`. [Refund](https://docs.stripe.com/api/refunds/create): `payment_intent`, full `amount`. [Current-account retrieval](https://github.com/stripe/stripe-node/blob/master/src/resources/Accounts.ts) binds recovery to the original account.

Square: hardcoded `https://connect.squareupsandbox.com`, `Square-Version: 2026-09-16`. JSON [CreatePayment](https://developer.squareup.com/reference/square/payments-api/create-payment): `source_id`, `idempotency_key`, `amount_money`, `autocomplete=true`, `location_id`. [RefundPayment](https://developer.squareup.com/reference/square/refunds-api/refund-payment): `payment_id`, `idempotency_key`, full `amount_money`.

## Recovery

A timeout never means rollback. Keep the ID. Unknown Kafka append completion stops new writes; restart the app to replay before recovery. Replay makes **no external calls**. Resume verifies the original account/location, then retrieves a known [Stripe PaymentIntent](https://docs.stripe.com/api/payment_intents/retrieve), [Stripe refund](https://docs.stripe.com/api/refunds/retrieve), [Square payment](https://developer.squareup.com/reference/square/payments-api/get-payment) or [Square refund](https://developer.squareup.com/reference/square/refunds-api/get-payment-refund).

Without an object ID, resume repeats immutable parameters/key only within 23 hours of the durable first attempt. This is a local limit, not a shared provider guarantee. [Stripe keys may expire after 24 hours](https://docs.stripe.com/api/idempotent_requests); [Square](https://developer.squareup.com/docs/working-with-apis/idempotency) requires unchanged requests but does not establish the same retention window here. Older unknown operations refuse creates: investigate manually in the sandbox dashboard. Reliable wall clock and unchanged API/currency configuration are required. No webhooks, background reconciliation or 3-D Secure challenges.
Backward clocks refuse attempts before append. Restore time before resuming the original ID.

## Checks and disposal

`labs/pos/e2e.sh` writes real receipts/broker records and restarts the app; it checks cash invariants, concurrent IDs/refunds and replay. External checks require real credentials and explicit `POS_SANDBOX_E2E=1`, `POS_SANDBOX_ENABLED=1`. They assert payment completion/decline; refunds may remain pending. Sandbox runtime is unverified without these checks.

Resolve unknown provider operations before `labs/run pos down`: disposal destroys the local ledger and recovery keys, not the providers’ sandbox objects. Shared lifecycle details are in the [lab index](index.md).
