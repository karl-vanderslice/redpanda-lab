---
hide:
  - toc
---

# Amber Commodity Exchange

![Proposed Amber Commodity Exchange system topology](../assets/blueprints/trading.svg)

Authenticated order admission reaches one fenced price-time matcher. Redpanda records immutable executions that the matcher consumes before deciding again. Market-data consumers build read-only views; external clearing reconciles financial and delivery obligations separately.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab uses one Rust book engine and explicit partition-zero HTTP Proxy writes, with maker-price fills and replayed receipts. The proposal adds account/risk authorization, fencing and clearing. More partitions alone do not create safe parallel matching.

## Authority and effects

The exchange owner controls sequence, order identity and matching rules. Market data owns projections and frontiers; finance/delivery owns stable fill effects and reconciliation. Execution is not settlement. Independent recovery must restore book and dedupe state without resending external effects.

[Lab guide](../labs/trading.md) · [D2 source](sources/trading.d2) · [PNG export](../assets/blueprints/trading.png)
