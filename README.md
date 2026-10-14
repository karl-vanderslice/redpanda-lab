# Redpanda Lab

Run a local application, follow its records in Redpanda, and see what survives a restart.

## Start the explorer

Requires Linux, Nix with flakes, and a host configured for rootless Podman: user namespaces, subordinate UID/GID mappings and cgroup delegation. Nix supplies the user-space tools. Allow several GiB of free RAM for the three-broker explorer; start with one lab. The first build downloads dependencies and images.

From the checkout root:

```bash
nix develop --no-update-lock-file
just up
just urls
```

Open the printed **Stream app** URL. Publish an event, find it in Redpanda Console, then pause the shared consumer to build lag. Follow [your first event](docs/tutorials/first-event.md) for the walkthrough.

Keeping an older explorer's telemetry? [Back it up before upgrading](docs/how-to/failure-and-recovery.md#upgrade-retained-telemetry). `up` preserves volumes; a new Grafana version can migrate them.

When finished:

```bash
just down
```

**`down` deletes the selected lab's records and telemetry volumes**, along with its containers and network. It is disposal, not a recoverable stop. Other labs and reusable upstream/Nix caches remain.

## Choose a lab

For a named lab, use `just up iot`, `just urls iot` and `just down iot`. Each has its own runtime and data. All organizations below are fictional; Redpanda and the other tools retain their actual names.

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
| [`jurisdictions`](docs/labs/jurisdictions.md) | Meridian Ledger Alliance | Regional raw logs and summary-only federation. |
| [`terraform`](docs/labs/terraform.md) | Foundry Harbor Infrastructure | Reviewed plans, drift and teardown. Read its guide before granting Podman socket access. |

Local workflows need no API keys. POS's optional Stripe/Square paths require server-side **sandbox** credentials and network access; credential-dependent behavior remains unverified. No lab moves live funds or places real market orders. Use synthetic data only.

## Find your next step

- [Commands and ports](docs/reference/commands.md): status, logs, restarts and destructive test commands.
- [Troubleshooting](docs/how-to/troubleshooting.md): startup failures and uncertain writes.
- [Architecture](docs/explanation/architecture.md) and [delivery](docs/explanation/telemetry-and-delivery.md): what records, counters and acknowledgments mean.
- [Tuning and storage limits](docs/reference/tuning.md): retention, resources and client-specific settings.
- [Production and recovery](docs/explanation/production.md) and [blueprints](docs/blueprints/index.md): operational gaps and proposed systems, not deployed infrastructure.

Build the docs with `just docs`; preview them with `just docs-serve`. Both keep generated output outside the checkout. [Build options](docs/reference/commands.md#documentation) include an explicit external output directory.

Ports are loopback-only and unauthenticated. Development-mode brokers on one host do not prove production durability or geographic resilience. [Supply-chain notes](docs/reference/supply-chain.md) distinguish pinned inputs from reproducible builds and describe dependency licenses.

First-party code is [MIT licensed](LICENSE). Dependencies retain their own licenses; the repository grants no rights to third-party media.
