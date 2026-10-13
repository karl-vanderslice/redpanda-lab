# Learn Redpanda by watching it work

Start a disposable stack, publish a record, and follow it from producer acknowledgment to consumer processing and telemetry. The explorer combines three brokers with a small browser app, Console, Prometheus, and Grafana. It runs locally without a cloud account.

## Pick a route

- **New to the lab?** Follow [your first event](tutorials/first-event.md).
- **Want a failure experiment?** [Stop one broker and recover](how-to/failure-and-recovery.md).
- **Want a domain application?** [Choose a separate lab](labs/index.md): commodity or Bitcoin paper trading, sports, coordinating agents, scheduled chat, or Terraform infrastructure.
- **Need a command or option?** Use the [command reference](reference/commands.md).
- **Want to understand the mechanism?** Read [architecture](explanation/architecture.md), then [delivery and telemetry](explanation/telemetry-and-delivery.md).
- **Considering a production system?** Start with [the production boundary and recovery plan](explanation/production.md), not the local Compose file.

## Before you start

Use Linux with Nix flakes and host support for rootless containers. Nix provides user-space tools; user namespaces and privileged UID/GID helpers belong to the host. The first startup downloads dependencies and builds an app image. Each broker requests one core and 1 GiB of memory, with a 1.5 GiB container limit. Allow additional memory for the app, Console, and telemetry.

All ports bind to loopback. Authentication, TLS, production storage sizing, regional recovery, and remote access are intentionally absent. Do not load personal or production data. **Stopping with `down` destroys the lab's data.**

The site uses system fonts and local assets, with light/dark controls. Build it with `just docs`; preview it with `just docs-serve`. Generated files stay outside the checkout.
