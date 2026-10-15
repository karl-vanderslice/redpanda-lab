---
hide:
  - toc
---

# Cryowell Instruments

![Proposed Cryowell Instruments system topology](../assets/blueprints/iot.svg)

Devices send sequence-numbered readings through a bounded gateway. A Redpanda consumer validates sequences and materializes devices and alerts. A separate notification owner records delivery evidence outside the telemetry state boundary.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

Start with the lab's three fixture devices and single HTTP gateway/reducer to see how sequence numbers shape device history and alerts. Moving to physical devices would add authentication and credential lifecycle, bounded spooling and a fenced fleet writer. Notification delivery would have its own provider and durable delivery ledger.

## Authority and effects

The telemetry owner controls sequence policy and alert transitions. Device security owns admission and revocation; notification operations owns stable effect IDs and reconciliation. Consuming an alert does not prove delivery, and replay must not send it again.

[Lab guide](../labs/iot.md) · [D2 source](sources/iot.d2) · [PNG export](../assets/blueprints/iot.png)
