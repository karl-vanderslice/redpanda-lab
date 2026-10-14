# Choose a lab

Start with the [explorer](../tutorials/first-event.md) to learn partitions and consumer lag. Choose a domain below to follow an application's decisions through its log. Every organization is fictional.

| Command name | Organization | Workflow |
| --- | --- | --- |
| `explorer` | [Signal Harbor Works](../tutorials/first-event.md) | Publish records, pause consumption and inspect offsets. |
| `iot` | [Cryowell Instruments](./iot.md) | Sensor readings, device history and temperature/battery alerts. |
| `pos` | [Counterlane Market](./pos.md) | Baskets, receipts, refunds and optional sandbox payments. |
| `logistics` | [Wayline Dispatch](./logistics.md) | Driver positions, assignment, pickup, completion and cancellation. |
| `event-log` | [Folio Harbor Archives](./event-log.md) | Work-item execution records and full projection rebuild. |
| `siem` | [Vesper Lantern Networks](./siem.md) | Authentication/flow correlation, incident evidence and review. |
| `activity` | [Commonfield Dispatch](./activity.md) | Posts, follows, likes, reads and distinct-reader analytics. |
| `inventory` | [Cedarline Supply](./inventory.md) | Stock movements, reservations, fulfillment and transfers. |
| `clearing` | [Northbridge Ledgerworks](./clearing.md) | Screening, held obligations, review and exact-cent local clearing. |
| `trading` | [Amber Commodity Exchange](./trading.md) | Rust CLI/web orders, matching, partial fills and cancellation. |
| `bitcoin` | [Beacon Ridge Research](./bitcoin.md) | Historical candles, strategies and paper-account results. |
| `sports` | [Courtside Assembly](./sports.md) | Scores, watchlists, original synthetic video and playback events. |
| `agent-messaging` | [Relay Loom Cooperative](./agent-messaging.md) | Planner/reviewer agents invoking real `fx` with a local model. |
| `agent-chat` | [Clockwork Correspondence](./agent-chat.md) | Conversations, future jobs, cancellation and recovery. |
| `jurisdictions` | [Meridian Ledger Alliance](./jurisdictions.md) | Resident raw logs and a summary-only global projection. |
| `terraform` | [Foundry Harbor Infrastructure](./terraform.md) | Reviewed plans, drift and teardown. |

## Run one workflow

Meet the [host prerequisites](../reference/commands.md), then run these commands from the checkout root:

```bash
nix develop --no-update-lock-file
just up iot
just urls iot
```

Open the printed app URL and follow its guide. To inspect or rebuild that application:

```bash
just logs iot app
just rpk iot topic describe iot.events.v1
just restart iot app
```

Restart keeps broker data. **`just down iot` deletes it.** Labs own separate runtime resources; do not use global Podman pruning to clean up one lab.

The explorer and Terraform use three brokers; jurisdictions uses four independent clusters. Other labs use one broker and an ordered topic. All run on one host. Terraform also requires plan review before apply or destroy, and its Podman socket grants host-user authority. Read its guide first.

## Keep history or dispose of it

Ordinary application labs rebuild from the complete topic prefix. They disable time/size expiration and compaction; disk and projection memory grow until explicit disposal or resource exhaustion. Startup reapplies retention to older ordinary topics but cannot recover records already deleted. Explorer has a separate six-hour event window. See [topic policy](../reference/tuning.md#topic-policy) before changing retention or partition count.

Each guide owns its command IDs, replay rules and uncertain-result procedure. A broker acknowledgment does not establish consumer completion or an external effect. Payments, models, media, schedulers and physical operations retain their own responsibilities.

For validation commands and their disposal rules, see [commands](../reference/commands.md). For a proposed production design, see the corresponding [blueprint](../blueprints/index.md); none is a deployed production system.
