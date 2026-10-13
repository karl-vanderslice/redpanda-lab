# Trading lab: Amber Commodity Exchange

A simulated limit-order exchange with a Rust matching engine, a browser ticket and a real container CLI. Redpanda is the only persistent source of exchange state. There is no database, local journal, mock broker, live price feed or financial execution. The app image includes both the server and `commodity-exchange` CLI; host Rust is unnecessary.

## Start and place an order

From the repository root:

```bash
./labs/run trading up
./labs/run trading urls
./labs/run trading exec app commodity-exchange help
```

Open the reported app URL. The amber ticket and book use system fonts, original assets, compact flat panels and explicit textual statuses. Select Wheat, enter a buy or sell, limit ticks, units and a stable operation ID, then submit. **New ID** starts a distinct operation; it is deliberately not generated automatically after submission, so an uncertain response cannot accidentally become a second order. The operation lookup exposes rejection, acceptance and pending results. Every order belongs to this shared anonymous simulation: cancellation has no ownership restriction. The theme starts from the OS preference, persists when browser storage allows, and remains functional without storage. **Pause live updates** stops book polling; Refresh remains available. Live updates do not announce the entire book to screen readers or replace a focused cancellation/market control.

The CLI returns JSON. A simple observable walkthrough:

```bash
./labs/run trading exec app commodity-exchange order --id demo-ask --commodity WHEAT --side sell --price-ticks 24500 --quantity 10
./labs/run trading exec app commodity-exchange order --id demo-buy --commodity WHEAT --side buy --price-ticks 24600 --quantity 4
./labs/run trading exec app commodity-exchange status demo-buy
./labs/run trading exec app commodity-exchange order-status demo-ask
./labs/run trading exec app commodity-exchange trades
./labs/run trading exec app commodity-exchange cancel --id demo-cancel --order-id demo-ask
./labs/run trading exec app commodity-exchange book
```

The resting sell receives a four-unit fill at **24500**, not 24600; six units remain and its lifecycle becomes `partial`. Cancellation removes those six units from the executable book while retaining the original quantity and unexecuted remainder in history. `demo-buy` is an **accepted command** with a **filled order**: these are different states. Repeating the exact original `demo-buy` command returns its existing result; changing its quantity under that ID returns a conflict. Use fresh IDs for another walkthrough.

Inside the app container, `EXCHANGE_URL` defaults to `http://127.0.0.1:3000`; override it to use the CLI against another reachable exchange. IDs must be 1–96 ASCII letters, digits, dots, underscores or hyphens. CLI exit codes: `0` successful lookup/accepted command, `1` usage/transport/HTTP client error, `2` durably rejected domain operation, `3` pending or server-unavailable/unknown outcome. A rejection lookup also exits `2`.

## Contracts and units

All prices are integer USD-cent ticks **per unit**, never floating-point matching values. Price bounds are 1–1,000,000,000 ticks; quantity bounds are 1–1,000,000 whole units. Arithmetic only compares ticks and subtracts unit quantities; the simulation does not calculate cash balances or invoice totals. Display formatting converts ticks to dollars, outside the matching engine.

| Symbol | One quantity unit | Illustrative reference | Meaning |
| --- | --- | --- | --- |
| WHEAT | One metric tonne | 24500 ticks / USD 245.00 | Simulation reference only |
| COPPER | One metric tonne | 850000 ticks / USD 8500.00 | Simulation reference only |
| COFFEE | One 60 kg bag | 21000 ticks / USD 210.00 | Simulation reference only |

These are arbitrary teaching inputs, **not claims about real commodity prices**, contract specifications, deliverable grades or current exchanges. The UI shows the last simulated trade when one exists, otherwise the clearly labelled illustrative reference. No orders are seeded behind your back.

Only limit orders and cancellation are implemented. A buy crosses asks at or below its limit; a sell crosses bids at or above its limit. The engine chooses **best price, then earliest partition offset**, executing at the resting maker's price. Equal-price orders therefore have FIFO time priority according to broker serialization, not wall clocks. An incoming order can fill multiple makers, partially fill a maker, fill completely or rest its remaining quantity. Cancelled and filled orders cannot be cancelled again. All commodities match only their own symbol. Self-trades are allowed because this anonymous lab has no participants or risk/account model.

## The log is the transaction boundary

