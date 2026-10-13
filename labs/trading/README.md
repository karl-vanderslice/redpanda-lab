# Commodity Exchange

A simulated commodity exchange with a Rust matching engine, a CLI, and a web order page. Redpanda stores each command together with its matching outcomes. The application rebuilds the order book and trade history from that log after a restart.

The exchange uses integer price ticks and price-time priority. An incoming order fills against the best resting price, then the oldest broker offset at that price. Any unfilled quantity remains on the book. There are no accounts, balances, settlement, real money, or physical deliveries.

## Run it

From the repository root:

```bash
nix develop --no-update-lock-file
just up trading
just urls trading
```

Open the app URL for order entry, cancellation, operation lookup, book depth, and the trade tape. The same engine accepts CLI commands:

```bash
just exec trading app commodity-exchange order \
  --id first-sell --commodity WHEAT --side sell \
  --price-ticks 24500 --quantity 10
just exec trading app commodity-exchange order \
  --id first-buy --commodity WHEAT --side buy \
  --price-ticks 24600 --quantity 4
just exec trading app commodity-exchange order-status first-sell
just exec trading app commodity-exchange trades
just exec trading app commodity-exchange cancel \
  --id cancel-sell --order-id first-sell
```

The buy should execute at the resting seller's 24500 ticks, leaving six units on that sell order. One tick is USD 0.01 per unit. Wheat and copper use metric tonnes; coffee uses 60 kg bags. Prices and units are illustrative fixtures, not market data.

## State and interruption

Keep the operation ID. Identical commands under that ID return the original result; different commands conflict. A rejected command is also recorded. An accepted command is not necessarily a filled order.

If a request is pending or its outcome is unknown, look up the same ID before taking another action. A timeout is not evidence that the broker rejected the command. Restarting only the app retains the log:

```bash
just restart trading app
just exec trading app commodity-exchange status first-buy
```

The single-partition `trading.exchange.v1` topic gives the matcher one total order. This is a deliberate single-writer design. Do not scale the app, compact the topic, or treat replication factor one as durable production storage. If retention removes the log prefix, replay fails closed rather than constructing an incomplete book.

## Check and remove

```bash
just check trading
just test trading
just down trading
```

The E2E uses the real CLI, HTTP API, and broker. It covers both price-time directions, partial fills, cancellation, durable rejection, stable IDs, and exact replay. It cancels existing open WHEAT orders and must run without concurrent traders. `down` deletes this lab's broker data.

Nix builds the Rust application and container image; `Cargo.lock` pins its dependencies. The [full guide](../../docs/labs/trading.md) explains the event envelope, replay barrier, API, metrics, failure semantics, and production requirements.
