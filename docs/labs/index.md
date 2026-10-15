---
description: Find a hands-on event-streaming lab for the application behavior you'd like to explore.
---

# Choose a lab

Choose a question that interests you, then follow its guide to try the workflow. The [explorer](../tutorials/first-event.md) is a good starting point for partitions and consumer lag. For application state, [follow a command through replay](../tutorials/command-and-replay.md) before moving on to a domain lab. You'll meet a fictional organization in each one.

<div class="grid cards" markdown>

-   :lucide-radio: **[Event explorer](../tutorials/first-event.md)**

    Where did my event go, and why is the consumer behind? Operate Signal Harbor Works' event workbench, Console and telemetry.

-   :lucide-thermometer: **[IoT monitoring](./iot.md)**

    Can an older sensor reading overwrite a newer one? Inspect Cryowell Instruments' device history and alert transitions.

-   :lucide-credit-card: **[Point of sale](./pos.md)**

    Is a receipt the same thing as a settled payment? Try Counterlane Market's cash ledger and optional sandbox payments.

-   :lucide-truck: **[Logistics dispatch](./logistics.md)**

    Who owns an assignment when two requests compete? Dispatch Wayline's drivers and follow the trip lifecycle.

-   :lucide-history: **[Append-only event log](./event-log.md)**

    Can I reconstruct accepted and rejected decisions exactly? Work at Folio Harbor Archives' item desk and execution ledger.

-   :lucide-shield: **[Network SIEM](./siem.md)**

    What makes a late observation change an incident? Triage Vesper Lantern Networks' synthetic telemetry and incident evidence.

-   :lucide-newspaper: **[Activity and clickstream](./activity.md)**

    What does a recorded article open actually measure? Read Commonfield Dispatch's public feed and inspect its reading analytics.

-   :lucide-box: **[Retail inventory](./inventory.md)**

    How do reservations differ from stock on hand? Receive, reserve, fulfill and transfer stock at Cedarline Supply.

-   :lucide-landmark: **[Fraud and clearing](./clearing.md)**

    When is a held transfer allowed to move booked funds? Review Northbridge Ledgerworks' exact-cent local clearing.

-   :lucide-chart-candlestick: **[Commodity trading](./trading.md)**

    How do price, priority and partial fills interact? Use Amber Commodity Exchange's Rust CLI and web order book.

-   :lucide-chart-line: **[Bitcoin paper research](./bitcoin.md)**

    How do fees and next-close execution affect a paper strategy? Replay Beacon Ridge Research's fixed historical candles and paper account.

-   :lucide-clapperboard: **[Sports streaming](./sports.md)**

    Which failures belong to video, and which belong to scores? Explore Courtside Assembly's synthetic clips and event-driven control plane.

-   :lucide-workflow: **[Agent messaging with fx](./agent-messaging.md)**

    What survives when an agent or inference attempt stops? Follow Relay Loom Cooperative's planner/reviewer tasks using real `fx`.

-   :lucide-clock: **[Scheduled agent chat](./agent-chat.md)**

    Who runs a future prompt, and what does cancellation mean? Schedule one-shot jobs in Clockwork Correspondence.

-   :lucide-globe: **[Data sovereignty](./sovereignty.md)**

    Who controls resident data, and what may cross a regional boundary? Inspect Meridian Ledger Alliance's home-region logs, approved summaries and local recovery.

-   :lucide-file-check: **[Reviewed infrastructure](./terraform.md)**

    Does an approved plan still describe the intended resources? Review Foundry Harbor Infrastructure's saved plans, drift and teardown.

</div>

## Run one workflow

Meet the [host prerequisites](../reference/commands.md), then run these commands from the checkout root:

```bash
nix develop --no-update-lock-file
just up iot
just urls iot
```

Open the printed app URL and follow its guide. To inspect the application, or restart it so it rebuilds its state from the retained log:

```bash
just logs iot app
just rpk iot topic describe iot.events.v1
just restart iot app
```

Restart keeps broker data. **`just down iot` deletes it.** Labs own separate runtime resources; do not use global Podman pruning to clean up one lab.

The explorer and Terraform use three brokers; data sovereignty uses four independent clusters. Other labs use one broker and an ordered topic. All run on one host. Terraform also requires plan review before apply or destroy, and its Podman socket grants host-user authority. Read its guide first.

## Read the results

Topic
:   A named log in a Redpanda cluster. Separate clusters can have the same topic name without sharing records.

Partition and offset
:   A partition is one ordered sequence within a topic. An offset locates a record in that sequence. Offsets from different partitions are not a shared clock.

Replication factor
:   The number of replicas for each partition. RF1 means one copy; RF3 means three. Three containers on one workstation still share its host failure.

Projection
:   Application state derived by consuming records. Most domain labs keep it in memory and rebuild it from the complete retained log at startup.

Receipt
:   An application's recorded outcome for a command. Read the guide to distinguish a consumed decision from an append acknowledgment or an external effect.

Use the [delivery explanation](../explanation/telemetry-and-delivery.md) to make sense of the explorer's counters and committed lag. For a business decision, look at the lab's receipt and revision as well as its offset. Each guide explains how those pieces fit together and what to do when a result is uncertain.

## Keep history or dispose of it

Ordinary application labs rebuild from the complete topic prefix. They disable time/size expiration and compaction; disk and projection memory grow until explicit disposal or resource exhaustion. Startup reapplies retention to older ordinary topics but cannot recover records already deleted. Explorer has a separate six-hour event window. See [topic policy](../reference/tuning.md#topic-policy) before changing retention or partition count.

Keep command IDs and their original input when investigating an uncertain result. A broker acknowledgment tells you about publication; the lab's receipt and recovery procedure help you establish what the application did. External effects, such as payments or model calls, need their own evidence.

For validation commands and their disposal rules, see [commands](../reference/commands.md). To explore how the workflow could grow into a production system, read its [blueprint](../blueprints/index.md). These are design proposals you can compare with the running lab.
