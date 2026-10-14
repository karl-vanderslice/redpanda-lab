# Counterlane Market

A fictional three-item USD checkout desk. Choose quantities and Cash, submit Checkout, then use Full refund on its receipt. Cash is a local ledger, not a drawer; optional Stripe test-mode and Square sandbox adapters send HTTP requests only with explicit authorization and server-side credentials; credential-dependent runtime remains unverified. Do not enter card details or use live funds.

```bash
labs/run pos up
labs/run pos urls
```

[API, sandbox configuration and recovery](../../docs/labs/pos.md) · [Shared setup](../../docs/labs/index.md)

Keep the original operation ID and input after uncertain completion; duplicate POST does not authorize another provider effect. `just test pos` recreates and disposes owned data. External checks require `POS_SANDBOX_E2E=1`, `POS_SANDBOX_ENABLED=1` and real test credentials. Resolve unknown provider operations before `labs/run pos down`: deletion removes the ledger and recovery keys, not provider objects.
