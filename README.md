# Redpanda Lab

Disposable applications built on real Redpanda logs. Publish records, inspect offsets, and explore failure and replay.

## Start here

**Requires:** Linux, Nix flakes, and host support for rootless Podman (user namespaces, subordinate UID/GID mappings, and cgroup delegation). Nix supplies the tools. The first build downloads pinned dependencies; later runs reuse caches.

```bash
nix develop --no-update-lock-file
just up                    # Explorer, the default lab
just urls                  # Open the printed app URL
```

Publish an event in the browser. Find it in Console. Pause consumption to build lag, then resume. Grafana shows the result.

**Finished? `just down` deletes that lab's data, containers, and networks.** Other labs, shared images, and Nix caches remain. Start one lab at a time; multi-broker labs need several GiB of free RAM.

## Choose a lab

Use the same commands for a named lab:

```bash
just up iot
just urls iot
just down iot
```

| Lab | Explore |
| --- | --- |
| [`explorer`](docs/tutorials/first-event.md) | Events, partitions, consumer lag, Grafana, broker failure. |
| [`iot`](docs/labs/iot.md) | Sensor readings, temperature/battery alerts, device history. |
| [`pos`](docs/labs/pos.md) | Baskets, cash checkout, refunds, optional Stripe/Square sandbox payments. |
| [`logistics`](docs/labs/logistics.md) | Driver locations, nearest-driver dispatch, pickup and delivery. |
| [`trading`](docs/labs/trading.md) | Rust CLI and web orders, matching, partial fills, cancellation. |
| [`bitcoin`](docs/labs/bitcoin.md) | Historical BTC/USD prices, paper strategies, positions and P&L. |
| [`sports`](docs/labs/sports.md) | Multi-sport scores, synthetic video, watchlists and playback events. |
| [`agent-messaging`](docs/labs/agent-messaging.md) | Planner/reviewer agents using real `fx` and local inference. |
| [`agent-chat`](docs/labs/agent-chat.md) | Local model chat, scheduled jobs, cancellation and recovery. |
| [`jurisdictions`](docs/labs/jurisdictions.md) | Regional raw logs, tenant partitions, summary-only federation. |
| [`terraform`](docs/labs/terraform.md) | Reviewed infrastructure plans, drift and teardown. |

Labs own separate ports, networks, volumes, and topics. The explorer and Terraform use three brokers; jurisdictions uses four independent clusters; other labs use one broker and an ordered topic. All run on one host.

No keys are needed for the local workflows. POS provider payments need **sandbox credentials**, kept server-side. There are no live charges, real trading orders, or Uber connections. Sports clips are original synthetic loops. Agent answers come from a bundled small model, not a quality guarantee.

**Terraform asks for plan approval before apply or destroy.** Read its guide first.

## Inspect and verify

```bash
just status iot
just logs iot app
just rpk iot topic describe iot.events.v1
just restart iot app       # Replay the retained log
just check                 # Source, packaging, Terraform validation, strict docs
just test iot              # Fresh real-container workflow, then disposal
just docs-serve            # Documentation preview, prints its URL
```

**`just test LAB` deletes that application's existing history.** Terraform tests require empty owned state and retain failed deployments for diagnosis. Reports, caches, builds, and generated docs stay outside the checkout. Optional commit hook: `prek install`. No CI/CD is configured.

[Walkthroughs](docs/labs/index.md) · [Commands and ports](docs/reference/commands.md) · [Troubleshooting](docs/how-to/troubleshooting.md) · [Architecture](docs/explanation/architecture.md)

## Boundaries

Use synthetic data only. Ports are loopback-only and unauthenticated; production TLS, storage sizing, distributed writers, and geographic resilience are absent. Broker acknowledgement does not prove consumer completion. Retention can prevent full replay, and deleting a volume deletes its log. See [production and recovery](docs/explanation/production.md).

Inputs use lockfiles, image digests, and model hashes. The explorer's Debian package installation is not a byte-for-byte rebuild guarantee. See [supply-chain limits](docs/reference/supply-chain.md). Browser storage is optional; theme persistence depends on it.

First-party code is [MIT licensed](LICENSE). Dependencies retain their own licenses; this grants no rights to third-party media.