```text
CLI / browser
    → POST /api/commands (stable operation ID)
    → one serialized Rust engine worker stages a deterministic outcome
    → HTTP Proxy POST /topics/trading.exchange.v1
    → one broker record: command + accepted/rejected/trade/cancelled events
    → HTTP Proxy GET /topics/trading.exchange.v1/partitions/0/records
    → validate deterministic outcome, apply in offset order
    → expose accepted/rejected operation, book and trade history
```

The topic `trading.exchange.v1` has exactly **one partition**, replication factor **one**, delete retention **24 hours**, and no compaction. The runner creates it before the app starts. The worker explicitly publishes to partition zero using Redpanda's real [HTTP Proxy API](https://docs.redpanda.com/current/develop/http-proxy). JSON values have a versioned `schema: 1`; an `execution` envelope contains the stable command ID and its complete ordered event vector. Accepted order events precede their fills; cancellation and rejection events have no hidden matching effects. Commands and outcome events share **one atomic broker record** instead of a non-atomic two-topic dual write. The bounded in-process channel is only HTTP-to-worker coordination: dequeuing does not change exchange state. Nothing enters the visible book or trade history until the acknowledged broker record is actually consumed and validated.

An operation ID is an idempotency key. Exact retries return the original accepted or rejected outcome. Conflicting payloads return HTTP 409. Trade IDs derive from the incoming operation ID and fill index; original operation offsets remain stable during replay. The reducer ignores an already-applied identical operation, and rejects conflicting IDs in the log. Every envelope is checked against the deterministic matching reducer before applying its events; unsupported schemas or invalid outcomes stop readiness instead of silently corrupting a book.

### Restart and retention

On startup, the app appends a harmless `barrier` record to the same partition, starts reading at offset zero and consumes through the acknowledged barrier offset. That barrier defines a concrete pre-start replay boundary without inventing an offset-query API or guessing whether an empty poll means replay completed. `/health` becomes ready only after this reconstruction finishes. Historical executions apply their stored events; replay never republishes commands, trades or notifications. An app-only restart preserves broker volume state and adds only a new barrier:

```bash
./labs/run trading restart app
./labs/run trading exec app commodity-exchange order-status demo-ask
./labs/run trading exec app commodity-exchange trades
```

Memory contains reconstructed orders, operations and trade history; no state file is written in `/tmp`. Losing or resetting the broker volume loses the market. The reducer requires a contiguous partition history beginning at offset zero. If 24-hour retention has removed the beginning, it refuses to trade and reports a log-gap error. This is intentional: replaying only the tail would lose resting liquidity, cancel targets and idempotency keys. Reset the **disposable lab** through the runner's supported volume-reset workflow rather than attempting to repair a truncated production ledger. Do not enable compaction, change the partition count or manually modify this topic.

### Failure semantics

* A valid transport request with an invalid price/quantity/side/symbol/action is durably `rejected`. Malformed JSON, unknown fields, oversized requests and invalid IDs are HTTP errors and never enter the broker.
* A queued command can return HTTP 202 `pending` after the 20-second response deadline. It may still finish. Poll `/api/operations/ID`, retaining that ID; never blindly create a replacement operation.
* Publish or consume failures return HTTP 503 `outcome_unknown`, stop readiness and leave the engine read-only until restart. A network timeout cannot establish whether the broker accepted a record. Restart reconstructs the log, after which the original ID can be inspected and, if appropriate, retried with the **identical payload**.
* `not_observed` is not proof of non-publication when readiness is false. A deduplicated result already reconstructed may still be inspected while readiness is false.
* Startup cannot connect or replay: `/health` remains 503 with the diagnostic. Fix broker availability and restart the app; startup does not hide the failure through automatic domain retries.
* The worker queue admits 64 jobs and HTTP concurrency is capped at 96. An admission failure explicitly says `not_submitted`. Mutation requests have a 16 KiB body limit and browser Origin checks; CLI requests omit Origin. This is not authentication or protection against a trusted local broker writer.

## Public API

| Method / path | Contract |
| --- | --- |
| `GET /health` | `{ready,error,next_offset}`; 200 only when ready, otherwise 503 |
| `GET /api/state` | Complete reconstructed orders, operations, trades, contract definitions and readiness |
| `GET /api/orders/ID` | Order quantity, remaining quantity, limit ticks, sequence and lifecycle; 404 if absent |
| `GET /api/operations/ID` | Accepted/rejected command and offset, pending/not-observed, or explicit unknown/not-submitted outcome after engine failure |
| `GET /api/trades` | Complete simulated trade history |
| `POST /api/commands` | JSON limit order or cancellation; accepted/rejected result after consumer application |
| `GET /metrics` | Prometheus text metrics: readiness, next offset, operations, rejections, trades and executable open orders |

