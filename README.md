# Redpanda lab

Explore event streaming on your own machine. This disposable lab runs three Redpanda brokers, a producer/consumer web app, Redpanda Console, Prometheus, and Grafana in rootless Podman containers. Every published port binds to `127.0.0.1`. No cloud account or API key is needed.

## Start here

You need **Nix with flakes enabled** on Linux. Nix supplies Podman and the development tools. Your host must permit rootless containers: user namespaces, subordinate UID/GID ranges, and working `newuidmap`/`newgidmap` helpers. A flake cannot configure those privileged host facilities. The first run needs internet access to fetch pinned Nix inputs, images, and application dependencies.

```bash
git clone https://github.com/karl-vanderslice/redpanda-lab.git
cd redpanda-lab
nix develop --no-update-lock-file
just up
```

Open the **Stream app** URL printed by the command. Produce an event, then watch it appear in the consumed event list. Open the printed Console URL to inspect the underlying record, or Grafana to see throughput and consumer lag. No login is required. Allow several minutes for the first build and startup.

When you finish:

```bash
just down
```

**`down` deletes this checkout's records, telemetry, containers, network, and volumes.** It attempts to remove its app image, but keeps downloaded upstream images and Nix caches. It never performs a global prune.

Prefer one command without entering a shell? `./lab up` and `./lab down` enter the same pinned Nix environment automatically.

## Choose your next experiment

| Goal | What to do |
| --- | --- |
| Understand keys, partitions, and offsets | Produce two events with the same key. Compare their partitions in the app and Console. |
| See backpressure | Pause consumption, run the generator, watch lag grow, then resume. |
| Explore broker failure | Follow the [broker-failure walkthrough](docs/how-to/failure-and-recovery.md). |
| Inspect the stack | `just status`, `just urls`, or `just logs app`. |
| Use the Kafka CLI | `just rpk topic describe lab.events -p`. |
| Verify the complete workflow | `just test` starts the lab, exercises real services and one-broker failover, then deletes its data. |
| Read the guide locally | `just docs-serve` prints a loopback URL for the Zensical site. |

## Documentation

The [documentation home](docs/index.md) routes you through setup, experiments, architecture, options, and recovery. Start with [your first event](docs/tutorials/first-event.md), then read [how the stack works](docs/explanation/architecture.md).

- [Commands and configuration](docs/reference/commands.md)
- [Telemetry and event delivery](docs/explanation/telemetry-and-delivery.md)
- [Supply-chain pins and reproducibility limits](docs/reference/supply-chain.md)
- [Production multi-region and disaster recovery](docs/explanation/production.md)
- [Troubleshooting](docs/how-to/troubleshooting.md)

The local lab is deliberately unauthenticated and disposable. Three brokers on one machine demonstrate broker failover, **not** availability-zone or regional resilience. Do not expose these ports or use this configuration for real trading, personal messages, or production data. CI/CD is outside this repository's scope.
