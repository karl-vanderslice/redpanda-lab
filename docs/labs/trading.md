---
description: Cross a resting limit order, inspect a partial fill, and cancel the remainder through either the Rust CLI or web order desk.
---

# Amber Commodity Exchange

Amber Commodity Exchange is a fictional commodity order desk. A Rust matcher, embedded browser UI and `commodity-exchange` CLI share one Redpanda log. No account ledger, database, local journal, live price feed, cash settlement or physical delivery runs here. Nix builds the locked Rust application; host Rust is not required.

## Place and inspect an order

Use the [common prerequisites and lifecycle reference](../reference/commands.md). From the repository root:

```bash title="Start the commodity order desk"
./labs/run trading up
./labs/run trading urls
```

Choose one version of the same experiment below. It assumes an empty WHEAT book and unused example IDs. With existing orders, inspect the book first; another resting order can legitimately change the fills. A separate experiment needs fresh IDs, not a reset that deletes useful history.

=== "Browser"

    Open the app URL and wait for the exchange to become ready.

    1. In **Limit order**, choose **Wheat · metric tonne**, **Sell**, price **24500** ticks, quantity **10** and ID `demo-ask`. Select **Submit limit order**. The sell rests under **Asks / sell**.
    2. Select **New ID**. Choose **Buy**, price **24600**, quantity **4** and ID `demo-buy`. Submit it. **Trade history** shows four units executed at the resting seller's **24500** ticks, not the buyer's higher limit.
    3. In **Orders & remaining quantity**, find `demo-ask`: six of its ten units remain. Select its **Cancel** action. The remainder leaves executable liquidity, while the original order and fill stay in history.

=== "CLI"

    The CLI runs inside the app container, using the same engine as the browser.

    ```bash title="Cross an order, inspect the partial fill, and cancel the rest"
    ./labs/run trading exec app commodity-exchange order --id demo-ask --commodity WHEAT --side sell --price-ticks 24500 --quantity 10
    ./labs/run trading exec app commodity-exchange order --id demo-buy --commodity WHEAT --side buy --price-ticks 24600 --quantity 4
    ./labs/run trading exec app commodity-exchange status demo-buy
    ./labs/run trading exec app commodity-exchange order-status demo-ask
    ./labs/run trading exec app commodity-exchange trades
    ./labs/run trading exec app commodity-exchange cancel --id demo-cancel --order-id demo-ask
    ```

    The buy fills four units at 24500 ticks. The sell has six remaining until cancellation; the retained order history still records its original quantity and remainder.

An accepted command can leave an order open, partial or filled. Acceptance is not a promise of execution. **New ID** starts a distinct operation, not a retry; the same ID belongs only to its identical original command.

Orders are anonymous and cancellation has no ownership check. **Pause view updates** stops polling, not matching or explicit refresh. The interface retains focused controls and supports system-first theme selection with optional local storage.

## Matching and units

One tick is USD 0.01 per commodity unit. Prices are integer ticks from 1 through 1,000,000,000; quantities are whole units from 1 through 1,000,000. The matcher compares ticks and subtracts quantities. It does not calculate account balances or invoice totals.

| Symbol | Quantity unit | Illustrative reference |
| --- | --- | --- |
| `WHEAT` | Metric tonne | 24500 ticks, USD 245.00 per tonne |
| `COPPER` | Metric tonne | 850000 ticks, USD 8500.00 per tonne |
| `COFFEE` | 60 kg bag | 21000 ticks, USD 210.00 per bag |

These are teaching inputs, not market prices, contract grades or deliverable specifications. No orders are seeded. Only limit orders and cancellation exist. Buys match asks at or below their limit; sells match bids at or above it. Priority is best price, then earliest partition offset at that price. Execution uses the resting maker's price. An incoming order can fill several makers and rest its remainder. Symbols never cross-match. Self-trades are allowed. Filled or cancelled orders cannot be cancelled again.

## Log, receipts and replay

The blocking Rust worker uses `ureq` and Redpanda's [HTTP Proxy API](https://docs.redpanda.com/streaming/current/develop/http-proxy/), not KafkaJS. It stages a deterministic outcome, appends one `schema: 1` execution record containing the command and complete ordered event vector to partition 0 of `trading.exchange.v1`, then reads through the acknowledged offset. Accepted-order events precede fills. Rejection and cancellation share this atomic record boundary. Admission and append acknowledgment alone do not change visible state.

The consumer recomputes each new execution before applying it. Conflicting command IDs, unsupported schemas, nondeterministic new outcomes and offset gaps stop readiness. A duplicate with the same command returns the original operation without another fill; replay's duplicate branch compares the command, not a second event vector. An accepted order's priority comes from its consumed offset. The provisional `sequence` in the stored proposal is not compared, so a foreign exact duplicate that lands before the next append does not stop replay. Trade IDs derive from the incoming operation ID and fill index. Original operation offsets and order priority survive replay.

Startup appends a harmless barrier and reads the contiguous prefix from offset zero through the barrier's acknowledged offset before `/health` becomes ready. It does not infer completion from an empty poll. App restart adds a barrier, not republished historical commands:

```bash
./labs/run trading restart app
./labs/run trading exec app commodity-exchange order-status demo-ask
```

