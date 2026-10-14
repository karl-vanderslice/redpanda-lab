# Redpanda Lab

Local applications with real event logs. The explorer includes three brokers, a browser producer/consumer, Console, Prometheus and Grafana.

## Run

Linux, Nix flakes and rootless Podman host support are required. Nix supplies the tools; user namespaces, subordinate UID/GID mappings and cgroup delegation belong to the host. Allow several GiB of RAM. First startup downloads dependencies.

```bash
nix develop --no-update-lock-file
just up
just urls
```

Open the app URL. Publish a record, inspect its offset in Console, then pause consumption and watch lag in Grafana.

**`just down` deletes the selected lab's data.** All ports are loopback-only and unauthenticated. Use synthetic data.

## Guides

| Goal | Guide |
| --- | --- |
| Follow a record | [First event](tutorials/first-event.md) |
| Try an application | [Lab chooser](labs/index.md) |
| Stop a broker | [Failure and recovery](how-to/failure-and-recovery.md) |
| Find a command | [Commands and ports](reference/commands.md) |
| Diagnose a failure | [Troubleshooting](how-to/troubleshooting.md) |
| Understand delivery | [Architecture](explanation/architecture.md), [telemetry](explanation/telemetry-and-delivery.md) |
| Assess production gaps | [Production and recovery](explanation/production.md) |

`just docs` builds this site outside the checkout. `just docs-serve` prints a local preview URL. Theme and search work without browser storage; persistence requires it.
