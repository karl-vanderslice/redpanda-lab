# Beacon Ridge Research

Beacon Ridge Research is a fictional paper-strategy desk. One Node/KafkaJS owner replays an offline BTC/USD candle fixture, records commands and complete outcomes in Redpanda, and serves the browser's account and chart. There is no live exchange connection, order-routing endpoint, wallet or private key.

## Run the replay

Use the [common prerequisites and lifecycle reference](../reference/commands.md). From the repository root:

```bash
./labs/run bitcoin up
./labs/run bitcoin urls
```

Play replay advances one historical hour every two seconds. The account starts with 1,000,000 USD cents, or USD 10,000, and zero BTC. The chart shows only consumed closes and averages. Pause replay stops future timer steps once its command is consumed; Consume next quote advances once. View pause holds browser presentation, not ledger replay or trading. Explicit refresh can still read state.

Disable automatic trading before a manual buy or sell. A buy uses 25% of available cash; a sell closes the whole position at the displayed close. Only one long position exists, with no shorts or pyramiding. The finite feed stops at the final close and never wraps. `./labs/run bitcoin down` followed by `up` starts a fresh account and deletes the previous paper history.

## Strategy and accounting

The strategy compares arithmetic means of the last 3 and 8 observed hourly closes. Before eight closes it is in warmup. Afterwards, fast greater than slow means long; less than or equal means flat. An automatic step uses the previous observed signal to fill at the next close, then computes the new signal. A flat account enters on a prior long signal, and an open position exits fully on a prior flat signal. This fixture's automatic entry and exit occur at closes nine and twenty-three. This is a paper execution model, not a liquidity model.

Fees are 10 basis points, or 0.1%, per fill. `BigInt` arithmetic determines integer USD cents and satoshis, with 100,000,000 satoshis per BTC:

- Entry quantity rounds down to fit notional plus fee within the 25% budget. Entry notional and fee round up to cents.
- Sale notional rounds down and exit fee rounds up.
- Cost basis includes the entry fee; realized P&L includes both fees.
- Unrealized P&L is the consumed-close mark minus basis, without a hypothetical exit fee. Equity is cash plus that mark, not guaranteed sale proceeds.

Every transition checks `cashCents + costCents = initialCashCents + realizedCents` and nonnegative cash, position and basis. An exhausted automatic account still consumes quotes even if it cannot fill. Changing windows, fees, allocation or fill timing changes the domain contract, not just performance.

## Source data and clocks

`labs/bitcoin/candles.json` attributes its public [Coinbase Exchange BTC-USD capture](https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=2026-10-11T00:00:00Z&end=2026-10-12T00:00:00Z), retrieved 13 October 2026. Coinbase is the data provider, not this fictional company's identity. The fixture stores source URL, retrieval date, hourly granularity, range and the six-field schema `bucketStart`, `low`, `high`, `open`, `close`, `volume`.

The captured response includes the end-boundary bucket. The engine filters starts into `[2026-10-11T00:00:00Z, 2026-10-12T00:00:00Z)`, sorts ascending and reads field 4, the close. A quote's market time is bucket start plus 3600 seconds. There are 24 retained closes; runtime needs no market-data access. Local `at`/`observedAt` timestamps record owner observation, not market time. Accelerated playback is not a clock correction or missing-data policy.

The [Coinbase candle reference](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) warns that history can be incomplete, no-tick intervals have no bucket, responses can precede the requested start, and requests are capped at 300 candles. It discourages frequent historical polling for real-time data. This unversioned reference is provider guidance, not proof of complete market coverage. Attribution and fixture hashes do not grant commercial redistribution rights; review the provider's terms and data permissions.

## Log and recovery

One owner serializes user commands and timer steps. It computes a complete transition against consumed state, appends one `schema: 1` record to `bitcoin.paper.v1`, and waits for consumer application before returning a receipt. Records bind the fixture SHA256, command, local observation time and full result, including optional quote/fill and next model. Only the consumer changes the account. `/api/state` also exposes the fixture hash.

A new ephemeral consumer group replays from offset zero to the startup high-watermark before readiness. The owner recomputes and compares outcomes; unsupported schemas, changed fixture hash, conflicting duplicate kind/result, bad key or contradictory accounting fail closed. Identical duplicates retain the original receipt and increment duplicate evidence without a new fill. Internal timer IDs are `tick-` plus the first 16 fixture-hash characters and the next quote index. Clients cannot reserve that prefix.

A consumed pause wins before later queued timer publication. Restarted playing replay resumes from the next fixture index at the normal cadence, without synthesizing missed quotes. This is one owner, not distributed ownership or fencing.

