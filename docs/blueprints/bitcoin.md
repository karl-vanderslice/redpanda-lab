---
hide:
  - toc
---

# Beacon Ridge Research

![Proposed Beacon Ridge Research system topology](../assets/blueprints/bitcoin.svg)

Historical candles enter a provenance store before a fenced strategy can use them. Redpanda records paper-account outcomes for consumed account views. Optional real venue work needs separate authorization and custody reconciliation; paper replay never routes orders.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab supports offline paper research with digest-bound hourly fixtures, prior-close signals and subsequent-close fills, accounted in integer cents/satoshis. Live feeds and venue execution, including custody and bank transfers, belong to a separate integration. The proposal adds reviewed feed provenance and keeps any optional venue connection subject to independent authorization.

## Authority and effects

Research owns chronology, source digest and strategy version; account ownership preserves fees, semantic IDs and conservation. Before enabling real execution, a venue/custody owner must define durable effect lookup and uncertain-outcome reconciliation. Assess liquidity and profitability separately from this paper exercise.

[Lab guide](../labs/bitcoin.md) · [D2 source](sources/bitcoin.d2) · [PNG export](../assets/blueprints/bitcoin.png)
