# Meridian Ledger Alliance

Meridian Ledger Alliance is a fictional regional-record operator. Three independent raw-log clusters, labelled EU, US and APAC, feed a fourth summary cluster. Four RF1 brokers and five Node/KafkaJS app containers run on one host. These labels are not geographic isolation, compliance certification or disaster recovery. Use synthetic data only; grouping Canadian and US fixtures is not a legal residency determination.

## Publish and inspect a resident record

Use the [common prerequisites and lifecycle reference](../reference/commands.md). Allow several GiB of memory for the four brokers and apps. From the repository root:

```bash
./labs/run jurisdictions up
./labs/run jurisdictions urls
APP=$(./labs/run jurisdictions urls --json | jq -r .app)
curl -fsS "$APP/api/events" -H 'Content-Type: application/json' \
  -d '{"id":"example-eu-001","tenantId":"berlin-shop","amount":125,"privateNote":"Synthetic reference only"}'
curl -fsS "$APP/api/operations/eu/example-eu-001"
curl -fsS "$APP/api/state" | jq .global
```

The resident consumer's completion receipt supplies region, partition and consumed offset. Its raw record includes the private note. The global summary excludes both tenant ID and note. The unauthenticated operator gateway can inspect all resident fixtures and return them to the browser; it is not tenant access control. The global consumer/broker have no regional broker-network attachment, but exporters connect to their region and the global network. This does not protect against a compromised exporter.

## Placement and units

The server-owned registry selects the home cluster, not the command or request's network location. Within that cluster, the fixed partition is `uint32_be(SHA256(UTF8(tenantId))[0:4]) % 3`; writes supply this partition and the tenant ID as Kafka key.

| Tenants | Home cluster | Raw topic |
| --- | --- | --- |
| `berlin-shop` (DE), `paris-shop` (FR), `dublin-shop` (IE) | `eu` | `jurisdictions.records.v1`, 3 partitions |
| `new-york-shop` (US), `toronto-shop` (CA) | `us` | `jurisdictions.records.v1`, 3 partitions |
| `singapore-shop` (SG), `tokyo-shop` (JP) | `apac` | `jurisdictions.records.v1`, 3 partitions |
| Aggregate exports only | `global` | `jurisdictions.summaries.v1`, 3 partitions |

Each cluster is one broker with RF1. Identical topic names do not share data. Ordering is per partition, not across tenants, regions or the whole system. A partition is not a jurisdiction or backup. Changing the hash, registry or partition count requires migration, not a runtime tuning override.

`amount` is an integer from 1 through 1,000,000 synthetic units. There is no currency field, FX rate or currency conversion: `totalAmount` sums those same units, not real monetary amounts. `id` accepts 1–100 letters, digits, underscores or hyphens. `privateNote` is a string of at most 240 JavaScript characters. Unknown tenants fail validation. Optional `requestedRegion` must match the fixed registry or return 409 before publication; the regional service checks home region again.

Raw records contain exactly the constructed fields `id`, `tenantId`, `country`, `region`, `amount` and `privateNote`. Replay validates field construction, regional placement, tenant partition and Kafka key. Identical operation IDs apply once within their home jurisdiction; conflicting resident records stop the projection. IDs are not globally deduplicated across regions. The design assumes one regional writer per home cluster.

## Export boundary

The regional raw log is the outbox. A consumer rebuilds cumulative counters per partition; its exporter explicitly constructs only these five fields:

| Export field | Meaning |
| --- | --- |
| `region` | Source label: `eu`, `us` or `apac` |
| `partition` | Regional partition 0–2 |
| `sourceOffset` | Last consumed resident offset, decimal string |
| `count` | Unique applied operation count |
| `totalAmount` | Cumulative synthetic units |

The key is `region:partition`. The global Kafka partition is the source region's index in `[eu, us, apac]`. The global consumer retains the snapshot with the highest source offset for each source-region/partition pair. It replaces cumulative totals rather than adding repeated snapshots. Offsets from different source logs are incomparable, so freshness must be interpreted per source partition.

Export is asynchronous federation, not raw replication, cluster linking, MirrorMaker or a distributed transaction. A global outage does not block regional consumption or resident writes. Recovery and regional replay can regenerate the latest summary, but that summary cannot recover a lost resident raw log, private note, operation history or tenant identity. Small counts and totals are not necessarily anonymous.

## API and uncertainty

| Gateway route | Contract |
| --- | --- |
| `POST /api/events` | 200 completed, 202 pending, 400 invalid input, 409 ID/region conflict, 503 unavailable or unknown acknowledgment |
| `GET /api/operations/REGION/ID` | Home operation and placement; 404 `not-observed` is not proof of non-publication |
| `GET /api/state` | Registry, resident availability/readiness, counters, recent raw records, exporter state and global summaries |
| `GET /health` | Gateway readiness only; inspect state for brokers/projections |

The shared HTTP helper limits JSON to 16 KiB and rejects cross-origin mutation with 403 or wrong media type with 415. Origin absence is allowed for local CLI requests. Resident state returns the last 40 completed records, while the deduplication map retains all operations. Broker availability, replay readiness and exporter `federation`/`federationError` are separate evidence, not one freshness flag.

