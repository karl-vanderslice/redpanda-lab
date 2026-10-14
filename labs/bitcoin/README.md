# Beacon Ridge Research

A fictional research desk that replays 11 October 2026 BTC/USD closes into one paper account. Redpanda retains commands and validated outcomes. The checked-in Coinbase Exchange capture, retrieved 13 October 2026, supplies the offline source data. Runtime places no real orders and uses no wallet or private key.

From the repository root, use the [common prerequisites](../../docs/reference/commands.md):

```bash
./labs/run bitcoin up
./labs/run bitcoin urls
```

Open the app to play, pause or step through the finite fixture. The [scenario guide](../../docs/labs/bitcoin.md) describes the 3/8-close strategy, next-close fills, 25% allocation, 10-basis-point fees, integer rounding, source rights, receipts, recovery, tuning and proposed production blueprint. One historical day does not establish profitability or realistic execution.

```bash
./labs/run bitcoin restart app
just check bitcoin
just test bitcoin
./labs/run bitcoin down
```

App restart replays the retained account. `test` and `down` delete its history; down/up starts a new account. Keep the original command ID/action after uncertainty; a missing receipt does not prove failed publication. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) retains paper history until disposal. There is no authentication.

Coinbase data rights and Node/KafkaJS/Redpanda licenses remain with their respective owners. Attribution and a fixture hash do not grant commercial redistribution permission.
