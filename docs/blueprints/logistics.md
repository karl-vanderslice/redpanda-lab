---
hide:
  - toc
---

# Wayline Dispatch

![Proposed Wayline Dispatch system topology](../assets/blueprints/logistics.svg)

Authenticated driver positions enter a fenced dispatch authority. Redpanda stores selected assignments and trip transitions; a consumer applies those decisions to fleet views. External routing enriches the view without deciding assignments.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab lets you dispatch three synthetic drivers on a 20 × 20 km grid, advancing trips at exact coordinates. Positions come from your input on that grid. Connecting live GPS and maps would introduce device identity, source sequences, freshness checks and advisory routing; those new input semantics need a versioned migration.

## Authority and effects

The dispatch owner controls driver and trip exclusivity together; replay must not select another driver. Fleet security owns position provenance and fencing. The maps owner controls provider budget and advisory evidence, which proves neither pickup nor physical delivery. Changing keys alone cannot safely shard this authority.

[Lab guide](../labs/logistics.md) · [D2 source](sources/logistics.d2) · [PNG export](../assets/blueprints/logistics.png)
