# Tuning and operating limits

The labs favor inspectable outcomes, not maximum throughput. No optimization gain has been measured. Change one owned setting, replay the same workload, and keep the original correctness checks.

## Delivery is not stable storage

Every broker uses `dev-container` mode. Redpanda 26.2 enables `--unsafe-bypass-fsync` and `write_caching_default:true` in this mode. Resource guards and thread affinity are also relaxed. An RF3 topic and `acks=-1` do not make this a production durability test.

Redpanda commits through a Raft majority. “All acknowledgments” does not mean every replica acknowledged. Production fsync behavior differs from the development configuration.

A local 26.2.4 probe created an RF1 topic with `min.insync.replicas=2`. Topic description omitted that property, and an `acks=-1` record succeeded at offset 0. Do not use this Kafka compatibility setting as a two-replica admission guard. This observation does not establish production storage behavior.

Sources: [startup mode](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-start/), [development mode](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-mode/), [Raft commitment](https://docs.redpanda.com/streaming/current/get-started/architecture/#raft-consensus-algorithm), [producer configuration](https://docs.redpanda.com/streaming/current/develop/produce-data/configure-producers/). These rolling references were reviewed for the 26.2 documentation series; the local probe used the pinned 26.2.4 container.

## Topic policy

| Deployment | Partitions and replicas | Retention and recovery |
| --- | --- | --- |
| Explorer | Six partitions, RF3 | Six-hour event window. Recent feed and counters are not a durable business ledger. |
| Ordinary application labs | One partition, RF1 | `cleanup.policy=delete`, `retention.ms=-1`, `retention.bytes=-1`. `up` creates or reapplies these settings. Full-prefix replay is required. |
| Jurisdictions | Three partitions in each of four RF1 clusters | Specialized wrapper sets unlimited retention when creating topics. Existing-topic configuration is not reconciled automatically. |
| Terraform | Three local brokers | Topic policy belongs to the explicit `rpk` command, not the infrastructure provider. |

Unlimited history consumes unbounded disk. Disposal deletes it. Changing retention cannot restore a previously deleted prefix. The shared application log refuses startup if its low offset is not zero or if its partition count changes.

Compaction is not a shortcut for these execution logs. It removes earlier values for a key, including outcomes needed to validate replay and reject conflicting command IDs. A checkpoint design would need domain state, deduplication state, schema/reducer versions, an exact offset frontier, and a verified remaining suffix.

Sources: [topic retention](https://docs.redpanda.com/streaming/current/reference/properties/topic-properties/#retention-bytes), [KafkaJS partition concurrency](https://kafka.js.org/docs/consuming#partition-aware-concurrency).

## Client knobs belong to their client

`KAFKA_BROKERS` selects bootstrap addresses. It does not configure batching, compression, acknowledgments or fetching. The applications do not read generic variables such as `KAFKA_LINGER_MS`, `KAFKA_BATCH_SIZE` or `FETCH_MIN_BYTES`.

| Client | Current path | Relevant experiment |
| --- | --- | --- |
| Explorer, native Confluent wrapper | Idempotent producer, one in-flight request, `acks=-1`, `linger.ms=0`, 30-second delivery timeout | Native constructor options: `linger.ms`, `batch.size`, `batch.num.messages`, `compression.type`, queue limits. Consumer options include `fetch.min.bytes`, `fetch.wait.max.ms` and queue limits. |
| Shared Node applications, KafkaJS | One-record uncompressed sends, idempotence, one in-flight request, all acknowledgments, fresh replay groups | Send-level `messages` and `compression`; consumer `minBytes`, `maxWaitTimeInMs`, `maxBytes` and `maxBytesPerPartition`. Native `linger.ms` and Java `buffer.memory` are not KafkaJS options. |
| Jurisdictions, KafkaJS | Explicit resident partition routing and one-second cumulative export | Its own connection/request/retry settings. Export interval is code, not an environment variable. |
| Trading, Rust HTTP Proxy | Partition-zero publication; 10-second HTTP timeout; replay query timeout 1,000 ms and `max_bytes=1048576` | HTTP/query limits. Native Kafka producer settings do not configure this client. |
| Terraform lifecycle example, `rpk` | Explicit CLI publication and consumption | `rpk` flags. Terraform resource limits do not tune Kafka delivery. |

Serial decision paths restrict useful batching. A longer linger may add waiting without improving throughput. Keep the decision owner and publication order intact; adding partitions or concurrent writers changes the domain contract.

KafkaJS core supports uncompressed records and GZIP. Other codecs need packaged, registered extensions. For manual application fixtures, use `rpk topic produce --compression none`. In Redpanda 26.2, topic `compression.type` is ignored: producer compression is stored and served unchanged.

Sources: [KafkaJS producer](https://kafka.js.org/docs/producing), [KafkaJS consumer](https://kafka.js.org/docs/consuming), [native-wrapper migration](https://raw.githubusercontent.com/confluentinc/confluent-kafka-javascript/v1.11.0/MIGRATION.md), [librdkafka 2.16.0 configuration](https://raw.githubusercontent.com/confluentinc/librdkafka/v2.16.0/CONFIGURATION.md), [topic compression](https://docs.redpanda.com/streaming/current/reference/properties/topic-properties/#compression-type).

## Recovery limits are application-specific

Producer idempotence covers a producer session. It does not identify a later HTTP command. Preserve the original command ID and input, inspect its consumed receipt, and reject conflicting reuse. A timeout leaves completion unknown.

The shared log settles outstanding KafkaJS sends before disconnect. Rebuild cannot declare an absent receipt while the old producer can still publish. A forced process exit remains a separate uncertainty boundary. Replaying a log must not repeat a payment, model call, physical dispatch or bank instruction.

Each [lab guide](../labs/index.md) identifies its own ordering, clock, conservation and effect boundaries. These are correctness constraints, not performance options.

## Container declarations need host evidence

Broker `--smp` selects worker shards, not an exclusive CPU reservation. Broker `--memory` is not the container memory limit. Budget runtime overhead, client queues, decompression, in-memory projections and tmpfs separately.

Rootless resource controls require delegated controllers. The inspected workstation used Podman 5.8.7 with memory and PID controllers reported; CPU, cpuset and IO enforcement was not established. The container store was btrfs-backed, which is not the supported production Redpanda storage profile. Other hosts must be checked independently.

CPU quota limits time; cpuset limits placement. Neither proves dedicated physical cores. `memory.high` causes reclaim/throttling; `memory.max` can cause OOM. Check effective limits and parent constraints, not just Compose declarations. Terraform provider `memory` and `memory_swap` use MB; the latter is total memory plus swap.

Rootless `nofile` cannot exceed its inherited hard limit. `nproc` is user-wide; per-container process limits use cgroups. Namespace root is not host root. Do not switch to rootful Podman or change UID ranges to bypass a missing controller.

Sources: [Podman resource controls](https://docs.podman.io/en/v5.8.0/markdown/podman-run.1.html), [cgroup v2](https://raw.githubusercontent.com/torvalds/linux/v6.18/Documentation/admin-guide/cgroup-v2.rst), [process limits](https://man7.org/linux/man-pages/man2/getrlimit.2.html), [user namespaces](https://man7.org/linux/man-pages/man7/user_namespaces.7.html).

## Production host changes need their owner

Redpanda's production requirements specify XFS/ext4 data/cache storage and at least two physical cores with 2 GB per core. These are support requirements, not a measured capacity target. The [production blueprints](../blueprints/index.md) also require real failure domains, identities, TLS/SASL/ACLs, quotas, monitored disk/lag, and independently tested recovery.

Do not apply a universal sysctl preset. Swappiness is workload-dependent; zero does not mean “never swap.” Transparent huge page advice must match the application’s memory behavior. Changing a block device's `write_cache` flag changes the kernel's view, not the hardware. A false write-through declaration can remove required flushes.

`rpk redpanda tune` is privileged and can change shared disks, NICs and CPU power policy. Review exact devices, supported keys, original values and rollback before host-owner authorization. The reference prohibits this command in Azure self-managed environments. No host tuner or global sysctl was applied during this work.

Tiered storage, shadowing, leader pinning, continuous balancing and fetch read coalescing have version-specific enterprise licensing requirements. A working local binary does not establish production entitlement.

Sources: [production requirements](https://docs.redpanda.com/streaming/current/deploy/redpanda/manual/production/requirements/), [host tuner](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-tune/), [tuner keys](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-tune-list/), [Linux VM controls](https://raw.githubusercontent.com/torvalds/linux/v6.18/Documentation/admin-guide/sysctl/vm.rst), [block queue controls](https://www.kernel.org/doc/Documentation/block/queue-sysfs.rst), [licensing](https://docs.redpanda.com/streaming/current/get-started/licensing/overview/).

## Measure the changed path

Fix event sizes, compressibility, key skew, rates and independent command IDs. Record versions, topic properties, broker mode and effective resources. Measure append latency, consumed-receipt latency, UI freshness and replay time separately. Report p50/p95/p99 with errors, correctness, queues, memory, throttling, disk and network saturation.

Change one setting and repeat. Keep duplicate/conflict, unknown-acknowledgment, pause, restart and broker-loss checks. Power-loss experiments require supported production infrastructure and separate authorization. API documentation alone is not evidence of a speedup. [USE](https://www.brendangregg.com/usemethod.html) provides a useful resource checklist.
