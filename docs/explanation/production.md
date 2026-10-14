# Production and disaster recovery

The labs demonstrate local mechanisms, not production deployments. Replicas share power, disk, kernel and network failure domains. No lab result establishes stable-storage durability, multi-region failover, an RPO/RTO target, compliance, a security audit or a performance benchmark.

The [production blueprints](../blueprints/index.md) propose systems for the fictional organizations. Their identities, fences, external adapters, archives and zone boundaries are design responsibilities, not deployed controls.

## Establish the operating boundary

Before accepting real data, assign owners for capacity, supported storage, retention, schemas, TLS, SASL, ACLs, secrets rotation, audit requirements, monitoring and alert delivery. Place replicas across independent availability zones. Remove development-mode unsafe fsync settings and test the actual storage path. [Tuning and operating limits](../reference/tuning.md) separates client options, effective host controls and production requirements.

Ordering is partition-local. Choose keys around a decision owner: a book, task, conversation or other aggregate. More partitions can change key placement and invalidate cross-entity assumptions. A process-local queue or consumer group is not a distributed writer fence.

Producer idempotence does not identify a new HTTP request or reconcile an external payment. External effects need stable operation IDs, durable deduplication and an explicit unknown-result procedure. Replay must not silently repeat an effect.

Ordinary lab applications require complete execution history; they have no authoritative snapshot fallback. Unlimited retention is not an archive and eventually exhausts disk. Any production checkpoint design must preserve domain state, deduplication identities, reducer/schema versions and an exact offset frontier. See [topic policy](../reference/tuning.md#topic-policy).

## Recover under one writer

Active-passive recovery needs one authoritative writer. Fence the old writer before promoting a standby, route producers and consumers together, and record write ownership. DNS changes do not fence already-connected clients.

[Redpanda Shadowing](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/shadowing/overview/) in the 26.2 series provides asynchronous, offset-preserving replication under an enterprise license. It is active-passive, not active-active. Replication lag can leave acknowledged source records absent from the standby. Automatic fallback after promotion is unsupported. Shadowing is not enabled in this repository.

Re-produce replication requires offset translation and consumer recovery. Stretch clusters trade regional independence for synchronous WAN latency and quorum design. Local broker failover validates neither approach.

## Define and rehearse recovery objectives

RPO is acceptable data loss; RTO is acceptable restoration time. Set them per workflow. A rehearsal must recover routing and application outcomes, not merely start brokers.

1. Establish incident scope and stop or fence the writer.
2. Record replication lag, offsets, topic configuration, schemas and the known loss window.
3. Promote or restore through the supported procedure.
4. Recover identity, TLS/SASL secrets, ACLs, schemas, consumer state and application state.
5. Rebuild projections and reconcile uncertain effects by stable operation ID.
6. Route clients, verify domain outcomes and resume writes under one owner.
7. Control failback or reseeding. Do not let the old region resume independently.

[Whole Cluster Restore](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/whole-cluster-restore/) uses Tiered Storage and is distinct from Shadowing. Tiered Storage does not back up application databases, model files, media, secrets or Terraform state. Retain and rehearse those separately; review exact-version support and licensing.

## Reconcile the domain, not just offsets

These are production obligations, not claims that the lab implements them. Each [lab guide](../labs/index.md) describes the current local boundary; its [blueprint](../blueprints/index.md) describes a proposed extension.

| Workflow | Recovery must preserve or reconcile |
| --- | --- |
| Device telemetry | Device identity, sequence/threshold policy, alert state, notification delivery and missing-device behavior. |
| Point of sale | Provider payment/refund IDs and unknown outcomes before checkout resumes. A log receipt is not settlement. |
| Fleet dispatch | One dispatch owner, driver availability, trip assignments and location observations. Event order does not prove physical pickup or delivery. |
| Execution ledger | Command identities, recorded outcomes, reducer versions and the full reconstruction boundary. |
| Network SIEM | Source identity, event-time/watermark policy, correlation evidence and review state. Synthetic correlation does not prove detection quality. |
| Public activity | Stable action identities, audience/access policy and read/interaction aggregates without inventing user identity. |
| Inventory | Stock movements, reservation ownership, fulfillment and balanced transfers under one decision authority. |
| Clearing | Booked cents, reservations, review evidence and immutable debit/credit pairs; external instructions and statements remain a separate reconciliation boundary. |
| Commodity matching | One matcher per book, orders, fills, balances and settlement before reopening. |
| Sports media | Score/control events separately from media origins, manifests and viewer sessions. A broker is not a video CDN. |
| Agent coordination | Task ownership, correlation IDs and uncertain tool/model effects rather than automatic retries. |
| Scheduled chat | Schedules, one executor per job, timezone/overdue policy and replies generated before interruption. |
| Bitcoin positions | Source data, strategy version, cash, cost basis, fees, command IDs and consumed offset. Real venue execution would need separate reconciliation. |
| Resident data | Regional write authority and raw-data boundaries, plus explicitly permitted summary identities and export progress. |
| Terraform provisioning | Protected/locked state, provider pins and actual resources before a reviewed recovery plan. The Podman socket grants host-user authority; see [Terraform](../labs/terraform.md). |

A restored log cannot establish that a bank settled funds, a driver completed a trip or a model call never ran. Those decisions belong to the system that owns the effect and its evidence.
