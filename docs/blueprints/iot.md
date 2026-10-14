---
hide:
  - toc
---

# Cryowell Instruments

![Proposed Cryowell Instruments system topology](../assets/blueprints/iot.svg)

Devices send sequence-numbered readings through a bounded gateway. A Redpanda consumer validates sequences and materializes devices and alerts. A separate notification owner records delivery evidence outside the telemetry state boundary.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab has three fixture devices and one HTTP gateway/reducer, with no device authentication or notification provider. The proposal adds credential lifecycle, bounded spooling, a fenced fleet writer and a durable delivery ledger.

## Authority and effects

The telemetry owner controls sequence policy and alert transitions. Device security owns admission and revocation; notification operations owns stable effect IDs and reconciliation. Consuming an alert does not prove delivery, and replay must not send it again.

[Lab guide](../labs/iot.md) · [D2 source](sources/iot.d2) · [PNG export](../assets/blueprints/iot.png)
