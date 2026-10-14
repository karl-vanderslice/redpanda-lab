# Point of sale

A three-item USD catalog, quantity basket, cash tender ledger, receipts and full refunds. Redpanda stores requests and outcomes; restart rebuilds the view without repeating payment effects.

```sh
labs/run pos up
labs/run pos urls
```

Open the app URL. Set quantities, choose **Cash**, click **Checkout**, then **Full refund** on the receipt. Only completed operations affect totals.

Stripe test mode and Square sandbox are optional, real HTTP adapters, not simulated providers. They stay disabled without explicit authorization and server-side credentials. No card numbers or live funds.

[API, sandbox setup and recovery](../../docs/labs/pos.md).

`labs/pos/e2e.sh` writes receipts, injects broker records and restarts the app. `labs/run pos down` deletes its ledger.
