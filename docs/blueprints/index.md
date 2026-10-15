# Production blueprints

These blueprints explore how the local workflows could grow into production systems for the fictional organizations. Use them to follow data through a larger system and discuss who would own each part. The identity services, writer fences, adapters, archives, databases and availability-zone placements shown here are proposed work. Dashed boxes mark responsibility or trust boundaries that would need enforcement in a deployment. Muted blue identifies Redpanda components; health would come from runtime measurements.

Choose a system below to open its interactive canvas. Each drawing has zoom, pan and an expanded view, with the D2 source and original SVG/PNG exports alongside it.

<div class="grid cards blueprint-gallery" markdown>

-   **Signal Harbor Works**

    [![Open the explorer blueprint](../assets/blueprints/explorer.png){ loading=lazy width="480" height="270" }](./explorer.md)

    Event admission, partitioned delivery and live telemetry.

-   **Cryowell Instruments**

    [![Open the device telemetry blueprint](../assets/blueprints/iot.png){ loading=lazy width="480" height="270" }](./iot.md)

    Device telemetry, sequence validation and alert delivery.

-   **Counterlane Market**

    [![Open the point-of-sale blueprint](../assets/blueprints/pos.png){ loading=lazy width="480" height="270" }](./pos.md)

    Point of sale, payment attempts and provider reconciliation.

-   **Wayline Dispatch**

    [![Open the fleet dispatch blueprint](../assets/blueprints/logistics.png){ loading=lazy width="480" height="270" }](./logistics.md)

    Fleet dispatch, position observations and trip ownership.

-   **Folio Harbor Archives**

    [![Open the append-only event log blueprint](../assets/blueprints/event-log.png){ loading=lazy width="480" height="270" }](./event-log.md)

    Append-only decisions, materialized views and independent recovery.

-   **Vesper Lantern Networks**

    [![Open the network SIEM blueprint](../assets/blueprints/siem.png){ loading=lazy width="480" height="270" }](./siem.md)

    Network SIEM, correlation evidence and analyst workflows.

-   **Commonfield Dispatch**

    [![Open the public activity and clickstream blueprint](../assets/blueprints/activity.png){ loading=lazy width="480" height="270" }](./activity.md)

    Public publishing, reading feeds and consent-aware clickstream.

-   **Cedarline Supply**

    [![Open the retail inventory blueprint](../assets/blueprints/inventory.png){ loading=lazy width="480" height="270" }](./inventory.md)

    Retail inventory, reservations and shipment reconciliation.

-   **Amber Commodity Exchange**

    [![Open the commodity matching blueprint](../assets/blueprints/trading.png){ loading=lazy width="480" height="270" }](./trading.md)

    Commodity matching, market-data views and settlement ownership.

-   **Beacon Ridge Research**

    [![Open the Bitcoin paper research blueprint](../assets/blueprints/bitcoin.png){ loading=lazy width="480" height="270" }](./bitcoin.md)

    Bitcoin paper research, market-data provenance and strategy state.

-   **Courtside Assembly**

    [![Open the sports media blueprint](../assets/blueprints/sports.png){ loading=lazy width="480" height="270" }](./sports.md)

    Sports media delivery, score authority and viewer telemetry.

-   **Relay Loom Cooperative**

    [![Open the agent messaging blueprint](../assets/blueprints/agent-messaging.png){ loading=lazy width="480" height="270" }](./agent-messaging.md)

    Agent messaging, role handoffs and interrupted inference.

-   **Clockwork Correspondence**

    [![Open the scheduled agent chat blueprint](../assets/blueprints/agent-chat.png){ loading=lazy width="480" height="270" }](./agent-chat.md)

    Scheduled agent chat, execution ownership and retained replies.

-   **Meridian Ledger Alliance**

    [![Open the data sovereignty blueprint](../assets/blueprints/sovereignty.png){ loading=lazy width="480" height="270" }](./sovereignty.md)

    Data sovereignty, approved summary exports and region-local recovery.

-   **Foundry Harbor Infrastructure**

    [![Open the infrastructure provisioning blueprint](../assets/blueprints/terraform.png){ loading=lazy width="480" height="270" }](./terraform.md)

    Reviewed infrastructure provisioning and separate broker-data recovery.

-   **Northbridge Ledgerworks**

    [![Open the fraud screening and clearing blueprint](../assets/blueprints/clearing.png){ loading=lazy width="480" height="270" }](./clearing.md)

    Fraud screening, held obligations and clearing authority.

</div>

## Deployment assumptions

The proposed RF3 placement gives each partition one replica in each of three independent availability zones within a single region. The data sovereignty blueprint applies that placement separately to its resident clusters and summary cluster. Regional disaster recovery needs its own design and rehearsal. The running labs use development-mode containers on one host; before claiming production durability, remove development mode and unsafe fsync bypass, review supported XFS/ext4 storage, and test failure and recovery.

Platform operations would own TLS/SASL/ACLs, application and operator identities, quotas, secrets, disk capacity, lag/readiness, schema changes and restore objectives. Distributed ownership needs an enforceable lease/epoch with stale-writer rejection. Plan separately for malicious deletion, correlated loss and uncertain external effects, since replication alone cannot resolve them. Check licensing before choosing enterprise features; the proposals assume no enterprise entitlement.

Domain decisions still need a clear owner. Stock transfers, matching, assignment and clearing coordinate state that must stay consistent when you add partitions. Review topic/key, checkpoint, event-schema and identity changes as migrations. Each guide identifies the transition or external effect to protect; [production and recovery](../explanation/production.md) connects these details to wider operations.

For comparison, ordinary application topics currently use one partition, RF1, delete cleanup and unlimited time/byte retention. They rebuild from the complete prefix until disposal, with growing disk and memory use. An independent archive would need separate storage and recovery procedures. The explorer uses six partitions, RF3 and six-hour retention, still within one host's failure domain.

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
