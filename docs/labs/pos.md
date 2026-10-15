---
description: Complete a cash checkout and full refund, then learn how durable receipts differ from optional provider outcomes and settlement.
---

# Point of sale: Counterlane Market

Counterlane Market is a fictional checkout desk with a quantity basket, receipts and full refunds. Its synthetic USD catalog prices coffee at 350 cents, sandwich at 725 and cookie at 225. Cash is a local tender ledger, not a connected drawer; there is no tax, tip or inventory model. Optional Stripe test-mode and Square sandbox adapters make real HTTP requests, but their runtime behavior remains unverified without authorized credentials.

## Start with a cash receipt {#run}

Use the [shared setup and lifecycle](./index.md). From the repository root:

```bash title="Start the local till"
labs/run pos up
labs/run pos urls
```

Open the reported app URL. Cash needs no credentials and makes no provider request.

1. Leave **Coffee quantity** at **1**, Sandwich and Cookie at **0**, and **Tender** at **Cash · local ledger**. The basket total is $3.50, or 350 integer cents.
2. Keep the generated **Checkout ID** and select **Checkout** once. Wait for its `completed` receipt. Gross sales, net sales and cash ledger balance each increase by 350 cents.
3. In **Receipt ledger**, select **Full refund** for that sale. Check the checkout ID and full amount in the browser confirmation. Cancelling creates, stores and sends no refund command.
4. Confirm the refund. Once it completes, refunded cents increase by 350; net sales and cash balance return to their earlier values. The sale and refund remain in the ledger.
5. Select **New checkout ID** before preparing another sale. Submitted basket fields stay locked so an unresolved operation cannot silently become different input.

