# Production, multi-region, and disaster recovery

This repository teaches mechanisms. It does not deploy a production platform. Broker replicas on one laptop share the same power, disk, kernel, and network failure domain.

## Start with ownership and failure domains

Use broker replicas across independent availability zones within a region. Define capacity, disk behavior, retention, TLS, SASL, ACLs, secrets rotation, audit requirements, monitoring, and alert delivery before accepting real data. Pin and review deployable artifact identities. Benchmark representative workloads before making latency or throughput claims.

A topic's ordering is partition-local. Partition keys must match domain ownership: one order book, one match, one agent task, or one conversation. Increasing a partition count can change key placement. Side effects need stable operation IDs and a durable deduplication boundary; producer idempotence alone does not make application processing exactly-once.

## Prefer an explicit regional writer

For an active-passive design, keep one authoritative writer and replicate to a second regional cluster. Fence the old writer before promoting the standby. Route consumers and producers together, and record which region owns writes. Do not treat DNS changes as fencing: old clients can keep their original connections.

[Redpanda Shadowing](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/shadowing/overview/) provides asynchronous, offset-preserving replication. It requires an **enterprise license**. The documented 26.2 feature is active-passive, not active-active; replication lag means some acknowledged source data can be absent at the standby during a disaster. Automatic fallback after promotion is not supported. These capabilities are documented options, not enabled services in this lab.

Alternative re-produce replication tools need their own offset translation and consumer recovery procedure. A stretch cluster exchanges regional independence for synchronous wide-area latency and quorum design. Do not select either from the local failover experiment alone.

## Define recovery objectives before the runbook

**RPO** (recovery point objective) is the acceptable amount of lost data. **RTO** (recovery time objective) is the acceptable restoration time. Set them per workflow and measure them in rehearsals, including client routing and application reconstruction, not just broker startup.

A production runbook should:

1. Establish incident scope and stop or fence the current writer.
2. Record replication lag, offsets, topic configuration, schemas, and the known data-loss window.
3. Promote or restore the target cluster using its supported procedure.
4. Recover identity, TLS/SASL secrets, ACLs, schemas, consumer state, and application state.
5. Rebuild projections and reconcile uncertain side effects using stable operation IDs.
6. Route clients, verify domain outcomes, and resume writes under one owner.
7. Plan controlled failback or reseeding; never let an old region resume independently.

[Whole Cluster Restore](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/whole-cluster-restore/) is a distinct recovery mechanism using Tiered Storage. Tiered Storage is not a general backup of application databases, model files, media assets, secrets, or Terraform state. Retain and rehearse those owners separately. Verify licensing and exact version support before adoption.

## Apply the boundary to applications

| Workflow | Recovery constraint |
| --- | --- |
| Commodity matching | Fence the matcher per book; reconcile accepted orders, fills, balances, and external settlement before reopening. |
| Sports broadcasting | Replicate score/control events separately from media origin assets, manifests, and viewer sessions. A broker is not a video CDN. |
| Agent coordination | Fence task ownership, preserve correlation IDs, and surface uncertain tool/model effects rather than repeating them silently. |
| Scheduled chat | Persist schedule state, use one fenced executor per job, define timezone/overdue policy, and reconcile replies generated before interruption. |
| Bitcoin positions | Fence account ownership; restore source data, strategy version, cash, cost basis, fees, command IDs and consumed offset together. Real venue execution requires separate reconciliation. |
| Terraform provisioning | Protect and lock state independently, retain provider pins, and reconcile actual resources before applying a recovery plan. |

No multi-region failover, RPO/RTO target, production security audit, or performance benchmark is claimed by this lab.
