# Trading lab: Amber Commodity Exchange

A simulated limit-order exchange: Rust matching engine, browser ticket and container CLI. Redpanda is its only persistent state. No database, local journal, live feed or financial execution is involved. The image includes `commodity-exchange`; host Rust is unnecessary.

## Start and place an order

Use the [common environment and lifecycle commands](../reference/commands.md).

```bash
./labs/run trading up
./labs/run trading urls
./labs/run trading exec app commodity-exchange help
./labs/run trading exec app commodity-exchange order --id demo-ask --commodity WHEAT --side sell --price-ticks 24500 --quantity 10
./labs/run trading exec app commodity-exchange order --id demo-buy --commodity WHEAT --side buy --price-ticks 24600 --quantity 4
./labs/run trading exec app commodity-exchange status demo-buy
./labs/run trading exec app commodity-exchange order-status demo-ask
./labs/run trading exec app commodity-exchange trades
./labs/run trading exec app commodity-exchange cancel --id demo-cancel --order-id demo-ask
./labs/run trading exec app commodity-exchange book
```

The buy fills four units at the resting sell's **24500** ticks, leaving six units and a `partial` sell. Cancellation removes that remainder from the executable book but preserves original quantity and remainder in history. `demo-buy` is an **accepted command** with a **filled order**. Exact retries return the original result; changed quantity under the same ID conflicts. Use fresh IDs for another run.

The browser uses the same API. **New ID** deliberately starts a distinct operation, not an automatic post-submit replacement. Retain the ID after an uncertain response. Orders are anonymous and shared; cancellation has no ownership restriction. **Pause live updates** stops polling, not Refresh. Updates preserve focused controls and do not announce the entire book. Theme follows the OS, persists when storage permits, and works without storage.

`EXCHANGE_URL` defaults to `http://127.0.0.1:3000` inside the app. IDs allow 1–96 ASCII letters, digits, dots, underscores or hyphens. CLI output is JSON; exit codes are `0` successful lookup/accepted command, `1` usage/transport/HTTP client error, `2` durable rejection (including lookup), `3` pending/server-unavailable/unknown outcome.

## Contracts and units

Prices are integer USD-cent ticks **per unit**, bounded to 1–1,000,000,000; quantities are 1–1,000,000 whole units. Matching compares ticks and subtracts quantities; it computes no cash balances or invoice totals. Dollar formatting is outside the engine.

| Symbol | Quantity unit | Illustrative reference |
| --- | --- | --- |
| WHEAT | Metric tonne | 24500 ticks / USD 245.00 |
| COPPER | Metric tonne | 850000 ticks / USD 8500.00 |
| COFFEE | 60 kg bag | 21000 ticks / USD 210.00 |

These are arbitrary teaching inputs, not real prices, contract specifications or deliverable grades. The UI shows the last simulated trade or a labelled reference; no orders are seeded.

Only limit orders and cancellation exist. Buys cross asks at or below their limit; sells cross bids at or above it. Priority is **best price, then earliest partition offset**; execution uses the resting maker's price. Equal-price FIFO follows broker serialization, not clocks. An incoming order can fill multiple makers and rest its remainder. Filled/cancelled orders cannot be cancelled again. Symbols never cross-match. Self-trades are allowed; there is no participant, account or risk model.

## The log is the transaction boundary

```text
CLI / browser → POST /api/commands (stable ID)
 → serialized worker stages deterministic outcome
 → HTTP Proxy appends command + ordered events in one record
 → partition-0 consumer validates outcome and applies events
 → operation result, book and trade history
```

