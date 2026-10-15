---
hide:
  - toc
---

# Relay Loom Cooperative

![Proposed Relay Loom Cooperative system topology](../assets/blueprints/agent-messaging.svg)

Authenticated task submission enters Redpanda. Planner and reviewer consume their dependencies and owned starts before calling a confined model gateway. Recorded results rebuild task views; a separate policy handles indeterminate attempts without automatic inference retry.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab runs proposal, critique and synthesis through the local model harness. The proposal builds on that workflow with admission controls, enforceable role ownership and an explicit conflict/takeover policy. Distributed execution needs those stronger controls: the lab's consumed instance identity and duplicate reducer assume cooperative writers and cannot fence or validate hostile multiwriters.

## Authority and effects

Role owners control stage dependencies and attempt identity; inference owns model allowlists, no-tools confinement and output budgets. Recovery begins with replay, then records interruption or an authorized disposition. Model calls remain nondeterministic and separate from broker transactions, so reconcile their outcomes before deciding on a new attempt. The proposed workflow ends at model results; autonomous external actions would need a separate integration.

[Lab guide](../labs/agent-messaging.md) · [D2 source](sources/agent-messaging.d2) · [PNG export](../assets/blueprints/agent-messaging.png)
