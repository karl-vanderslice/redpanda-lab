---
hide:
  - toc
---

# Vesper Lantern Networks

![Proposed Vesper Lantern Networks system topology](../assets/blueprints/siem.svg)

Authorized collectors publish raw telemetry to Redpanda. Normalization preserves provenance and repartitions by rule entity before correlation. Incident outcomes feed analyst workflows and search; a restricted archive independently retains raw evidence.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab serializes synthetic telemetry and analyst actions in one partition using a global event-time frontier. The proposal adds telemetry.ingress.v1 and telemetry.correlation.v1, source authorization, checkpoints and search. These are new pipeline/schema contracts, not existing topics.

## Authority and effects

The rule owner retains window, lateness and case-revision authority. Collector owners must review entity keys and watermark completeness before repartitioning; per-entity watermarks cannot silently replace the global policy. Evidence custody owns access and restore. Search is a rebuildable projection, not evidence authority; no real network capture is implied.

[Lab guide](../labs/siem.md) · [D2 source](sources/siem.d2) · [PNG export](../assets/blueprints/siem.png)
