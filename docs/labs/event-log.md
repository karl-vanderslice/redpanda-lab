---
description: Inspect immutable accepted and rejected work-item decisions and rebuild the exact projection from the actual Kafka log.
---

# Event log and rebuild: Folio Harbor Archives

Folio Harbor Archives is a fictional archival work-item desk. Redpanda stores complete accepted and rejected command outcomes; the item index and ruled execution ledger are volatile projections. The app can close its owner, discard projection memory and reconstruct it from the actual Kafka log. It stores no archival file bytes and connects to no external archive.

New to this workbench? Follow the [command-and-replay tutorial](../tutorials/command-and-replay.md) first. This guide is the reference for its revision checks, immutable receipts and recovery boundary.

## Run

Use the [shared setup and lifecycle](./index.md). From the repository root:

```bash
labs/run event-log up
labs/run event-log urls
```

Create an item, assign an archivist, close it with an audit note, then reopen it. Each new command uses a new ID; retries keep the original ID and input. Rebuild from the log reports exact projection equality, not merely unchanged item counts.

## Item and command contracts

`POST /api/commands` requires `id`, `kind` and `itemId`, plus these fields:

| Kind | Fields | State rule |
| --- | --- | --- |
| `create` | `title` | New item becomes open, unassigned, revision 1. |
| `assign` | `expectedRevision`, `assignee` | Item must be open; unchanged assignee is rejected. |
| `close` | `expectedRevision`, `note` | Item must be open and assigned. |
| `reopen` | `expectedRevision`, `note` | Item must be closed. |

IDs use 1–80 ASCII letters, digits, underscores or hyphens. Title is 1–160 characters, assignee 1–80 and note 1–240, already trimmed, with no control characters. `expectedRevision` is a positive safe integer below `Number.MAX_SAFE_INTEGER`. Extra fields return 400. Every accepted change increments that item's revision once and retains its command ID; close/reopen preserve assignee and set the latest audit note.

Valid commands can be rejected as `item-exists`, `item-missing`, `revision-conflict`, `assignment-requires-open`, `already-assigned`, `close-requires-open`, `close-requires-assignee` or `reopen-requires-closed`. Those decisions append immutable 409 receipts. Invalid shapes or values fail before append. A matching command ID returns its original outcome, including an old rejection; changed input under that ID returns 409 without a new record.

## HTTP and projection reference

| Route | Result |
| --- | --- |
| `GET /health` | 200 only when ready and not stopping; otherwise 503. |
| `GET /api/status` | `ready`, `rebuilding`, `stopping`, fault, uncertain ID and topic. |
| `GET /api/state` | Status, projection and last explicit rebuild evidence. |
| `GET /api/commands/ID` | Original consumed receipt; 404 includes an uncertainty warning. |
| `POST /api/commands` | Consumed receipt, 200 accepted or 409 domain rejection. |
| `POST /api/rebuild` | Empty JSON object; returns status and replay evidence. |

POST uses `application/json`, a 16 KiB body limit and same-origin HTTP checks if Origin is present; there is no authentication. The projection contains `items`, unique `commands` receipts, physical `ledger` entries, `lastOffset` and `duplicates`. Receipts retain canonical command, Unix-millisecond audit time `at`, original decimal-string Kafka offset, complete `result:{accepted,code,before,after}` and exact record. Rejections have `after:null` and retain prior state or null in `before`. Item revisions are not Kafka offsets.

## Ordered log and actual rebuild

`event-log.events.v1` has one partition and replication factor 1. Each schema-1 record is `{schema,at,command,result}`, keyed by command ID. Only consumption updates visible items. The single writer serializes commands through consumer completion and recomputes each unique command's full result against preceding state during replay. A duplicate broker record must match the entire original record; it adds a physical ledger entry and duplicate count but does not change an item or replace a receipt. Incompatible or conflicting records stop the consumer.

