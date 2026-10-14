---
hide:
  - toc
---

# Relay Loom Cooperative

![Proposed Relay Loom Cooperative system topology](../assets/blueprints/agent-messaging.svg)

Authenticated task submission enters Redpanda. Planner and reviewer consume their dependencies and owned starts before calling a confined model gateway. Recorded results rebuild task views; a separate policy handles indeterminate attempts without automatic inference retry.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab runs proposal, critique and synthesis through the local model harness. Consumed instance identity is not a distributed fence, and its duplicate reducer is not a hostile multiwriter validator. The proposal adds admission, enforceable role ownership and conflict/takeover policy.

## Authority and effects

Role owners control stage dependencies and attempt identity; inference owns model allowlists, no-tools confinement and output budgets. Recovery replays first, then records interruption or an authorized disposition. Broker delivery does not make inference deterministic or atomic, and no autonomous external-action integration is shown.

[Lab guide](../labs/agent-messaging.md) · [D2 source](sources/agent-messaging.d2) · [PNG export](../assets/blueprints/agent-messaging.png)
