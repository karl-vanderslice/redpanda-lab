# Bitcoin paper trading

Replay historical BTC/USD closes into one paper position. Redpanda stores observed quotes, commands and outcomes; the browser projects cash, position, fees and P&L. There is no exchange order endpoint, wallet or private key.

## Start and watch

Use the [common environment and lifecycle commands](../reference/commands.md):

```bash
just up bitcoin
just urls bitcoin
```

**Play replay** consumes one historical hour every two seconds. The chart shows only consumed closes/averages; source time and local observation time remain separate. Initial cash is $10,000, with no BTC.

**Pause replay** stops future timer steps once consumed. **Consume next quote** advances a paused feed once. Disable **Automatic paper trading** before **Buy with 25% of cash** or **Sell position**; manual fills use the displayed close. Only one long position exists: no shorts or pyramiding. The feed ends without wrapping. To reset, use `just down bitcoin` then `just up bitcoin`; **down deletes paper history**.

## What the strategy does

Arithmetic means of the last 3 and 8 observed hourly closes select the target: hold until eight exist; long if short mean exceeds long mean, otherwise flat (including equality). At the **next** close, a flat account enters with 25% of available cash; an open position exits fully if the prior target was flat. This prevents reading a close and claiming an earlier fill, but does not model execution quality. This capture enters at close nine and exits at close twenty-three; the workflow checks that delay.

Each fill charges 10 basis points (0.1%). `BigInt` products/division produce integer USD cents and satoshis (100 million/BTC):

- Entry quantity rounds down to fit notional plus fee in budget; entry notional/fees round up to cents.
- Sale proceeds round down; exit fee rounds up.
- Cost basis includes entry fee; realized P&L includes both fees.
- Unrealized P&L is last-close mark minus basis, without hypothetical exit fee. Equity is cash plus mark, not guaranteed realizable proceeds.

`cash + open cost basis = initial cash + realized P&L`. Recomputed outcomes must match the recorded result before projection changes.

## Why the broker is authoritative

One app owns the queue/timer. Against the latest consumed account, it computes and appends **one record** containing command, optional quote/fill and resulting state, then awaits its consumer. Only consumption changes the account.

Restart replays from zero before readiness, recomputing transitions and comparing saved results. Stable IDs prevent duplicate fills. Changed fixture hash, contradictory outcome, missing retained prefix or unsupported codec fails closed, never silently resets cash. A consumed pause precedes later timer publications. A running replay resumes at the next unconsumed fixture position at normal pace, without invented missed quotes. This is one owner, not distributed coordination.

## API and inspection

| Route | Contract |
| --- | --- |
| `GET /api/state` | Source, consumed prices, strategy, account, fills, receipts, replay progress |
| `POST /api/commands` | `{ "id": "unique-id", "kind": "step" }`; kinds `play`, `pause`, `step`, `auto-on`, `auto-off`, `buy`, `sell` |
| `GET /api/commands/ID` | Original consumed receipt and broker record |
| `GET /api/stream` | Complete state snapshots over SSE |
| `GET /metrics` | Quotes, fills, position, cash, realized P&L, duplicate records |

Domain rejection: 409 with retained rejected outcome. Conflicting ID: 409 without a new command. Shape errors/reserved internal `tick-` prefix: 400 before publication. Errors distinguish `outcomeUnknown:true` after uncertain publication from `false` before any attempt.

Publication/projection-ack uncertainty stops new commands. On response loss, the browser retains **ID and action**, blocks replacements and stores the pair when storage works. Lookup releases a known receipt; 404 does not prove non-publication. Inspect the topic and restart a faulted owner before **Resolve original command**, which explicitly sends the same ID/action. Contradictory duplicate outcomes stop the owner. There is no automatic mutation retry.

```bash
just rpk bitcoin topic describe bitcoin.paper.v1
just logs bitcoin app
just restart bitcoin app
just check bitcoin
just test bitcoin
```

**`just test bitcoin` deletes the disposable account first.** It checks independent integer accounting, manual errors, stable/timer IDs, pacing/pause, next-close strategy, finite completion, duplicate records, exact restart replay and cleanup.

## Source data and reproducibility

`labs/bitcoin/candles.json` is an attributed public [Coinbase Exchange capture](https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=2026-10-11T00:00:00Z&end=2026-10-12T00:00:00Z), captured 13 October 2026. It records URL, range, date and six-field schema; every broker record and `/api/state` include its SHA256.

The response included an end-boundary bucket. The lab filters starts into `[11 October, 12 October)` UTC, sorts chronologically and uses field 4 (close), available at bucket start plus one hour. The 24 closes need no runtime data access.

[Coinbase documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) warns of incomplete history, missing no-tick intervals, a 300-candle cap and frequent-polling limits. Real feeds need venue trade/book/WebSocket protocols and gap reconciliation. Evaluate terms/permissions/data rights: attribution and hashes do not grant commercial redistribution.

Node/KafkaJS use shared locked Nix packaging with separate ports, volume, network and ordered topic. Changing `engine.mjs` strategy or dataset requires an intentionally fresh disposable account, not historical reinterpretation. See [supply-chain pins](../reference/supply-chain.md).

## Production boundaries

No spread, liquidity, partial fills, latency, funding, tax or custody is modeled. One captured day is neither a performance study nor investment advice. Production paper trading needs retained data, source/arrival times, gap/correction policy; real execution also needs venue reconciliation, execution-report identity, risk limits and uncertain-order handling. Broker acknowledgment does not prove a venue trade.

Regional recovery must fence the account owner and restore market history, strategy version, cash, basis, fees, IDs and offset consistently, then reconcile positions. Async replication has a loss window; this host is not regional recovery. Measure restore RPO/RTO; see [production and disaster recovery](../explanation/production.md).