Order body: `{"id":"sample-order","action":"order","commodity":"WHEAT","side":"buy","price_ticks":24500,"quantity":10}`. Cancellation body: `{"id":"sample-cancel","action":"cancel","order_id":"sample-order"}`. Browser and CLI use these same endpoints and processing path. The UI is served entirely from embedded app-image assets with a same-origin Content Security Policy; no CDN, provider credentials or external scripts are needed.

## End-to-end scenario and developer tooling

After `up`:

```bash
bash labs/trading/e2e.sh
```

The scenario obtains its URL from the scoped runner. Mutations use the image's real CLI or HTTP contract. It exercises buy- and sell-side price/time priority, multiple and partial fills, cancellation, recorded rejection, identical and conflicting ID retries, metrics and exact restart reconstruction. A repeated filled operation must not create another fill. `just test trading` first deletes the selected lab's existing history, then runs this workflow in a fresh simulation and disposes it. Do not run it against an account you want to retain.

The root Nix lock supplies Rust, Cargo, image tooling and dependency fetchers. `Cargo.toml` pins direct versions; checked-in `Cargo.lock` pins transitive versions and checksums. `default.nix` builds the application and image with that lock. The container runs as UID/GID 10001 on a read-only filesystem with dropped capabilities; `/tmp` is disposable.

Run `just check trading` for Cargo formatting, Clippy with warnings denied, Bash ShellCheck, browser JavaScript syntax and package evaluation, followed by a strict documentation build. Run `just test trading` for the CLI/HTTP workflow, matching, idempotency and broker replay against the built container. Neither command needs a host Rust installation; outputs stay outside the checkout.

## Design decisions and production boundary

Rust with `tiny_http`, `ureq`, `serde`/`serde_json` and `parking_lot` keeps the blocking single-writer engine and CLI in one small deployable binary; no async runtime, JNI/native Kafka client or separate frontend build is needed. HTTP Proxy is a real Redpanda client boundary, not a simulated queue. Its documented stateless partition reads are useful for deterministic replay; Kafka-native clients would be preferable for a production high-throughput consumer with leader epochs, explicit offset-range handling and managed consumer lifecycle. The lab uses [FIFO price/time semantics](https://www.cmegroup.com/education/articles-and-reports/overview-what-makes-ags-markets-work), not the many product-specific pro-rata or allocation algorithms real venues employ.

One partition supplies total order for **one engine replica**. The compose service must not be scaled: there is no leader election or writer fencing. Two independently staging engines can make incompatible decisions; deterministic outcome validation may detect this, but that is not a distributed exchange implementation. Sharding by commodity could preserve per-instrument priority, but would require one fenced authority per shard and explicit choices for cross-instrument orders; simply adding partitions breaks the ordering invariant.

Transport is plain HTTP on the isolated container network and loopback-bound app port. The minimal `ureq` build intentionally excludes TLS; `EXCHANGE_URL` and `REDPANDA_PROXY_URL` therefore use HTTP. This is unsuitable for exposed networks: production deployment needs authenticated encrypted client/broker transport as well as application authorization.

The single broker/RF1 and short retention are teaching constraints, not durability guarantees. A production exchange would require retained/snapshotted authoritative state with offset checkpoints and compatible schema migrations, fenced leadership, replicated fault-tolerant logs, regulated audit retention, participant identity, authorization, balances/margin, self-trade rules, precision and overflow-reviewed settlement, order-rate limits, risk checks, circuit breakers, reconciliation and external settlement. These are deliberately absent rather than represented by fake integrations. The current book scans/sorts eligible orders per command; histories are unbounded in memory and the state API returns full history. It is a compact lab, not a latency benchmark, production market, trading recommendation or claim of exactly-once external settlement. The observed guarantee is deterministic, operation-deduplicated state reconstruction within the retained single-partition log.

For regional recovery, fence the old matcher before activating a standby per book. Restore accepted orders, fill and cancellation identities, replay offsets and any balance/settlement authority as one consistent recovery boundary. Async replication can omit acknowledged source records, so reconcile that loss window before opening the book. A same-host restart is not a regional recovery test. See [production and disaster recovery](../explanation/production.md) for licensing, replication, RPO/RTO and restore-drill requirements.

Rust dependencies retain their upstream licenses in package metadata. Redpanda/Console images retain upstream licensing. No reference images, logos, fonts, market data or third-party UI assets are copied into the interface.