This one-partition RF1 log uses the [full-prefix policy](../reference/tuning.md#topic-policy). Orders, operations and trades grow without bounds in memory. A prefix gap fails closed rather than inventing liquidity or forgetting IDs; volume loss loses the market. Do not compact, repartition or rewrite the topic. The matcher reads through the HTTP Proxy's JSON format, so any manual record needs a JSON key and value, such as `rpk topic produce --key '"ORDER-ID"' --compression none`. A raw non-JSON key cannot be decoded and stops replay. `./labs/run trading down` followed by `up` deletes its history and starts a fresh market.

## API and failure reference

IDs accept 1–96 ASCII letters, digits, dots, underscores or hyphens, except `.` and `..`, which URL normalization would remove from lookup paths.

| Route | Result |
| --- | --- |
| `GET /health` | `{ready,error,next_offset}`; 200 ready, otherwise 503 |
| `GET /api/state` | Readiness, contracts, complete orders, operations and trades |
| `GET /api/orders/ID` | Original quantity, remainder, ticks, sequence and lifecycle; 404 absent |
| `GET /api/operations/ID` | Original accepted/rejected receipt and offset, or pending/unresolved status |
| `GET /api/trades` | Complete trade history |
| `POST /api/commands` | Order or cancellation; consumer-applied receipt |
| `GET /metrics` | Readiness, next offset, operations, rejections, trades and executable open orders |

```json
{"id":"sample-order","action":"order","commodity":"WHEAT","side":"buy","price_ticks":24500,"quantity":10}
```

```json
{"id":"sample-cancel","action":"cancel","order_id":"sample-order"}
```

Invalid domain action, symbol, side, price or quantity produces a durable `rejected` receipt with HTTP 200. Malformed JSON, unknown fields and invalid IDs fail with 400 before publication; bodies over 16 KiB fail with 413. Wrong media type or cross-origin browser mutation fails with 403. Identical retries return the retained accepted or rejected receipt; a changed command under that ID returns 409.

A 20-second reply deadline returns 202 `pending` while work can still finish. Poll the original ID. Publish or consume failure returns 503 `outcome_unknown`, disables trading and retains inspectable reconstructed results. Restore broker availability, restart the app, inspect the original operation, then retry only the identical payload if appropriate. A 404 `not_observed` while unready does not prove non-publication. Startup failures leave health at 503 with a diagnostic; there is no automatic domain retry. Queue admission failure reports `not_submitted`; unavailable readiness and the separate HTTP-concurrency limit have their own 503 responses.

The CLI emits JSON: exit 0 for a successful lookup or accepted command, 1 for usage/transport/HTTP client errors, 2 for a durable rejection including lookup, and 3 for pending/server-unavailable/unknown outcome. `commodity-exchange help` lists its options. Assets are embedded under a same-origin CSP with no remote scripts or credentials. A browser Origin must equal `http://` plus the Host header and name a loopback host (`127.0.0.1`, `localhost` or `[::1]`). Origin checks are not authentication or a trusted-local-writer boundary.

## Workload tuning

| Actual control | Default or code-owned limit |
| --- | --- |
| `REDPANDA_PROXY_URL` | `http://redpanda:8082`; server target |
| `EXCHANGE_URL` | `http://127.0.0.1:3000`; CLI target inside the app |
| Writer queue / concurrent HTTP requests | 64 / 96 |
| Proxy request / replay-through deadline | 10 seconds / 45 seconds |
| Proxy read | `timeout=1000` milliseconds, `max_bytes=1048576` bytes |
| HTTP reply / CLI request deadline | 20 seconds / 25 seconds |
| Request body / app temporary filesystem | 16 KiB / 16 MiB |

Only the two URL settings are application environment controls. Queue, deadlines and fetch bounds are source constants, not undocumented environment knobs. Minimal `ureq` has TLS disabled, so both URLs require HTTP. The app runs as UID/GID 10001 with read-only root, dropped capabilities and no-new-privileges.

The matcher scans and sorts eligible resting orders for every command, and returns history in full. Measure queue wait, pending replies, replay duration and projection serialization separately before changing source limits. Commodity sharding needs fenced owners and explicit cross-instrument rules; adding partitions or replicas of the matcher is not a performance setting. Broker-offset FIFO must not become wall-clock priority. Shared CPU, memory pressure and growing broker disk affect this experiment; see [broker and Linux tuning](../reference/tuning.md).

## Proposed production blueprint

[Production blueprint](../blueprints/trading.md).

Only the matcher, local entry points and replayed in-memory views run in the lab. The proposed entry/authentication service and fenced ownership coordinator control who can submit and which matcher is authoritative; a separate risk/account ledger owns credit, balances and settlement eligibility. Clearing or delivery adapters and reconciliation own external effects, which a broker receipt cannot confirm.

Production also needs encrypted authenticated transport, replicated logs in independent failure domains, replay-tested snapshots/checkpoints, schema migration, audit retention, self-trade policy, precision/overflow review, rate/risk limits and circuit breakers. Regional recovery must fence the old matcher and restore order/fill/cancel identities, offsets and account authority consistently, then reconcile any replication-loss window before reopening. See [production and disaster recovery](../explanation/production.md). This lab is not a trading recommendation, latency benchmark or exactly-once settlement claim.

## Checks and attribution

`bash labs/trading/e2e.sh` uses an already-running lab, cancels existing open WHEAT orders and requires no concurrent traders. It covers both price/time directions, multi-maker and partial fills, cancellation, rejection, stable IDs, metrics and exact replay. `just test trading` deletes existing history and runs a fresh disposable workflow. `just check trading` covers Cargo formatting, warning-denied Clippy, ShellCheck, browser JavaScript syntax, Nix evaluation and strict docs.

`Cargo.toml` pins direct dependencies and `Cargo.lock` pins transitive versions/checksums. `tiny_http`, `ureq`, `serde`, `serde_json`, `parking_lot`, Redpanda and Console retain their upstream licensing. No third-party UI assets, market data, logos or fonts are copied. The HTTP Proxy reference describes Redpanda 26.2 / v26.2.4; its rolling URL can change.