A confirmed full refund reserves that receipt amount once. Only completed operations affect totals; pending or unknown provider responses do not count as sales or refunds. Do not use a new checkout ID to escape an uncertain result: follow [original-operation recovery](#recover-the-original-operation).

!!! note "Optional providers are a separate experiment"

    Cash proves the local accounting workflow, not Stripe or Square connectivity. Read [sandbox configuration](#sandbox-configuration-and-api-provenance) before enabling either adapter. Provider runtime behavior remains unverified without authorized credentials; never enter card numbers or secret keys in the page.

## Ledger and accounting

`pos.events.v1` has one partition and replication factor 1. Schema-1 records carry `eventId`, `operationId`, `kind` and audit time `at` in Unix milliseconds, keyed by operation ID:

| Kind | Retained evidence |
| --- | --- |
| `requested` | Canonical command, server-priced lines, tender and random UUID provider key, consumed before external calls. |
| `bound` | Original verified sandbox account/location for a checkout. A refund retains its sale's scope. |
| `attempt` | Timestamp consumed before the payment/refund call; first timestamp and attempt count survive restart. |
| `observed` | Allowlisted provider ID, normalized outcome and HTTP status, not raw provider responses or secrets. |

One writer serializes requests through consumed-event completion. Replay validates commands, prices, refund reservations and state transitions, deduplicates identical event IDs and rejects conflicting records. It makes no provider calls. Only the consumer changes receipts and totals; a process-local queue is not a distributed writer fence.

`completed` and `declined` are terminal. `pending` is unfinished; `unknown` lacks sufficient evidence. A full refund can reference only a completed sale, and its reservation remains exclusive even if the refund later declines or stays unsettled. No partial refunds or replacement refund IDs are supported. `netCents = grossCents - refundedCents`; cash balance includes only completed cash sales minus completed cash refunds. Payment API completion is not bank settlement.

## HTTP API

| Route | Body or result |
| --- | --- |
| `GET /health` | `{ready}`; 503 when unavailable. |
| `GET /api/state` | Catalog, test sources, provider availability, totals, operations, fault and offsets. |
| `POST /api/checkouts` | `{id,tender,basket:[{sku,quantity}],source?}`. |
| `POST /api/refunds` | `{id,checkoutId}`. |
| `GET /api/operations/ID` | Operation and its consumed records. |
| `POST /api/operations/ID/resume` | `{}`; explicitly authorize recovery of that operation. |
| `GET /metrics` | Sale/refund counts, cents, unsettled operations and duplicates. |

IDs use 1–80 ASCII letters, digits, underscores or hyphens. A basket has one to three unique catalog SKUs, each with integer quantity 1–20; canonical lines sort by SKU. Cash forbids `source`. Extra fields, client prices and invalid baskets return 400 before publication. POST requires `application/json`, at most 16 KiB, and a same-origin HTTP Origin if supplied; curl without Origin is supported. There is no operator authentication.

Identical IDs and canonical input return retained state without repeating a provider effect. Changed input returns 409. Operation responses use 200 completed, 202 pending, 422 declined and 502 unknown; disabled providers or conflicting/refused recovery return 409. A Kafka completion fault returns 503 and blocks new writes. Missing receipts return 404 but do not prove an in-flight append failed.

## Sandbox configuration and API provenance

Export server-only values before `labs/run pos up`. Never put secrets in browser inputs, URLs or ledger records. Provider availability means configuration accepted, not connectivity verified.

| Supported environment | Default | Contract |
| --- | --- | --- |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated KafkaJS broker list. |
| `POS_SANDBOX_ENABLED` | `0` | Only `1` authorizes sandbox requests. |
| `STRIPE_TEST_SECRET_KEY` | Empty | Only `sk_test_` followed by ASCII letters/digits; live and restricted keys are rejected. |
| `SQUARE_SANDBOX_ACCESS_TOKEN` | Empty | Server-side token with no line breaks. |
| `SQUARE_SANDBOX_LOCATION_ID` | Empty | Letters, digits, underscores or hyphens; verified location must use USD. |
| `POS_SANDBOX_E2E` | Unset | Scenario-only opt-in; `1` runs external checks and also requires authorization and real credentials. |

Only these public test sources are accepted: [Stripe](https://docs.stripe.com/testing) `pm_card_visa` and `pm_card_chargeDeclinedExpiredCard`; [Square](https://developer.squareup.com/docs/devtools/sandbox/payments) `cnon:card-nonce-ok` and `cnon:card-nonce-declined`. Do not enter card details or use live funds.

Stripe requests use hardcoded `https://api.stripe.com` and `Stripe-Version: 2026-09-30.endive`. Form-encoded [PaymentIntent creation](https://docs.stripe.com/api/payment_intents/create?api-version=2026-09-30.endive) sends `amount`, `currency=usd`, `payment_method`, `allowed_payment_method_types[]=card`, `confirm=true` and operation metadata with `Idempotency-Key`. This exact Endive [breaking change](https://docs.stripe.com/changelog/endive/2026-09-30/removes-the-payment-method-types-parameter-from-payment-intents-and-setup-intents) replaced the writable `payment_method_types` parameter. [Refund creation](https://docs.stripe.com/api/refunds/create?api-version=2026-09-30.endive) sends `payment_intent`, the full amount and metadata. `GET /v1/account` establishes account scope before mutation; Stripe's mutable [account resource source](https://github.com/stripe/stripe-node/blob/master/src/resources/Accounts.ts) confirms that route but is not an Endive-version runtime test.

Square uses hardcoded `https://connect.squareupsandbox.com` and `Square-Version: 2026-09-16`, matching the [CreatePayment reference](https://developer.squareup.com/reference/square/payments-api/create-payment). Its JSON request sends `source_id`, `idempotency_key`, `amount_money`, `autocomplete=true` and `location_id`. [RefundPayment](https://developer.squareup.com/reference/square/refunds-api/refund-payment) sends `payment_id`, `idempotency_key` and the full `amount_money`; the USD merchant/location is checked via `GET /v2/locations/ID`. The refund reference is mutable and not independently version-pinned.

Provider requests refuse redirects, time out after 15 seconds and cap responses at 256 KiB. Normalization checks object identity, amount, currency and scope; authorization, rate-limit, server and malformed responses cannot establish a decline. Raw response bodies and credentials are not copied into HTTP errors, logs or Kafka.

## Recover the original operation

Keep the exact ID and input after any timeout. Inspect `GET /api/operations/ID`. If Kafka completion is unknown, restart with `labs/run pos restart app` and wait for replay readiness before recovery. Graceful close waits for outstanding KafkaJS sends; forced termination can still leave a provider outcome unknown.

Duplicate POST is a lookup, not a recovery authorization. Use `POST /api/operations/ID/resume` with `{}`. Resume verifies the original account/location; changed scope refuses recovery. Known provider objects use GET only at `/v1/payment_intents/ID`, `/v1/refunds/ID`, `/v2/payments/ID` or `/v2/refunds/ID`, documented by the [Stripe PaymentIntent](https://docs.stripe.com/api/payment_intents/retrieve?api-version=2026-09-30.endive), [Stripe refund](https://docs.stripe.com/api/refunds/retrieve?api-version=2026-09-30.endive), [Square payment](https://developer.squareup.com/reference/square/payments-api/get-payment) and [Square refund](https://developer.squareup.com/reference/square/refunds-api/get-payment-refund) references. Both Square retrieval references display version `2026-09-16`.

Without a provider object ID, another create may use only the original immutable parameters and key, and only when less than 23 hours have elapsed since the durable first attempt. This is a local refusal gate, not a shared provider retention promise: [Stripe v1 keys may be pruned after at least 24 hours](https://docs.stripe.com/api/idempotent_requests), while the [Square guidance](https://developer.squareup.com/docs/build-basics/common-api-patterns/idempotency) establishes no matching numerical window. Older unknown operations require manual sandbox-dashboard reconciliation, never a replacement ID. Attempts also refuse wall-clock time earlier than the request or first attempt; restore reliable time before resuming. There are no webhooks, automatic reconciliation or 3-D Secure challenges.

## Workload tuning and disposal

Catalog, USD, provider pins, retry gate, timeouts and response limits are code-owned. The append and projection deadlines are each 30 seconds. Measure durable-request, provider-call and consumed-outcome phases separately. Concurrent effect owners would break payment ordering and refund exclusivity; see [shared client limits](../reference/tuning.md#client-knobs-belong-to-their-client).

Startup uses a fresh full-prefix replay group and rejects missing history or extra partitions. The [topic policy](../reference/tuning.md#topic-policy) retains the effect ledger until disposal; receipt/event maps also grow without bounds. Do not compact the ledger or add app replicas.

`just test pos` recreates owned data and exercises cash accounting, ID/refund races, real broker duplicates, exact restart replay and explicit recovery. External checks run only with `POS_SANDBOX_E2E=1` and authorized credentials; they allow refunds to remain explicitly pending. Resolve unknown provider operations before `labs/run pos down`: disposal removes local recovery keys, not provider sandbox objects.

## Proposed production architecture

[Production blueprint](../blueprints/pos.md).

Production would need authenticated merchant/operator scopes, secret delivery and a fenced effect owner with durable payment-attempt evidence. Verified webhook deduplication, provider reconciliation and explicit manual resolution would append observations to the ledger; a receipt read store would remain a projection, not payment authority. Those services and applicable payment/security/legal reviews are absent here, and neither broker acknowledgments nor API success establish financial settlement.
