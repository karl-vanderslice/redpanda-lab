---
hide:
  - toc
---

# Counterlane Market

![Proposed Counterlane Market system topology](../assets/blueprints/pos.svg)

A merchant submits checkout or refund commands to a fenced orchestrator. Redpanda stores payment phases; consumed ledger frontiers gate provider effects. Verified webhooks and reconciliation return observations through the same owner.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

Follow requested, bound, attempt and observed phases within one lab app. Cash stays local accounting, while optional Stripe test and Square sandbox adapters require explicit enablement and credentials. Merchant-scoped identity, webhook intake and background reconciliation would extend this flow with new services and routes.

## Authority and effects

The payment owner retains immutable cents, attempts, original provider keys and account/location bindings. Payment operations owns signature verification, uncertain outcomes and provider lookup; replay calls no provider. Kafka acknowledgment and provider success are not bank settlement, and unknown must not be treated as declined.

[Lab guide](../labs/pos.md) · [D2 source](sources/pos.d2) · [PNG export](../assets/blueprints/pos.png)
