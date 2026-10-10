# Redpanda lab

A disposable, rootless Podman lab: a three-broker Redpanda cluster, a web app that produces and consumes records, Redpanda Console, Prometheus and a provisioned Grafana dashboard. Every port binds to `127.0.0.1`.

```sh
./lab up     # build, start, wait for readiness, print URLs
./lab down   # delete containers, network, volumes (all records and telemetry); try to remove the app image
```

Other commands: `./lab status`, `./lab urls`, `./lab logs [service]`, `./lab rpk <args>` (runs `rpk` inside `redpanda-0` against all three brokers, for example `./lab rpk topic describe lab.events -p`).

## Requirements

- Rootless Podman from the host. The flake does not provide it because rootless Podman needs the host's setuid `newuidmap`/`newgidmap`.
- Nix with flakes. `./lab` re-executes itself in the lock-pinned `nix develop` shell (podman-compose, Node 22/npm, curl, jq, util-linux). Without Nix, put those tools on `PATH` and set `REDPANDA_LAB_SHELL=1`.

## What runs

| Service | Purpose |
| --- | --- |
| `redpanda-0..2` | Redpanda v26.2.4, one core and 1 GiB each. `lab.events` has 6 partitions, replication factor 3, 6 h retention. |
| `app` | Node 22.23.3 + `@confluentinc/kafka-javascript` 1.11.0 (librdkafka 2.16.0) + `@prometheus-io/client` 0.16.1. Serves the UI and `/metrics`; idempotent producer with `acks=all`; independent consumer group `lab-explorer`. |
| `console` | Redpanda Console v3.12.0: topics, messages, consumer groups, Schema Registry, Admin API. |
| `prometheus` | Scrapes broker `/public_metrics` and the app every 5 s; 3 alert rules (no Alertmanager). |
| `grafana` | Anonymous viewer, dashboard `redpanda-lab` opens by default. |

On first `up`, the script picks a free block of high ports (49152 to 65535) and keeps it until `down`. Set `LAB_PORT_BASE` to choose it. Kafka clients on the host can use the printed broker addresses.

## Things to try

1. Produce an event and watch its partition and offset. The same key always lands on the same partition.
2. Pause the consumer, start the generator (for example 50/s for 30 s), and watch committed lag rise in the app and Grafana. Resume and watch it drain. After 30 s of growth the `LabPausedConsumerAccumulatingLag` alert fires in Prometheus.
3. Kill a broker with `podman kill <project>_redpanda-1_1` (project name from `./lab status`). Within about a minute, Prometheus fires `RedpandaBrokerUnavailable` and `RedpandaUnderReplicatedPartitions`. Production continues: requests may wait during leader failover, with a 30 s native delivery budget and a 10 s broker ack timeout. The consumer's background heartbeats and group membership are independent of production. It can stall briefly while rejoining, then catches up; the requested pause is reapplied on every assignment. It may redeliver a few records, because consumption is at-least-once and successfully processed offsets are committed every second, so `Consumed` can exceed `Produced`. Bring the broker back with `podman start`; the cluster returns to healthy with no under-replicated partitions.

Counters in the app are process-lifetime values and reset when the app restarts. Lag always comes from broker-stored committed offsets. A produce request that times out reports an unknown outcome and is never retried automatically, because the record may already exist. Search Console for the event ID before you send it again.

Readiness requires topic leaders for all six RF3 partitions, all three broker nodes in topic metadata, and the consumer's actual six-partition assignment: starting `consumer.run()` alone is not readiness. `./lab up` also waits for the Admin API cluster health overview to report a healthy three-node cluster, including internal topic leaders. Lag is fetched by a separate admin client from topic watermarks and committed group offsets, not inferred from the app counters. Pause/resume can retain intent during a rebalance with no assignment; an already-running message callback may finish before the pause settles.

The public HTTP contract remains `/api/stats`, `/api/produce` (201 with event ID, partition and string offset), `/api/consumer` (shared boolean pause), `/api/generator` (bounded rate/duration) and `/api/generator/stop`. All `lab_*` Prometheus names remain unchanged. Native idempotence makes internal producer retries duplicate-free; it does not deduplicate a new HTTP request or make consumption exactly-once.

