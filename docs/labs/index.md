# Choose a lab

Start with the [explorer](../tutorials/first-event.md) for partitions and consumer lag. Pick a domain below to see how an application uses the log.

| Lab | What you operate |
| --- | --- |
| [IoT monitoring](iot.md) | Sensor readings, device history and temperature/battery alerts. |
| [Point of Sale](pos.md) | Baskets, receipts, refunds and optional sandbox payments. |
| [Logistics dispatch](logistics.md) | Driver positions, assignment, pickup, completion and cancellation. |
| [Commodity trading](trading.md) | Rust CLI/web orders, matching and cancellation. |
| [Bitcoin paper trading](bitcoin.md) | Historical candles, strategies and paper-account results. |
| [Sports streaming](sports.md) | Scores, watchlists, synthetic video and playback events. |
| [Agent messaging](agent-messaging.md) | Planner and reviewer, each invoking real `fx` with a local model. |
| [Scheduled agent chat](agent-chat.md) | Conversations, future jobs and cancellation. |
| [Jurisdiction sharding](jurisdictions.md) | Regional raw logs and a summary-only global projection. |
| [Terraform cluster](terraform.md) | Reviewed plans, infrastructure drift and teardown. |

## Run, inspect, dispose

```bash
nix develop --no-update-lock-file
just up iot
just urls iot
just logs iot app
just rpk iot topic describe iot.events.v1
just restart iot app
just down iot
```

Each lab owns its containers, network, ports and data. **`down` deletes that lab's history.** The ordinary application labs use one broker and one ordered topic. Explorer/Terraform use three brokers; jurisdictions uses four independent clusters. All run on the same host with development settings, not geographic failure isolation.

**Terraform requires plan review before apply or destroy.** Its Podman socket has the host user's authority. Read its guide before starting.

## What the log proves

Applications rebuild their views from real broker records. An HTTP response or producer acknowledgement is not proof of consumer completion. Each guide explains operation IDs, replay and uncertain outcomes.

Other work stays with its owner: the model generates answers, the sports server streams original synthetic clips, the scheduler checks due jobs, and payment providers process sandbox payments. No lab supplies production authorization, settlement, compliance or disaster recovery.

The pages use local assets, keyboard controls and optional browser storage. IoT, POS and logistics share compact neutral layouts with blue accents. All new pages offer light/dark themes, initially following the system.

## Verify

`just check LAB` validates sources and packaging, then builds the docs. `just check` covers all labs.

**`just test LAB` discards existing application history**, starts a fresh real workflow and disposes it afterward. Terraform instead requires empty owned state and retains failed deployments. Reports remain outside the checkout. See [commands](../reference/commands.md) and [production boundaries](../explanation/production.md).
