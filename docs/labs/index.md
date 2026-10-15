---
description: Find a hands-on event-streaming lab for the application behavior you'd like to explore.
---

# Choose a lab

Choose a question that interests you, then follow its guide to try the workflow. The [explorer](../tutorials/first-event.md) is a good starting point for partitions and consumer lag. For application state, [follow a command through replay](../tutorials/command-and-replay.md) before moving on to a domain lab. You'll meet a fictional organization in each one.

| Question to explore | Lab | What you operate |
| --- | --- | --- |
| Where did my event go, and why is the consumer behind? | [Explorer](../tutorials/first-event.md) | Signal Harbor Works' event workbench, Console and telemetry. |
| Can an older sensor reading overwrite a newer one? | [IoT](./iot.md) | Cryowell Instruments' device history and alert transitions. |
| Is a receipt the same thing as a settled payment? | [Point of sale](./pos.md) | Counterlane Market's cash ledger and optional sandbox payments. |
| Who owns an assignment when two requests compete? | [Logistics](./logistics.md) | Wayline Dispatch's drivers and trip lifecycle. |
| Can I reconstruct accepted and rejected decisions exactly? | [Event log](./event-log.md) | Folio Harbor Archives' work items and execution ledger. |
| What makes a late observation change an incident? | [Network SIEM](./siem.md) | Vesper Lantern Networks' synthetic telemetry and incident evidence. |
| What does a recorded article open actually measure? | [Activity](./activity.md) | Commonfield Dispatch's public profiles, feed and reading analytics. |
| How do reservations differ from stock on hand? | [Inventory](./inventory.md) | Cedarline Supply's receipts, reservations, fulfillment and transfers. |
| When is a held transfer allowed to move booked funds? | [Clearing](./clearing.md) | Northbridge Ledgerworks' review and exact-cent local clearing. |
| How do price, priority and partial fills interact? | [Trading](./trading.md) | Amber Commodity Exchange's Rust CLI and web order book. |
| How do fees and next-close execution affect a paper strategy? | [Bitcoin](./bitcoin.md) | Beacon Ridge Research's fixed historical candles and paper account. |
| Which failures belong to video, and which belong to scores? | [Sports](./sports.md) | Courtside Assembly's synthetic clips and event-driven control plane. |
| What survives when an agent or inference attempt stops? | [Agent messaging](./agent-messaging.md) | Relay Loom Cooperative's planner/reviewer tasks using real `fx`. |
| Who runs a future prompt, and what does cancellation mean? | [Scheduled chat](./agent-chat.md) | Clockwork Correspondence's conversations and one-shot jobs. |
| What can a global summary reveal or recover? | [Jurisdictions](./jurisdictions.md) | Meridian Ledger Alliance's resident logs and summary-only federation. |
| Does an approved plan still describe the intended resources? | [Terraform](./terraform.md) | Foundry Harbor Infrastructure's saved plans, drift and teardown. |

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

The explorer and Terraform use three brokers; jurisdictions uses four independent clusters. Other labs use one broker and an ordered topic. All run on one host. Terraform also requires plan review before apply or destroy, and its Podman socket grants host-user authority. Read its guide first.

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
