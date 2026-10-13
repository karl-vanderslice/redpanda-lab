# Bitcoin paper trader

A local Bitcoin paper-trading account backed by Redpanda. It replays historical BTC/USD closes, opens and closes a position with a simple moving-average strategy, and shows cash, fees, and profit or loss in a web interface. It never connects to an exchange or places a real order.

## Run

From the repository root:

```bash
nix develop --no-update-lock-file
just up bitcoin
just urls bitcoin
```

Open the printed app URL and select **Play replay**. Each two-second step consumes one historical hourly close. The account starts with $10,000 in paper cash. After eight observed closes, the strategy can enter a position; a later change in its signal can close it.

The feed is a checked-in capture of Coinbase BTC/USD candles for 11 October 2026, not a current quote service. The page identifies the source dates. No market-data account, API key, model, or host installation is needed.

## Inspect a decision

Pause the replay and select **Consume next quote** to advance one close at a time. Disable automatic trading to buy with 25% of cash or sell the whole position manually. Fills charge 0.1%; integer cents and satoshis determine the account, not displayed decimal values.

Every command, quote, and paper fill is retained in the ordered `bitcoin.paper.v1` log. The server commits an outcome and waits for consumption before returning its receipt. Restart it to rebuild the same account:

```bash
just rpk bitcoin topic describe bitcoin.paper.v1
just restart bitcoin app
just test bitcoin
just down bitcoin
```

`test` and `down` delete this lab's account and history. The finite feed stops at its last close; use `down` followed by `up` for a new account. If a request becomes uncertain, look up its original command ID instead of issuing a replacement.

## Limits

This is a strategy and ledger exercise, not a backtesting engine. Automatic decisions use the previous observed close and fill at the next historical close. It models fees but not spread, order-book depth, latency, partial fills, funding, taxes, or liquidation. One historical day does not establish profitability.

The [guide](../../docs/labs/bitcoin.md) explains the signal, rounding, source capture, replay validation, and production recovery boundaries.
