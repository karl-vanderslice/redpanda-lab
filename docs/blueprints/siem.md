---
hide:
  - toc
---

# Vesper Lantern Networks

![Proposed Vesper Lantern Networks system topology](../assets/blueprints/siem.svg)

Authorized collectors publish raw telemetry to Redpanda. Normalization preserves provenance and repartitions by rule entity before correlation. Incident outcomes feed analyst workflows and search; a restricted archive independently retains raw evidence.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

Explore synthetic telemetry and analyst actions in one ordered partition, using the lab's global event-time frontier. Moving to this proposed pipeline would introduce `telemetry.ingress.v1` and `telemetry.correlation.v1`, along with source authorization, checkpoints and search. Those additions require new pipeline and schema contracts.

## Authority and effects

The rule owner retains authority over windows, lateness and case revisions. Before repartitioning, collector owners must review entity keys and watermark completeness; replacing the global policy with per-entity watermarks would change its behavior. Evidence custody owns access and restore, while search rebuilds a view of that evidence. The lab supplies synthetic telemetry; real network capture would need a separately authorized collection path.

[Lab guide](../labs/siem.md) · [D2 source](sources/siem.d2) · [PNG export](../assets/blueprints/siem.png)
