---
hide:
  - toc
---

# Amber Commodity Exchange

![Proposed Amber Commodity Exchange system topology](../assets/blueprints/trading.svg)

Authenticated order admission reaches one fenced price-time matcher. Redpanda records immutable executions that the matcher consumes before deciding again. Market-data consumers build read-only views; external clearing reconciles financial and delivery obligations separately.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

One Rust book engine gives you a place to explore maker-price fills and replayed receipts, using explicit partition-zero HTTP Proxy writes. The proposal adds account/risk authorization, fencing and clearing around that workflow. Safe parallel matching needs an ownership design as well as a partitioning choice.

## Authority and effects

The exchange owner controls sequence, order identity and matching rules. Market data owns projections and frontiers; finance/delivery owns stable fill effects and reconciliation. After an execution, settlement still needs its own evidence. Independent recovery must restore book and dedupe state without resending external effects.

[Lab guide](../labs/trading.md) · [D2 source](sources/trading.d2) · [PNG export](../assets/blueprints/trading.png)
