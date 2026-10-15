# Redpanda Lab

Explore event streaming by running a small application and following the records behind its decisions. Publish an event, try a workflow, then restart the app to see how it recovers. The labs use real Redpanda brokers with fictional organizations and synthetic data. [Read the guide](https://karl-vanderslice.github.io/redpanda-lab/).

## Start the explorer

You'll need Linux, Nix with flakes, and a host configured for rootless Podman (user namespaces, subordinate UID/GID mappings and cgroup delegation). Nix supplies the user-space tools. Start with one lab and allow several GiB of free RAM for the three-broker explorer. The first build downloads dependencies and images.

Get the source, then enter its locked development shell:

```bash
git clone https://github.com/karl-vanderslice/redpanda-lab.git
cd redpanda-lab
```

```bash
nix develop --no-update-lock-file
```

At the new shell prompt, run:

```bash
just up
just urls
```

Open the printed **Stream app** URL. Publish an event, find it in Redpanda Console, then pause the shared consumer to build lag. Follow [your first event](docs/tutorials/first-event.md) for the walkthrough.

Once you've explored the stream, [follow an application command through replay](docs/tutorials/command-and-replay.md). You'll create a work item, read the receipt for a decision, and watch the app rebuild its view from the broker.

Keeping an older explorer's telemetry? [Back it up before upgrading](docs/how-to/failure-and-recovery.md#upgrade-retained-telemetry). `up` preserves volumes; a new Grafana version can migrate them.

When finished:

```bash
just down
```

**`down` permanently deletes the selected lab's records and telemetry volumes**, along with its containers and network. Leave the lab running if you'd like to keep its history. Other labs and reusable upstream/Nix caches remain.

## Choose a lab

Pick a workflow that interests you. For a named lab, use `just up iot`, `just urls iot` and `just down iot`. Each has its own runtime and data. The organizations below are fictional; the technology names are real.

| Lab | Organization | Try |
| --- | --- | --- |
| [`explorer`](docs/tutorials/first-event.md) | Signal Harbor Works | Partitions, committed lag, Grafana and broker failure. |
| [`iot`](docs/labs/iot.md) | Cryowell Instruments | Sensor readings, device history and alerts. |
| [`pos`](docs/labs/pos.md) | Counterlane Market | Baskets, cash checkout, refunds and optional sandbox payments. |
| [`logistics`](docs/labs/logistics.md) | Wayline Dispatch | Driver positions, assignment, pickup and delivery. |
| [`event-log`](docs/labs/event-log.md) | Folio Harbor Archives | An append-only execution ledger and state rebuild. |
| [`siem`](docs/labs/siem.md) | Vesper Lantern Networks | Synthetic telemetry, correlation and incident evidence. |
| [`activity`](docs/labs/activity.md) | Commonfield Dispatch | Posts, follows, likes and reading analytics. |
| [`inventory`](docs/labs/inventory.md) | Cedarline Supply | Stock, reservations, fulfillment and transfers. |
| [`clearing`](docs/labs/clearing.md) | Northbridge Ledgerworks | Held transfers, review and exact-cent local clearing. |
| [`trading`](docs/labs/trading.md) | Amber Commodity Exchange | Rust CLI/web orders, matching and cancellation. |
| [`bitcoin`](docs/labs/bitcoin.md) | Beacon Ridge Research | Historical prices and paper-account strategies. |
| [`sports`](docs/labs/sports.md) | Courtside Assembly | Scores, watchlists, synthetic video and playback events. |
| [`agent-messaging`](docs/labs/agent-messaging.md) | Relay Loom Cooperative | Planner/reviewer agents using real `fx` and local inference. |
| [`agent-chat`](docs/labs/agent-chat.md) | Clockwork Correspondence | Local model chat, future jobs and cancellation. |
| [`sovereignty`](docs/labs/sovereignty.md) | Meridian Ledger Alliance | Data sovereignty: resident raw logs and approved summary exports. |
| [`terraform`](docs/labs/terraform.md) | Foundry Harbor Infrastructure | Reviewed plans, drift and teardown. Read its guide before granting Podman socket access. |

You can explore the local workflows without API keys. For payments, begin with cash; the optional Stripe/Square paths need server-side **sandbox** credentials and network access, and their credential-dependent behavior remains unverified. All funds and market orders in the labs are simulated. Use synthetic data only.

## Find your next step

- [Commands and ports](docs/reference/commands.md): status, logs, restarts and destructive test commands.
- [Troubleshooting](docs/how-to/troubleshooting.md): startup failures and uncertain writes.
- [Architecture](docs/explanation/architecture.md) and [delivery](docs/explanation/telemetry-and-delivery.md): what records, counters and acknowledgments mean.
- [Tuning and storage limits](docs/reference/tuning.md): retention, resources and client-specific settings.
- [Production and recovery](docs/explanation/production.md) and [blueprints](docs/blueprints/index.md): proposed designs and the operational work needed to put them into service.

Build the docs with `just docs`; preview them with `just docs-serve`. Both keep generated output outside the checkout. [Build options](docs/reference/commands.md#documentation) include an explicit external output directory.

The labs listen on unauthenticated loopback ports and run development-mode brokers on one host. They're a place to explore behavior; production durability and geographic resilience need separate infrastructure and verification. [Supply-chain notes](docs/reference/supply-chain.md) explain the pinned inputs, build-reproducibility limits and dependency licenses.

First-party code is [MIT licensed](LICENSE). Dependencies keep their own licenses, and third-party media rights require separate permission.