Rebuild and commands share one queue. Rebuild marks the owner unavailable, captures the prior projection, closes the existing producer/consumer, clears model, receipts, waiters and ledger, then opens a fresh full-prefix consumer. Shared close waits for in-flight KafkaJS sends, even after an HTTP timeout, before disconnect. Replay requires low watermark zero and exactly one partition; readiness waits through the high watermark captured on connection. Rebuild itself appends no domain or metadata events.

State reads during rebuild can expose a partial projection. The browser holds its previous workspace until readiness returns; polling preserves form inputs and ledger disclosures. Pause stops background refresh and discards an automatic read already in flight. Actions and Refresh still request and display state while paused.

Replay evidence includes SHA-256 `beforeDigest` and `afterDigest`, exact deep `equal`, physical `records`, unique `commands` and `lastOffset`. Equality covers items, accepted/rejected receipts, audit times, duplicates and offsets. With no intervening append, a successful rebuild should report equality; a previously uncertain send consumed during close can legitimately make the rebuilt view differ from the earlier snapshot. The HTTP listener starts before initial replay finishes, so startup status is observable but not ready, and an absent startup receipt is not proof of append failure. The captured high watermark is a replay frontier, not a fence against another process writing later records.

## Unknown completion and retention

Keep the exact ID and command after an uncertain response. Look up its receipt. A late consumed outcome can restore readiness; otherwise use successful `POST /api/rebuild` with `{}` or `labs/run event-log restart app` to close the old owner and replay before retrying the original input. Do not send a replacement ID or retry an absent receipt while the old writer can still publish. Forced termination leaves an uncertain startup boundary; do not treat an initial 404 as proof of nonpublication.

The browser preserves uncertain input in memory and attempts session storage. Recovery controls remain available on the current page if storage is denied; no automatic resubmission occurs. A successful explicit rebuild enables lookup and a deliberate same-input retry if still absent. If rebuild fails, inspect logs and restore the complete valid prefix before attempting recovery.

The [full-prefix policy](../reference/tuning.md#topic-policy) retains the command ledger until disposal. Projection, receipt and physical-ledger memory also grow without bounds. Missing history fails closed; no snapshot, archive fallback or durable query database exists. Run one process only; there is no distributed fence.

## Workload tuning

| Supported environment | Default | Owner |
| --- | --- | --- |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated KafkaJS broker list; supplied by Compose. |

The app listens on container port 3000. Topic, schema and text/revision constraints are code-owned. KafkaJS request/append deadlines and the separate projection deadline are each 30 seconds. There is no `SNAPSHOT_INTERVAL`, configurable retention or rebuild-batch option.

Measure history length, rebuild time, RSS and state-response cost. Do not compact rejections or discard deduplication state. A checkpoint must bind reducer/schema version, checksums, deduplication state and exact offset frontiers, with atomic restore validation before shorter retention is safe; see the [event-sourcing reference](https://learn.microsoft.com/en-us/azure/architecture/patterns/event-sourcing) and [storage limits](../reference/tuning.md#delivery-is-not-stable-storage).

## Proposed production architecture

[Production blueprint](../blueprints/event-log.md).

A production service would authenticate workspace commands and fence writers by ordering scope, with a durable read store that remains rebuildable from Redpanda. Verified backups/checkpoints would bind reducer version, complete deduplication state and offsets; archival files would live in separately backed-up object storage with stable references in events. Access policy, legal holds, erasure and restore objectives need their own design; none is implemented by the volatile item index or the rebuild button.

## Scenario and disposal

`just test event-log` recreates owned data, exercises real HTTP/Kafka transitions, exact accepted/rejected records, revision and ID races, broker duplicates, restart, concurrent command/rebuild and repeated exact rebuild equality without extra events, then disposes the lab. `labs/event-log/e2e.sh` expects a fresh running topic. `labs/run event-log down` destroys the owned log volume; Nix outputs and reusable images remain cached.
