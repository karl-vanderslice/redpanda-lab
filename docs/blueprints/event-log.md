---
hide:
  - toc
---

# Folio Harbor Archives

![Proposed Folio Harbor Archives system topology](../assets/blueprints/event-log.svg)

A fenced writer appends immutable revision outcomes to Redpanda. A materializer validates the complete prefix and rebuilds items and receipts. A rebuild controller gates readiness; an independent archive owner verifies retained offset ranges and restore.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab rebuilds in-memory state with a fresh group to a captured frontier and compares full projections. The proposal adds durable read storage, distributed fencing and independent archives; there is no implemented checkpoint fallback or restore-import API.

## Authority and effects

The domain owner controls revisions, duplicate validation and receipt identity. Recovery owns schema/reducer versions, integrity manifests and restore evidence. Preserve rejections and physical duplicates without compaction. A future checkpoint protocol must include dedupe state and an exact frontier; archive restoration is controlled recovery, not a second writer.

[Lab guide](../labs/event-log.md) · [D2 source](sources/event-log.d2) · [PNG export](../assets/blueprints/event-log.png)
