# Multi-jurisdiction sharding

Three independent regional raw logs feed a fourth summary cluster. This is a **single-host experiment**, not geographic deployment, compliance certification or disaster recovery. EU/US/APAC are illustrative policy labels; grouping Canadian and US fixtures is not a legal residency determination.

## Start and publish a record

Use [common prerequisites/commands](../reference/commands.md) and the [getting-started guide](../index.md). Allow several GiB for four brokers/five app containers; no cloud credentials.

```bash
just up jurisdictions
just urls jurisdictions
```

Publish synthetic units/private note for a tenant. Placement shows home jurisdiction, partition and key; completion shows consumed offset. Regional inspection includes the note; exported summaries omit note/tenant ID.

The unauthenticated operator gateway can inspect all regions and returns private fixtures to its browser. Unlike the gateway, global consumer/broker have no regional broker-network attachment. This is neither tenant authorization nor protection against a compromised exporter.

## Partitioning

Server-owned residency selects the **cluster**; raw logs/volumes stay there. Inside it, partition is `uint32_be(SHA256(UTF8(tenantId))[0:4]) % 3`. Writes explicitly supply partition and tenant-ID Kafka key.

| Fixtures | Cluster | Topic / partitions |
| --- | --- | --- |
| `berlin-shop` (DE), `paris-shop` (FR), `dublin-shop` (IE) | `eu` | `jurisdictions.records.v1` / 3 |
| `new-york-shop` (US), `toronto-shop` (CA) | `us` | `jurisdictions.records.v1` / 3 |
| `singapore-shop` (SG), `tokyo-shop` (JP) | `apac` | `jurisdictions.records.v1` / 3 |
| Summaries only | `global` | `jurisdictions.summaries.v1` / 3, one per source region |

Each cluster is one broker/RF1. Identical topic names share no data. A partition is not a jurisdiction, failure domain or backup. Ordering is per partition, not global. Added partitions change placement; registry/partition changes require migration, not environment overrides.

## Export policy

Regional consumers replay complete raw history into partition counters. Exporters construct cumulative snapshots from **only**:

| Field | Meaning |
| --- | --- |
| `region` | Source label |
| `partition` | Regional partition 0…2 |
| `sourceOffset` | Last consumed raw offset, decimal string |
| `count` | Unique applied operation count |
| `totalAmount` | Sum of synthetic units |

Key is `region:partition`; each region uses its designated global partition. Global projection replaces totals only with the highest source offset per regional partition; it never adds successive snapshots. Duplicate exports/replay therefore do not double-count. Different logs' offsets are incomparable; freshness is per source partition.

This is asynchronous allowlisted federation, not MirrorMaker, cluster linking, raw replication or distributed transaction. Raw log is the outbox; replay regenerates latest snapshots. Global outage does not block regional consumption/writes; its retained view is stale, not current regional truth.

Even counts/totals can identify small populations. Production needs jurisdiction-specific export approval, aggregation thresholds, authorization, audit and privacy review. Network separation is not field-policy enforcement.

## Failures

```bash
./labs/run jurisdictions outage eu
./labs/run jurisdictions recover eu
./labs/run jurisdictions outage global
./labs/run jurisdictions recover global
```

During EU outage, preflight refuses new EU publication with 503 `outcome: not-attempted`; US/APAC continue. **No alternate-region placement.** After recovery EU writes can resume. Global outage instead makes exporters unavailable; recovery catches up latest snapshots.

In-flight acknowledgment failure differs from preflight refusal: outcome is **unknown**, with no rollback guarantee. Keep/look up the stable ID before retrying.

## API and inspection reference

```bash
APP=$(./labs/run jurisdictions urls --json | jq -r .app)
curl -fsS "$APP/api/events" -H 'Content-Type: application/json' \
  -d '{"id":"example-eu-001","tenantId":"berlin-shop","amount":125,"privateNote":"Synthetic reference only"}'
curl -fsS "$APP/api/operations/eu/example-eu-001"
curl -fsS "$APP/api/state" | jq .global
just rpk jurisdictions eu topic describe jurisdictions.records.v1 -p
just rpk jurisdictions global topic describe jurisdictions.summaries.v1 -p
```

`id`: 1–100 letters/digits/underscores/hyphens. `amount`: integer 1–1,000,000 synthetic units. `privateNote`: string ≤240 characters. Unknown tenants fail. Optional `requestedRegion` must equal registry residency; mismatch returns 409 before publication. Regional endpoint independently checks home region.

| Endpoint | Contract |
| --- | --- |
| `POST /api/events` | 200 applied, 202 pending, 400 input, 409 ID/region conflict, 503 unavailable/unknown ack |
| `GET /api/operations/REGION/ID` | Home operation/placement; 404 not observed by running projection, not proof of non-publication |
| `GET /api/state` | Registry, regional availability/projections, export state, global summaries |
| `GET /health` | Gateway readiness only; state reports clusters |

When home service/broker are available, identical ID/input returns existing operation without a write; changed input conflicts, including races. IDs deduplicate **within jurisdiction**, not across regions. Replay deduplicates raw IDs and fails on conflicting authoritative records. One regional service per cluster is assumed.

Unknown operation: inspect home logs/topic; after broker recovery, restart that regional service for complete replay before interpreting absence or retrying original ID/input. Browser blocks submissions while unresolved and keeps ID only on the current page, not across reloads.

```bash
just logs jurisdictions region-eu
just restart jurisdictions region-eu
just restart jurisdictions global
```

Inspection services: `app`, `region-eu`, `region-us`, `region-apac`, `global`, `broker-eu`, `broker-us`, `broker-apac`, `broker-global`. `rpk` requires region first. Only gateway is published; Kafka/Admin stay on owned networks. Initial `LAB_PORT_BASE` accepts 49152–65535; saved port persists until successful disposal. See [commands](../reference/commands.md).

## Verify and dispose

**`just test jurisdictions` deletes existing history**, provisions fresh, checks raw placement/order, duplicate/conflicting input, wrong-region refusal, summaries, regional outage, export outage/catch-up and regional/global replay, then disposes and writes an external replayable report. `just check jurisdictions` performs static checks; `just down jurisdictions` deletes all four owned broker volumes/containers/networks, not shared images.

Topic history has no time/size limit for complete experimental replay. Dispose afterward; this is not bounded production retention. Real operation needs geographic failure domains, regional quorums, TLS/auth/ACLs, authorized registry migrations, enforced export policy, backups, fencing and measured recovery. The lab refuses invalid cross-jurisdiction failover; it does not make that failover safe. See [production and recovery](../explanation/production.md).