```bash
./labs/run bitcoin rpk topic describe bitcoin.paper.v1
./labs/run bitcoin logs app
./labs/run bitcoin restart app
```

This one-partition RF1 ledger uses the [full-prefix policy](../reference/tuning.md#topic-policy); receipts and paper history also grow without bounds in memory. Missing history prevents readiness; volume loss loses the account. Do not compact, repartition or reinterpret this ledger with a new fixture or strategy. Use a fresh disposable account for a changed strategy.

## API and uncertainty

| Route | Contract |
| --- | --- |
| `GET /health` | 200 ready, otherwise 503; readiness and fault |
| `GET /api/state` | Source, consumed prices, strategy, account, trades, receipts and replay progress |
| `POST /api/commands` | `{ "id": "example-step", "kind": "step" }` |
| `GET /api/commands/ID` | Original consumed receipt and record; 404 is not proof of failed publication |
| `GET /api/stream` | Complete state snapshots over server-sent events |
| `GET /metrics` | Quotes, buy/sell fills, cash cents, position satoshis, realized cents and duplicates |

Supported kinds are `play`, `pause`, `step`, `auto-on`, `auto-off`, `buy` and `sell`. IDs use 1–80 letters, digits, underscores or hyphens. Invalid input or reserved `tick-` IDs fail with 400 before publication. The shared HTTP helper bounds JSON to 16 KiB and rejects cross-origin mutation with 403 or wrong media type with 415; absent Origin is permitted for CLI use. These checks are not authentication.

A consumed domain rejection returns 409 with a retained result. A changed kind under an existing ID returns 409 without a new publication. An identical ID/kind returns the original receipt. Publication or projection-ack uncertainty stops writes and the timer, returns 503 with `outcomeUnknown:true`, and requires the original ID. Pre-attempt errors use `outcomeUnknown:false`.

After response loss, retain ID and action. The browser blocks replacement commands and stores the pair when storage is available; copy them if storage is denied. Look up the receipt, inspect the topic, restore broker availability and restart a faulted owner before explicitly resolving the original command with the same ID/action. Lookup absence is unresolved, not evidence to issue a new ID. There is no automatic mutation retry. Shutdown stops admission/timers, waits for the owner's queue, then the shared log waits for in-flight KafkaJS sends to settle before disconnecting. A 30-second caller deadline does not cancel client retries.

## Workload tuning

| Actual setting | Value and owner |
| --- | --- |
| `KAFKA_BROKERS` | Comma-separated brokers; shared default `redpanda:9092`, also assigned by Compose |
| Strategy | Source constants: fast 3, slow 8, allocation 2500 bps, fee 10 bps, initial cash 1,000,000 cents |
| Playback / SSE heartbeat | Source constants: 2000 / 15000 milliseconds |
| Kafka request / append / projection wait | Source limits: 30000 milliseconds each |
| Producer | Idempotent, one in-flight request, `acks: -1`, auto topic creation disabled |
| App temporary filesystem | Compose: 16 MiB, read-only root, dropped capabilities, no-new-privileges |

Play/pause/step and automatic/manual controls are the supported runtime experiments. Fixture choice and strategy parameters are source declarations, not environment knobs. Longer fixtures increase replay, memory and full-state/SSE serialization costs without establishing better signals. Measure replay duration and slow-client snapshot pressure separately from reducer work; the server coalesces newer snapshots while an SSE client is blocked.

The lab sends uncompressed records. [KafkaJS 2.2.4](https://raw.githubusercontent.com/tulios/kafkajs/v2.2.4/docs/Producing.md) codec support and [shared client/host limits](../reference/tuning.md) govern transport experiments; topic compression cannot add a missing client codec.

## Proposed production blueprint

[Production blueprint](../blueprints/bitcoin.md).

Only the offline fixture, paper owner and replayed browser state run here. The proposed market-data service owns provenance, gaps and corrections; a fenced strategy owner consumes its validated chronology. Separately authorized risk, execution and custody/accounting services own real positions and venue reconciliation, not the paper reducer or a broker acknowledgment.

No spread, liquidity, partial fills, network latency, funding, taxes or custody is modeled. One captured day is not an investment study or advice. Regional recovery must fence the owner and consistently restore market history, strategy version, cash, basis, fees, command identities and offsets before reconciling positions and any replication-loss window. Define and exercise RPO/RTO separately; see [production and disaster recovery](../explanation/production.md).

## Checks and packaging

`just check bitcoin` runs static gates. `just test bitcoin` deletes the disposable account first, then exercises integer accounting, manual errors, stable/timer IDs, pacing/pause, next-close strategy, finite completion, duplicate records and exact replay. Node/KafkaJS use the shared locked Nix packaging and upstream licenses; see [supply-chain pins](../reference/supply-chain.md).
