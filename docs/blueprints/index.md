# Production blueprints

These drawings describe proposed production systems for fictional organizations. No identity service, distributed fence, external adapter, archive, database or availability-zone boundary becomes deployed by publishing a diagram. Dashed boxes name responsibility or trust boundaries, not verified network controls. Muted blue identifies Redpanda, not measured health.

| System | Blueprint |
| --- | --- |
| Explorer | [Signal Harbor Works](./explorer.md) |
| Device telemetry | [Cryowell Instruments](./iot.md) |
| Point of sale | [Counterlane Market](./pos.md) |
| Fleet dispatch | [Wayline Dispatch](./logistics.md) |
| Append-only event log | [Folio Harbor Archives](./event-log.md) |
| Network SIEM | [Vesper Lantern Networks](./siem.md) |
| Public activity and clickstream | [Commonfield Dispatch](./activity.md) |
| Retail inventory | [Cedarline Supply](./inventory.md) |
| Commodity matching | [Amber Commodity Exchange](./trading.md) |
| Bitcoin paper research | [Beacon Ridge Research](./bitcoin.md) |
| Sports media | [Courtside Assembly](./sports.md) |
| Agent messaging | [Relay Loom Cooperative](./agent-messaging.md) |
| Scheduled agent chat | [Clockwork Correspondence](./agent-chat.md) |
| Resident data and summaries | [Meridian Ledger Alliance](./jurisdictions.md) |
| Infrastructure provisioning | [Foundry Harbor Infrastructure](./terraform.md) |
| Fraud screening and clearing | [Northbridge Ledgerworks](./clearing.md) |

## Deployment assumptions

Proposed RF3 means one replica per partition in each of three independent availability zones within a region, not three regions or demonstrated disaster recovery. Jurisdictions proposes separate resident clusters and a summary cluster, each with its own local three-zone placement. Current lab containers share one host and use development mode. A production owner must remove development mode and unsafe fsync bypass, review supported XFS/ext4 storage, and test failure/recovery behavior before claiming durability.

Platform operations must own TLS/SASL/ACLs, application and operator identities, quotas, secrets, disk capacity, lag/readiness, schema changes and restore objectives. Distributed ownership needs an enforceable lease/epoch with stale-writer rejection; a process-local queue or diagram label is not fencing. Replication does not protect against malicious deletion, correlated loss or uncertain external effects. No enterprise feature or license entitlement is assumed.

Domain authority remains ordered and scoped. More partitions do not safely parallelize coordinated stock transfers, matching, assignment or clearing. Topic/key, checkpoint, event-schema and identity changes require reviewed migrations. Each guide names the critical transition or external-effect boundary; [production and recovery](../explanation/production.md) covers wider operational gaps.

Ordinary application topics currently use one partition, RF1, delete cleanup and unlimited time/byte retention. They require a complete prefix until disposal; unbounded disk and memory growth is not an archive. Explorer separately uses six partitions, RF3 and six-hour retention. Local RF3 is still not independent failure isolation.

## Sources and regeneration

Portable D2 sources in `docs/blueprints/sources` import the shared [schematic profile](profiles/schematic.d2). The Nix-owned renderer pins D2 0.9.0, ELK, theme 0 and 32-pixel padding, without sketch mode. Embedded monospace labels distinguish topic versions and partition digits. Opaque connection labels keep boundary strokes off the text. Sources contain no remote fonts, images or private paths.

From the checkout, render all sixteen pairs to an external directory:

```bash
output="$(mktemp -d "${TMPDIR:-/tmp}/redpanda-blueprints.XXXXXXXX")"
bash scripts/diagrams "$output"
```

The direct CLI is `diagram-render SOURCE.d2 OUTPUT-STEM` inside the Nix development shell; its output directory must already exist. Use an external output stem. SVG and PNG are rendered once each and published only after both commands succeed. Their final renames are individually atomic, not a crash-atomic pair; rerender after an interrupted publication. No font files or generated SVG/PNG belong in the checkout.

The strict documentation build generates both formats under its external stage at `docs/assets/blueprints`. SVG embeds WOFF for offline viewing; use the adjacent PNG if a viewer ignores embedded fonts. Before publication, review glyphs, labels, clipping and arrow endpoints in both themes and at enlarged text. Rendering alone is not visual approval.

Exports include the [Source Code Pro OFL 1.1 notice](../assets/blueprints/Source-Code-Pro-OFL.txt) and [attribution](../assets/blueprints/Source-Code-Pro-attribution.txt). D2 supplies the embedded face. No separate font package or standalone font copy is required.
