---
hide:
  - toc
---

# Folio Harbor Archives

![Proposed Folio Harbor Archives system topology](../assets/blueprints/event-log.svg)

A fenced writer appends immutable revision outcomes to Redpanda. A materializer validates the complete prefix and rebuilds items and receipts. A rebuild controller gates readiness; an independent archive owner verifies retained offset ranges and restore.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab rebuilds in-memory state with a fresh consumer group up to a captured frontier, then compares full projections. The proposal extends that approach with durable read storage, distributed fencing and independent archives. Checkpoint fallback and a restore-import API would be additional work; the lab's recovery path uses the complete retained log.

## Authority and effects

The domain owner controls revisions, duplicate validation and receipt identity. Recovery owns schema/reducer versions, integrity manifests and restore evidence. Preserve rejections and physical duplicates without compaction. A future checkpoint protocol must include dedupe state and an exact frontier; archive restoration is controlled recovery, not a second writer.

[Lab guide](../labs/event-log.md) · [D2 source](sources/event-log.d2) · [PNG export](../assets/blueprints/event-log.png)
