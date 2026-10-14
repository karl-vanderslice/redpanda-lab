# Redpanda Lab

A collection of disposable, local systems built around Redpanda. The repository includes an event-stream explorer and seven independent labs: a commodity exchange, a sports portal, two coordinating agents, scheduled agent chat, a Bitcoin paper trader, a Terraform-managed cluster, and a multi-jurisdiction sharding experiment.

These are working applications, not deployment templates. They use real broker records and containerized services, but fixture data and development settings. You can inspect a record, restart an application, and see which state comes back from the log. You should not use them for production data.

## Run a lab

You need Linux, Nix with flakes enabled, and a host configured for rootless containers. User namespaces, subordinate UID/GID mappings, and cgroup delegation are host requirements. Nix supplies Podman, Compose, Just, Bash, language toolchains, Terraform, and the other command-line tools. No cloud account, API key, host model installation, or separately installed agent harness is required.

From this checkout:

```bash
nix develop --no-update-lock-file
just up
```

The default lab is the explorer. The command builds its application, starts three brokers, Console, Prometheus, and Grafana, waits for readiness, then prints the actual loopback URLs. Open the app URL, produce an event, and inspect it in Console. Pause consumption to let lag accumulate, then resume it.

```bash
just status
just urls
just down
```

**`down` deletes the selected lab's broker data, containers, and network.** It does not prune the engine or remove another lab. Shared upstream images and Nix caches remain available for the next run. The explorer also attempts to remove its checkout-specific application image.

The first build needs network access to download pinned inputs. Subsequent runs reuse caches. Start one lab at a time while learning; the three-broker labs need several GiB of RAM in addition to normal host workloads.

## Labs

| Name | Application | Main behavior to inspect |
| --- | --- | --- |
| `explorer` | Browser producer/consumer with Console, Prometheus, and Grafana | Keys, partitions, offsets, consumer lag, and one-broker failure. |
| [`trading`](docs/labs/trading.md) | Rust commodity exchange with CLI and web orders | Price-time priority, partial fills, cancellation, stable operation IDs, and replay. |
| [`sports`](docs/labs/sports.md) | Multi-sport web portal | Local video playback, score events, watchlists, and consumed playback telemetry. |
| [`agent-messaging`](docs/labs/agent-messaging.md) | Separate planner and reviewer agents | Genuine upstream `fx` invokes a local 135M model; Redpanda records proposal, critique, and synthesis. |
| [`agent-chat`](docs/labs/agent-chat.md) | Web chat with local inference | Durable conversations, future jobs, ordered cancellation, and restart recovery. |
| [`bitcoin`](docs/labs/bitcoin.md) | Web Bitcoin paper trader with historical BTC/USD data | Price watching, next-close strategy entries/exits, positions, fees, P&L, and replay. No live or real orders. |
| [`terraform`](docs/labs/terraform.md) | Terraform-managed three-broker cluster and Console | Saved-plan review, infrastructure state, observed drift, and complete teardown. |
| [`jurisdictions`](docs/labs/jurisdictions.md) | EU, US and APAC logs with a summary-only global view | Residency routing, tenant partitions, export boundaries, regional outages and replay. |

The labs have separate networks, volumes, ports, and topics. The five single-broker application labs use one ordered topic each. The explorer and Terraform use three brokers in one cluster. The jurisdictions lab uses four independent single-broker clusters and three partitions per topic. All run on one machine, not in separate availability zones or geographic regions.

For example, to run the exchange:

```bash
just up trading
just urls trading
just exec trading app commodity-exchange help
just rpk trading topic describe trading.exchange.v1
just down trading
```

Use `sports`, `agent-messaging`, `agent-chat`, or `bitcoin` in the same lifecycle commands. The domain guides explain their APIs, state transitions, and failure cases. Terraform is different: `just up terraform` and `just down terraform` display a plan and require you to type the project name before making changes. Read its guide before applying a plan.

The sports lab serves original, silent, synthetic video loops. It does not redistribute film footage or sports broadcasts. The agent labs include the model file and model server in containers. Their small model performs real inference, but its answers are not a quality or safety guarantee.

To explore jurisdiction sharding:

```bash
just up jurisdictions
just urls jurisdictions
./labs/run jurisdictions outage eu
./labs/run jurisdictions recover eu
just down jurisdictions
```

The operator page shows each tenant's fixed home region, partition and consumed offset. Regional private fixtures remain in their home logs; only explicit aggregate snapshots go to the global cluster. During an EU outage, new EU writes are refused instead of redirected, while US and APAC can continue. The [walkthrough](docs/labs/jurisdictions.md) distinguishes this local demonstration from real data residency, compliance and regional disaster recovery.

## Checks and documentation

```bash
just check                 # All source, packaging, and documentation gates.
just check trading         # One lab's gates, plus documentation.
just test sports           # Real services and domain workflow, then disposal.
just docs-serve            # Local Zensical preview; prints its URL.
```

`just test LAB` is destructive. Application tests delete the selected lab's existing account/history before starting a fresh workflow, then dispose it. Terraform tests require an empty owned project and retain a failed deployment for diagnosis rather than retrying or deleting it automatically. Reports, build outputs, and runtime state stay outside the checkout. The optional pre-commit hook runs the local validation gate:

```bash
prek install
```

There is no CI/CD configuration.

The [documentation](docs/index.md) starts with [a first event](docs/tutorials/first-event.md) and includes [lab walkthroughs](docs/labs/index.md), [commands and options](docs/reference/commands.md), [architecture](docs/explanation/architecture.md), and [troubleshooting](docs/how-to/troubleshooting.md). It explains why each application uses the log, what an acknowledgement establishes, and how interruption changes the outcome of an operation.

Browser storage is optional. Documentation theme and search controls stay usable when it is blocked; theme choices persist only when the browser permits storage.

## Reproducibility and production

`flake.lock`, application lockfiles, immutable model hashes, the Terraform provider lock, and digest-qualified upstream images define the inputs. The new application images are built with Nix. The original explorer still installs Debian packages inside its pinned base image, so those package versions are not a byte-for-byte rebuild guarantee. The [supply-chain reference](docs/reference/supply-chain.md) distinguishes version pins, artifact identity, provenance, and the remaining limits.

All published ports are loopback-only. The labs omit production authentication, TLS, storage tuning, and distributed application ownership. Most broker topics have finite retention; the jurisdictions experiment retains complete history until disposal. Deleting a volume deletes its log. The [production and recovery guide](docs/explanation/production.md) covers independent failure domains, cross-region replication, writer fencing, recovery objectives, and restore drills. Those requirements are documented, not claimed as capabilities of this single-host setup.

## License

The first-party code is [MIT licensed](LICENSE). Broker images, model weights, the fx harness, Terraform, and other dependencies retain their upstream licenses. This license does not grant rights to third-party sports, film, or character assets.
