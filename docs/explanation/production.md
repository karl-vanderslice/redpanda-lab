# Production and disaster recovery

The lab demonstrates mechanisms, not a production deployment. Local replicas share power, disk, kernel, and network failure domains. It claims no multi-region failover, RPO/RTO target, security audit, or performance benchmark.

## Ownership and failure domains

Place regional replicas across independent availability zones. Define capacity, disk behavior, retention, TLS, SASL, ACLs, secrets rotation, audit requirements, monitoring, and alert delivery before accepting real data. Pin and review artifacts; benchmark representative workloads before claiming latency or throughput.

Ordering is partition-local. Keys should match ownership: a book, match, agent task, or conversation. More partitions can change key placement. External effects need stable operation IDs and durable deduplication; producer idempotence is insufficient.

## Regional writer

Active-passive recovery requires one authoritative writer. Fence the old writer before promoting the standby; route producers and consumers together and record write ownership. DNS changes do not fence connected clients.

[Redpanda Shadowing](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/shadowing/overview/) in 26.2 provides asynchronous, offset-preserving replication under an enterprise license. It is active-passive, not active-active. Replication lag can leave acknowledged source records absent from the standby. Automatic fallback after promotion is unsupported. Shadowing is not enabled here.

Re-produce replication needs offset translation and consumer recovery. Stretch clusters trade regional independence for synchronous WAN latency and quorum design. Local failover does not validate either.

## Recovery objectives

RPO is acceptable data loss; RTO is acceptable restoration time. Set both per workflow. Rehearsals must include client routing and application reconstruction, not just broker startup.

A recovery runbook must:

1. Establish incident scope; stop or fence the writer.
2. Record replication lag, offsets, topic configuration, schemas, and the known loss window.
3. Promote or restore through the supported procedure.
4. Recover identity, TLS/SASL secrets, ACLs, schemas, consumer state, and application state.
5. Rebuild projections; reconcile uncertain effects by stable operation ID.
6. Route clients, verify domain outcomes, and resume writes under one owner.
7. Control failback or reseeding. Never let the old region resume independently.

[Whole Cluster Restore](https://docs.redpanda.com/streaming/current/manage/disaster-recovery/whole-cluster-restore/) uses Tiered Storage and is distinct from Shadowing. Tiered Storage does not back up application databases, models, media, secrets, or Terraform state. Retain and rehearse those separately; check licensing and exact version support.

## Application recovery

| Workflow | Required boundary |
| --- | --- |
| IoT telemetry | Authenticate devices; retain sequence/threshold policy and alert state. Define delivery, notification and missing-device behavior separately. |
| Point of Sale | Reconcile provider payment/refund IDs and unknown outcomes before resuming checkout. A log receipt is not proof of settlement. |
| Logistics | Fence dispatch ownership; restore driver availability, trip assignments and location observations together. Event order does not prove physical pickup or delivery. |
| Commodity matching | Fence each book's matcher; reconcile orders, fills, balances, and settlement before reopening. |
| Sports broadcasting | Recover score/control events separately from media origins, manifests, and viewer sessions. Brokers are not a video CDN. |
| Agent coordination | Fence task ownership, preserve correlation IDs, and expose uncertain tool/model effects rather than silently retrying. |
| Scheduled chat | Persist schedules; fence one executor per job. Define timezone/overdue policy and reconcile replies generated before interruption. |
| Bitcoin positions | Fence accounts; restore source data, strategy version, cash, cost basis, fees, command IDs, and consumed offset together. Reconcile real venue execution separately. |
| Terraform provisioning | Lock and protect state separately, retain provider pins, and reconcile resources before applying a reviewed recovery plan. The Podman socket grants host-user authority; see the [Terraform guide](../labs/terraform.md). |
