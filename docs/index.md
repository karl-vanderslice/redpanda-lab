# Redpanda Lab

Learn event logs through local applications. Start with Signal Harbor Works, the three-broker explorer, then choose a domain workflow.

## Run the explorer

You need Linux, Nix flakes and host support for rootless Podman. Nix supplies the tools, not user-namespace policy, subordinate UID/GID mappings or cgroup delegation. Allow several GiB of free RAM; the first startup downloads dependencies.

From the checkout root:

```bash
nix develop --no-update-lock-file
just up
just urls
```

Open **Stream app**. The [first-event tutorial](tutorials/first-event.md) takes you from a published record to a drained consumer backlog.

**`just down` erases this lab's records and telemetry volumes.** Leave it running to keep exploring. Use synthetic data: the loopback endpoints have no authentication.

## Choose a route

| You want to… | Read |
| --- | --- |
| Operate a domain application | [Choose a lab](labs/index.md) |
| Interrupt a broker without deleting its data | [Failure and recovery](how-to/failure-and-recovery.md) |
| Find commands, ports or build options | [Command reference](reference/commands.md) |
| Diagnose startup or uncertain delivery | [Troubleshooting](how-to/troubleshooting.md) |
| Understand the explorer | [Architecture](explanation/architecture.md) and [delivery and telemetry](explanation/telemetry-and-delivery.md) |
| Change a resource or client setting | [Tuning and operating limits](reference/tuning.md) |
| Plan beyond a single-host lab | [Production and recovery](explanation/production.md) and [proposed blueprints](blueprints/index.md) |
| Review artifact identity and licenses | [Supply chain](reference/supply-chain.md) |

`just docs` builds this site outside the checkout. `just docs-serve` prints a local preview URL. The site uses local fonts and assets. Browser storage is optional; saved theme/search state depends on it.