When the home service and broker are available, identical ID/input returns the existing operation without another write; changed input conflicts, including publication races. A consumed operation is `completed`. Successful publication can return 202 while consumption is pending. Failed acknowledgment can return 503 with `outcome: unknown` and a pending/unknown operation; consumption may later establish completion. There is no rollback or new-ID retry guarantee.

Keep the original ID and exact input after an uncertain response. Lookup absence is unresolved. Restore the home broker, inspect its log, and restart the resident service for full replay before interpreting absence or retrying the identical input. The browser blocks replacement submissions while unresolved, but its ID is page-local and does not survive reload. Copy it before leaving. Gateway write transport failure also means unknown, not proof that the home service rejected publication.

## Outage and replay

```bash
./labs/run jurisdictions outage eu
./labs/run jurisdictions recover eu
./labs/run jurisdictions outage global
./labs/run jurisdictions recover global
./labs/run jurisdictions logs region-eu
./labs/run jurisdictions restart region-eu
./labs/run jurisdictions restart global
./labs/run jurisdictions rpk eu topic describe jurisdictions.records.v1 -p
./labs/run jurisdictions rpk global topic describe jurisdictions.summaries.v1 -p
```

Home preflight failure returns 503 `outcome: not-attempted` without forwarding a new command. No alternate-region write is attempted. US/APAC can continue during EU outage. Global outage instead makes exporters unavailable; their retained summaries are stale, and recovery sends latest cumulative snapshots.

A fresh group replays all three partitions from zero through captured startup high watermarks. Missing history, wrong partition/schema or a conflicting authoritative ID fails closed. The [specialized topic policy](../reference/tuning.md#topic-policy) sets unlimited retention at creation but does not reconcile existing topics. Raw/summary history and operation maps grow until disposal; summaries cannot replace a deleted raw prefix.

Only the gateway is published on loopback. Kafka and Admin APIs remain on the lab's owned networks. Initial `LAB_PORT_BASE` accepts 49152–65535 and persists until successful disposal. Inspect `app`, `region-eu`, `region-us`, `region-apac`, `global` and the four `broker-REGION` services; `rpk` takes region first. `./labs/run jurisdictions down` deletes all four owned broker volumes, containers and networks while retaining shared images.

## Workload tuning

| Actual configuration | Default or code-owned limit |
| --- | --- |
| `ROLE` | Default `gateway`; Compose assigns `gateway`, `regional` or `global` |
| `REGION` | Required `eu`, `us` or `apac` for regional role |
| `KAFKA_BROKERS`, `ADMIN_HOST` | Compose assigns the home broker to each non-gateway service; no standalone broker default |
| Kafka connection / request | 1500 / 4000 milliseconds; 2 retries, initial retry 200 milliseconds |
| Resident producer | Idempotent, one in-flight request, `acks: -1`, auto topic creation disabled |
| Export producer | Explicit regional global partition, `acks: -1`; idempotence is not enabled |
| Export loop delay / Admin probe | 1000 / 1200 milliseconds |
| Gateway read / write request | 2200 / 12000 milliseconds |
| Post-send projection wait | Up to 25 polls of 100 milliseconds |
| App memory / temporary filesystem | 256 MiB / 32 MiB per container |
| Broker resources | 1 GiB container limit, `--smp=1`, `--memory=512M`, `--reserve-memory=0M`, development mode |

Role/broker settings are deployment wiring, not routing or privacy overrides. Timeouts, polling, partition count and hash are source values. Measure bytes, lag and source offsets per tenant/shard. Changing exporter cadence trades cumulative-summary freshness against traffic; it cannot strengthen residency or restore raw records. Startup and steady-state work share one host's CPU, memory and disk, and an exporter has broader network reach than a global consumer. See [broker and Linux tuning](../reference/tuning.md) for shared client and host limits.

## Proposed production blueprint

[Production blueprint](../blueprints/jurisdictions.md).

Only single-host resident logs, exporters and an operator gateway run in the lab. The proposed region-scoped identity, network, key, storage and backup owners enforce access and recovery within each real residency boundary; a reviewed registry owns placement changes. Export-policy and privacy reviewers own field/cohort approval, while the global summary service owns only its replayable filtered projection and federation lag.

Production needs regional quorums, TLS/auth/ACLs, writer fencing, export audit, aggregation/privacy assessment and explicit residency migration and disaster-recovery decisions. Never route private writes elsewhere merely to restore availability. The [UK ICO data-minimisation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/) is UK-specific and marked under review, not an EU/US/APAC compliance determination. Define recovery for raw resident data separately from summaries; see [production and disaster recovery](../explanation/production.md).

## Checks and references

`just test jurisdictions` deletes existing history, provisions fresh fixtures, checks placement/order, duplicate/conflicting input, wrong-region refusal, summary schema, regional/global outages, export catch-up and replay, then disposes the lab and writes an external report. `just check jurisdictions` runs static checks.

Client behavior follows the [KafkaJS 2.2.4 producer manual](https://raw.githubusercontent.com/tulios/kafkajs/v2.2.4/docs/Producing.md). Node, KafkaJS and Redpanda retain their upstream licensing. This scenario does not establish compliance, anonymous exports or cross-region failover safety.
