# Bitcoin paper trading

This lab watches a historical BTC/USD stream and trades one paper position. Redpanda stores the observed quotes, commands and execution outcomes. A web interface shows the resulting cash, position, fees and profit or loss. There is no exchange order endpoint, wallet or private key.

## Start and watch

```bash
nix develop --no-update-lock-file
just up bitcoin
just urls bitcoin
```

Open the app URL. Select **Play replay** to consume one historical hour every two seconds. The chart draws only consumed closes and their moving averages. The account begins with $10,000 of paper cash and no Bitcoin. Source time and local execution-observation time are separate fields.

Use **Pause replay** to stop future timer steps after its pause command is consumed. **Consume next quote** advances a paused feed by one close. Disable **Automatic paper trading** before using **Buy with 25% of cash** or **Sell position**. Manual fills use the displayed historical close. There is only one long position; no shorts or pyramiding.

The feed ends rather than wrapping prices into a different market timeline. To start a new account:

```bash
just down bitcoin
just up bitcoin
```

Both commands operate only on this lab's resource identity. `down` deletes its paper history.

## What the strategy does

The arithmetic means of the last 3 and 8 **observed** hourly closes define a target regime. Until eight closes exist, it holds. If the short mean is greater than the long mean, the target is long; otherwise it is flat. At the **next** close, a flat account enters the long regime using 25% of its available cash. An open position exits in full when the previously observed target is flat. Equality selects flat.

The next-close delay prevents the strategy from both reading a candle's closing value and claiming an execution before that candle completed. It does not model real execution quality. This capture produces an automatic entry at the ninth observed close and an exit at the twenty-third; the public workflow check guards that one-close delay.

The paper engine charges 10 basis points (0.1%) on each fill. It uses `BigInt` for products and division, then records integer USD cents and Bitcoin satoshis (100 million satoshis per BTC):

- Entry quantity rounds down so notional plus the entry fee fits its cash budget.
- Entry notional and fees round up to cents. Sale proceeds round down; the exit fee rounds up.
- Cost basis includes the entry fee. Realized P&L includes both charged fees.
- Unrealized P&L uses the last observed close minus cost basis, without deducting a hypothetical exit fee.
- Marked equity is cash plus that position mark. It is not a promise of realizable exchange proceeds.

The invariant is `cash + open cost basis = initial cash + realized P&L`. The replayed calculation must agree with the recorded outcome before the projection can change.

## Why the broker is authoritative

One app container owns the command queue and quote timer. Each command computes an outcome against the latest consumed account, appends a single record with the command, quote if applicable, fill if applicable and resulting state, then waits for its own consumer to apply it. Only that consumer changes the account.

On restart, a fresh consumer rebuilds from offset zero before the app becomes ready. It recomputes each transition and compares it with the saved result. Stable command IDs prevent duplicate fills. A changed fixture hash, contradictory outcome, missing retained prefix or unsupported codec fails closed rather than resetting the account silently. The broker is real; the balances and execution model are paper-only.

A consumed pause wins the command order before later timers can publish a quote. Restarting a running replay resumes from the next unconsumed fixture position at the normal pace, not by inventing missed market updates. This is one owner, not a distributed trading coordinator.

## API and inspection

```bash
just rpk bitcoin topic describe bitcoin.paper.v1
just logs bitcoin app
just restart bitcoin app
just check bitcoin
just test bitcoin
```

| Route | Purpose |
| --- | --- |
| `GET /api/state` | Source, consumed prices, strategy, account, fills, receipts and replay progress. |
| `POST /api/commands` | JSON `{ "id": "unique-id", "kind": "step" }`; kinds: `play`, `pause`, `step`, `auto-on`, `auto-off`, `buy`, `sell`. |
| `GET /api/commands/ID` | Original consumed receipt, including its broker record. |
| `GET /api/stream` | Complete state snapshots over server-sent events. |
| `GET /metrics` | Consumed quotes, fills, position, cash, realized P&L and duplicate records. |

A domain rejection returns HTTP 409 and a retained rejected outcome; a conflicting existing ID returns 409 without reusing it for a new command. Shape errors and the reserved internal `tick-` ID prefix return 400 before publication. Error responses distinguish `outcomeUnknown:true` after an uncertain publication from `outcomeUnknown:false` before any attempt.

If publication or projection acknowledgment becomes uncertain, the owner stops new commands. If the browser loses a response, it retains the original **ID and action**, blocks replacement commands, and saves that pair when local storage works. Lookup can release a known receipt; a 404 is not proof of failed publication. Inspect the topic and restart a faulted owner before using **Resolve original command**. That button explicitly submits the same ID and action, never a new operation. A consumed ID returns its original receipt; contradictory duplicate outcomes stop the owner rather than executing a second effect. This is not an automatic retry or a claim that lookup absence proves failure.

`just test bitcoin` starts by deleting this lab's existing disposable account, then proves integer accounting against an independent oracle, manual position errors, stable IDs, timer-ID separation, actual pacing and pause, next-close automatic entries/exits, finite feed completion, duplicate broker records, exact restart replay and cleanup. Do not run it against history you want to keep.

## Source data and reproducibility

`labs/bitcoin/candles.json` contains an attributed response captured on 13 October 2026 from the public [Coinbase Exchange historical candles endpoint](https://api.exchange.coinbase.com/products/BTC-USD/candles?granularity=3600&start=2026-10-11T00:00:00Z&end=2026-10-12T00:00:00Z). The file records the URL, time range, capture date and six-field schema. Its SHA256 is included in every broker record and exposed by `/api/state`.

The API returned a candle beginning at the end boundary. The lab deliberately filters bucket starts into the half-open UTC window `[11 October, 12 October)`, sorts chronologically, and uses field 4, the close. Each close becomes available at its bucket start plus one hour. The 24 retained closes replay without runtime market-data access.

Coinbase's [primary documentation](https://docs.cdp.coinbase.com/api-reference/exchange-api/rest-api/products/get-product-candles) warns that historical rates can be incomplete, omits intervals without ticks, caps responses at 300 candles, and advises against frequent historical polling. For a real feed, use the venue's trade/book and WebSocket protocols, reconcile sequence gaps, and evaluate its terms, permissions and data rights. Attribution and a source hash are provenance, not a grant of commercial redistribution rights.

The Node application and KafkaJS client use the same locked Nix packaging as the other application labs. Ports, volumes, the single ordered topic and network are separate. The fixed strategy is in `engine.mjs`; changing the dataset or execution policy requires an intentionally fresh disposable account, not an unnoticed historical reinterpretation. See [supply-chain pins](../reference/supply-chain.md).

## Production boundaries

This app is not an execution gateway or a representative performance study. It excludes spread, liquidity, partial fills, exchange latency, funding, tax and custody. The captured day and strategy are not investment advice or evidence of expected returns.

A production paper engine needs independently retained market data with source/arrival timestamps, gaps and correction policy. Real execution also needs venue reconciliation, execution-report identity, risk limits and explicit handling of uncertain order acceptance. A broker acknowledgment alone does not prove a venue trade.

For multiple regions, fence the active account owner and reconcile positions before a new writer starts. Protect the market-data history, strategy version, cash, cost basis, fees, stable command IDs and last consumed offset together. Async cross-region replication has a nonzero loss window; broker replication on this host is not regional recovery. Rehearse a restore and measure RPO/RTO before making claims. See [production and disaster recovery](../explanation/production.md).
