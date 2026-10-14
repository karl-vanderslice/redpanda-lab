# Multi-jurisdiction lab

Explore jurisdiction sharding separately from Kafka partitioning. EU, US and APAC use independent home clusters with three tenant-keyed partitions each. A fourth cluster receives only explicitly constructed aggregate snapshots. The operator web page shows placement, raw regional fixtures, export progress and the global projection.

From the repository root:

```bash
nix develop --no-update-lock-file
just up jurisdictions
just urls jurisdictions
```

Open the printed loopback URL and publish a synthetic tenant record. The server-owned registry determines its home region. Inspect its private note in the regional view, then compare the global table, which has no tenant IDs or notes.

```bash
./labs/run jurisdictions outage eu
./labs/run jurisdictions recover eu
just rpk jurisdictions eu topic describe jurisdictions.records.v1 -p
just rpk jurisdictions global topic describe jurisdictions.summaries.v1 -p
just down jurisdictions
```

`down` deletes this lab's four broker volumes. `just test jurisdictions` also deletes existing history before its real workflow. `just check jurisdictions` runs source, packaging and documentation gates.

Read the [architecture walkthrough](../../docs/labs/jurisdictions.md) for fixture residency, hash placement, export schema, API usage, global outages, acknowledgement uncertainty and replay. All containers run on one host with development settings and replication factor 1. This is not geographic isolation, a compliance guarantee, tenant authorization or disaster recovery. Use synthetic data only.