## Verification

`tests/e2e.sh` runs `./lab up`, then validation, produce/consume, same-key partition consistency, pause/lag/resume, generator limits, Prometheus, Grafana and Console checks. It then stops one broker, produces 24 distinct keys while the consumer remains paused, checks broker-stored lag and resumed consumption, restores the broker, and runs `./lab down`. Disposal checks cover containers, volumes, network, saved port state, app image and the app's loopback endpoint. The original healthy-cluster `consumed == produced` oracle is retained; failover permits at-least-once redelivery (`consumed >= produced`). It writes a report under `${XDG_CACHE_HOME:-~/.cache}/redpanda-lab/e2e/`. It deletes this lab's data.

## Images

Images use explicit registries (`registry-1.docker.io`, `quay.io`, `public.ecr.aws`) so a host-wide `docker.io` mirror cannot redirect them. The app base is pinned to the Node 22.23.3 Debian Bookworm slim multi-architecture manifest digest. Its dependency stage supplies a C++20 compiler, Python and native headers. It installs the integrity-locked npm package without scripts, applies the local coordinator-lifetime patch, then builds its bundled librdkafka with Node headers from the pinned base. `CKJS_LINKING=dynamic` uses Debian's libraries instead of downloading unpinned native dependencies. The final non-root stage contains the required native runtime libraries but no build toolchain. Debian apt packages are not separately version-locked. Neither host `node_modules` nor host npm credentials are copied into the image.

Broker-failure testing exposed a librdkafka 2.16.0 coordinator error-path use-after-free that aborted Node while fetching committed offsets. `app/patches/librdkafka-coordinator-lifetime.patch` carries the worker-ownership and destroyed-operation fixes from [upstream PR 5397](https://github.com/confluentinc/librdkafka/pull/5397), which remains unmerged. It omits the proposal's generic null-opaque guard to preserve non-admin callback semantics. Patch application fails closed without fuzz. Remove it only after the pinned upstream fixes both lifetimes and the broker-failure E2E passes without it.

Anonymous Docker Hub pulls are rate-limited. If a pull fails with `toomanyrequests`, authenticate with `podman login registry-1.docker.io` (interactive prompt; do not put passwords in command arguments) or wait. Keep registry authentication in Podman's credential store; do not forward it to npm or container build arguments.

`./lab down` removes only this checkout's project containers, network and volumes; it never globally prunes. Saved port state is released before optional app-image cleanup. A failed image removal leaves a clear warning and the original Podman error, but does not undo completed runtime disposal or prevent it from finishing. Upstream images stay cached.

## Dependency updates

```sh
./lab lock   # pinned Nix-shell npm, public registry, package-lock-only; no host node_modules
```

Update exact versions in `app/package.json`, then use this command to regenerate `app/package-lock.json`. `app/.npmrc` is a project default, not an override: a host `npm_config_registry` environment variable takes precedence over it. `./lab lock` explicitly chooses `https://registry.npmjs.org/`, clears inherited npm/auth environment, and uses empty user/global configuration. Container `npm ci` also explicitly selects the public registry. Never regenerate the lock against a private registry or copy host npm configuration into a build.

Maintenance evidence checked against public npm metadata on 2026-10-10: Confluent 1.11.0 was published 2026-10-07, and the Prometheus subproject's 0.16.1 was published 2026-08-27; neither returned a deprecation marker. These are observed publication facts, not a promise of future releases. Official guidance:

- [Confluent migration guide](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/MIGRATION.md): producer-level acks/timeout, consumer-level fromBeginning/autoCommit/interval, fresh clients after disconnect, assignment before pause/resume, and supported admin APIs.
- [Confluent native build configuration](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/binding.gyp) and [platform support](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/README.md#requirements).
- [Prometheus rename and breaking changes](https://github.com/prometheus/client_js/blob/v0.16.1/CHANGELOG.md): package rename and supported Node versions; the lab uses the unchanged Counter/Gauge/Histogram/registry APIs.
