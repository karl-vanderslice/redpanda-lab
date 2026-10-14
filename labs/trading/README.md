# Amber Commodity Exchange

A fictional commodity desk with a Rust limit-order matcher, browser and container CLI. The single Redpanda log rebuilds orders and fills after app restart. Integer USD-cent ticks, maker-price execution and broker-offset FIFO are teaching contracts, not real trading or settlement.

From the repository root, use the [common prerequisites](../../docs/reference/commands.md):

```bash
./labs/run trading up
./labs/run trading urls
./labs/run trading exec app commodity-exchange help
```

The [scenario guide](../../docs/labs/trading.md) covers a complete order/cancellation example, quantity units, receipts, API, replay barrier, tuning and the proposed production blueprint. Keep the original operation ID after a pending or unknown response; look it up before retrying. Do not scale the matcher or compact/repartition its log. Entry and cancellation are unauthenticated local operations.

```bash
just check trading
just test trading
./labs/run trading down
```

`test` and `down` delete market history. `bash labs/trading/e2e.sh` requires an already-running lab with no concurrent traders and cancels existing open WHEAT orders. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) retains the market until disposal; order/trade memory also grows without bounds.

Nix builds locked Rust dependencies with their upstream licenses. No third-party market data, logos, fonts or UI assets are copied.
