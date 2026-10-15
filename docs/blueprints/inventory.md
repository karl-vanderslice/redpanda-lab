---
hide:
  - toc
---

# Cedarline Supply

![Proposed Cedarline Supply system topology](../assets/blueprints/inventory.svg)

Authorized scanners submit catalog-validated commands to one fenced stock owner. Redpanda preserves coordinated stock and reservation outcomes. A read materializer shows availability, while a fulfillment outbox dispatches physical intents and reconciles evidence.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

Follow stock across the lab's two locations: whole-unit transfers update both endpoints immediately, and fulfillment records a local accounting outcome. Physical warehouse dispatch would add scanners, operator identity and separate intent/acknowledgment phases. Introducing those phases requires a schema/API migration with explicit conservation equations.

## Authority and effects

The stock owner coordinates reservations and both transfer endpoints; the read model is not reservation authority. Catalog ownership retains versioned units and locations. Fulfillment owns stable effect IDs, durable outbox evidence and physical reconciliation. A successful existing fulfill result must not be reinterpreted as proof of dispatch.

[Lab guide](../labs/inventory.md) · [D2 source](sources/inventory.d2) · [PNG export](../assets/blueprints/inventory.png)