`trading.exchange.v1`: one partition, RF1, 24-hour delete retention, no compaction; created by the runner. The worker uses the real [HTTP Proxy API](https://docs.redpanda.com/current/develop/http-proxy), explicitly partition zero. Values use `schema: 1`; an `execution` envelope holds command ID and complete ordered event vector. Accepted-order events precede fills; rejection/cancellation have no hidden matching effects. One atomic record avoids a two-topic dual write. Neither queue admission nor append acknowledgment changes visible state: the consumer must validate and apply it.

Exact ID retries return original accepted/rejected outcomes; changed payloads return 409. Trade IDs derive from incoming operation ID and fill index; original offsets survive replay. The reducer ignores identical duplicate operations but rejects conflicting IDs, unsupported schemas and nondeterministic outcomes, stopping readiness.

### Restart and retention

Startup appends a harmless `barrier`, reads from zero through its acknowledged offset, then enables `/health`. This defines replay completion without an offset-query API or empty-poll guess. Historical events are applied, never republished. App-only restart retains broker data and adds only a barrier:

```bash
./labs/run trading restart app
./labs/run trading exec app commodity-exchange order-status demo-ask
```

Orders, operations and trades are reconstructed in memory; `/tmp` holds no state file. Broker-volume loss loses the market. Replay requires contiguous history beginning at zero. An expired prefix produces a log-gap error and refuses trading: tail-only replay would lose liquidity, cancel targets and IDs. Reset only this disposable lab through the runner's volume-reset workflow. Do not compact, repartition or manually modify its topic.

### Failure semantics

- Invalid domain price/quantity/side/symbol/action is durably `rejected`. Malformed JSON, unknown fields, oversized bodies and invalid IDs fail HTTP validation before publication.
- After the 20-second response deadline, queued commands can return 202 `pending` and still finish. Poll `/api/operations/ID`; keep that ID.
- Publish/consume failure returns 503 `outcome_unknown`, stops readiness and makes the engine read-only until restart. A timeout cannot prove publication failed. Restore broker availability, restart, inspect the original ID, then retry only the identical payload if appropriate.
- `not_observed` while unready is not proof of non-publication. Already reconstructed results remain inspectable.
- Startup connection/replay failure leaves `/health` at 503 with a diagnostic; fix availability and restart. There are no automatic domain retries.
- Queue capacity is 64; HTTP concurrency is 96. Admission failure says `not_submitted`. Mutations have a 16 KiB limit and browser Origin checks; CLI omits Origin. This is not authentication or protection against trusted local broker writers.

## Public API

| Route | Contract |
| --- | --- |
| `GET /health` | `{ready,error,next_offset}`; 200 ready, otherwise 503 |
| `GET /api/state` | Complete orders, operations, trades, contracts and readiness |
| `GET /api/orders/ID` | Quantity, remainder, limit ticks, sequence, lifecycle; 404 absent |
| `GET /api/operations/ID` | Accepted/rejected command and offset, pending/not-observed, or unknown/not-submitted after failure |
| `GET /api/trades` | Complete trade history |
| `POST /api/commands` | Order/cancel; result after consumer application |
| `GET /metrics` | Prometheus readiness, next offset, operations, rejections, trades, executable open orders |

```json
{"id":"sample-order","action":"order","commodity":"WHEAT","side":"buy","price_ticks":24500,"quantity":10}
```

```json
{"id":"sample-cancel","action":"cancel","order_id":"sample-order"}
```

UI assets are embedded with same-origin CSP; no CDN, external scripts or provider credentials.

## End-to-end scenario and developer tooling

`bash labs/trading/e2e.sh` uses an already-running lab and its actual URL. It exercises both-side price/time priority, multiple/partial fills, cancellation, rejection, duplicate/conflicting IDs, metrics and exact restart reconstruction. Repeating a filled operation must not add a fill. **`just test trading` deletes existing lab history**, runs a fresh workflow and disposes it.

`just check trading` covers Cargo formatting, warning-denied Clippy, ShellCheck, browser JS syntax, package evaluation and strict docs. Root Nix supplies tools; `Cargo.toml` pins direct dependencies, `Cargo.lock` pins transitive versions/checksums, and `default.nix` builds with that lock. Outputs stay outside the checkout. The container uses UID/GID 10001, read-only root, dropped capabilities and disposable `/tmp`.

## Design decisions and production boundary

`tiny_http`, `ureq`, `serde`/`serde_json` and `parking_lot` support one blocking writer and CLI without async runtime, native Kafka/JNI client or frontend build. Stateless HTTP Proxy reads support deterministic replay; production high-throughput consumers need leader epochs, offset-range handling and managed lifecycle. [FIFO price/time](https://www.cmegroup.com/education/articles-and-reports/overview-what-makes-ags-markets-work) is not every venue's allocation algorithm.

**Do not scale the engine.** One partition orders one replica; there is no leader election/fencing. Validation may detect competing outcomes, not prevent competing authorities. Commodity sharding needs a fenced owner per shard and explicit cross-instrument semantics; adding partitions breaks ordering.

Minimal `ureq` excludes TLS: `EXCHANGE_URL` and `REDPANDA_PROXY_URL` require HTTP. Loopback/plain internal transport is not suitable for exposure. Production needs authenticated encrypted transport, authorization, replicated logs, retained/snapshotted state and checkpoints, schema migration, regulated audit retention, participant identity, balances/margin, self-trade policy, precision/overflow-reviewed settlement, rate/risk limits, circuit breakers and reconciliation. None is simulated here. Eligible orders are scanned/sorted per command; history is unbounded and returned in full. This is not a latency benchmark, trading recommendation or exactly-once settlement claim.

Regional recovery must fence the old matcher and restore orders, fill/cancel identities, offsets and balance/settlement authority consistently. Reconcile async replication's acknowledged-record loss window before reopening. A host restart is not regional recovery; see [production and disaster recovery](../explanation/production.md).

Dependencies and Redpanda/Console retain upstream licensing. No third-party UI assets, market data, logos or fonts are copied.
