---
hide:
  - toc
---

# Beacon Ridge Research

![Proposed Beacon Ridge Research system topology](../assets/blueprints/bitcoin.svg)

Historical candles enter a provenance store before a fenced strategy can use them. Redpanda records paper-account outcomes for consumed account views. Optional real venue work needs separate authorization and custody reconciliation; paper replay never routes orders.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab uses digest-bound offline hourly fixtures, prior-close signals and subsequent-close paper fills with integer cents/satoshis. It has no live feed, venue, custody or bank transfer. The proposal adds reviewed feed provenance and an independently authorized optional venue boundary.

## Authority and effects

Research owns chronology, source digest and strategy version; account ownership preserves fees, semantic IDs and conservation. A venue/custody owner must define durable effect lookup and uncertain-outcome reconciliation before enabling real execution. Neither the diagram nor the paper account demonstrates realistic liquidity or profitability.

[Lab guide](../labs/bitcoin.md) · [D2 source](sources/bitcoin.d2) · [PNG export](../assets/blueprints/bitcoin.png)
