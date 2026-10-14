# Commands

Run commands from the checkout root. `just` recipes require the declared development shell:

```bash
nix develop --no-update-lock-file
```

Linux, Nix flakes and rootless Podman host support are prerequisites. Nix supplies the tools; user namespaces, subordinate UID/GID mappings and cgroup delegation belong to the host. Direct `./lab`, `./labs/run` and `bash scripts/docs` commands enter the same shell automatically.
The wrappers select the local engine explicitly and reject rootful engines before lifecycle changes. They do not rewrite Podman connections or clear inherited environment variables. An invalid `CONTAINER_CONNECTION` name can still fail Podman's argument parsing; no lab action starts.

## Lifecycle and inspection

`LAB` is `explorer`, `iot`, `pos`, `logistics`, `event-log`, `siem`, `activity`, `inventory`, `clearing`, `trading`, `bitcoin`, `sports`, `agent-messaging`, `agent-chat`, `jurisdictions` or `terraform`. Optional names default to `explorer` below.

| Command | Effect |
| --- | --- |
| `just up [LAB]` | Build/start the selected lab and wait for readiness. Terraform displays a plan and requires project-name approval before apply. |
| `just urls [LAB]` | Print actual loopback endpoints. Explorer/application URLs require initialized port state. |
| `just status [LAB]` | Show the selected runtime's state. |
| `just logs [LAB] [SERVICE]` | Read recent explorer/application logs. For Terraform, use scoped `podman logs` on containers named by its `status`. |
| `just rpk LAB ARGS...` | Run the broker CLI against that lab, not an ambient Kafka cluster. For jurisdictions, prefix arguments with `eu`, `us`, `apac` or `global`. |
| `just exec LAB SERVICE COMMAND...` | Execute in an application service. Not supported for explorer or Terraform. |
| `just restart LAB SERVICE` | Restart one application service without deleting broker volumes. Not supported for explorer or Terraform. |
| `just down [LAB]` | **Delete** the selected lab's containers, network and broker data. Explorer also deletes telemetry volumes. Terraform requires destroy-plan review. Reusable upstream/Nix caches remain. |
| `just tf ARGS...` | Terraform's saved plans, hash-bound apply, state inspection, drift and health commands; see its [guide](../labs/terraform.md). |

For example:

```bash
just up clearing
just urls clearing
just logs clearing app
just restart clearing app
```

Outside the shell, the equivalent ordinary-lab entry point is `./labs/run clearing up`. The explorer uses `./lab up`, not `./labs/run explorer up`. Lab-specific options belong to the [guides](../labs/index.md).

## Checks and destructive scenarios

| Command | Scope |
| --- | --- |
| `just check [LAB]` | Common syntax/style checks, selected source/package evaluation and domain validation, then strict docs build. No name means all labs. It does not run the real-container scenarios. |
| `just test [LAB]` | Real-container workflow and disposal. Ordinary application labs delete existing history **before** startup and again on exit. Explorer uses its current runtime if present, then deletes it. Terraform requires empty owned state and retains failed deployments for diagnosis. |
| `just lock` | Regenerate only the explorer's public npm lockfile, without installing host `node_modules`. Not a general dependency update. |

**Do not run `just test` on history you want to keep.** Reports go under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/e2e/`. A lab's direct `e2e.sh` can have different preconditions and lifecycle behavior; follow its guide. Neither source checks nor a local scenario establish production readiness.

Public E2Es check live pages, declared assets, content types, read APIs and supported HEAD requests. Missing resources must return 404; malformed Node paths must return 400, not 500. The report includes each checked URL.

## Documentation

```bash
just docs
just docs-serve
```

`docs` stages source and theme files under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/docs/`, renders the blueprints, then builds the site. `docs-serve` prints an OS-assigned loopback URL. Its staged copy is a snapshot: restart the preview after changing checkout files.

To copy a strict build into an explicit publication directory:

```bash
bash scripts/docs build /tmp/redpanda-lab-docs-export
```

The destination must **not exist**. It must be outside the checkout and cannot be `/`, the checkout root or any ancestor of the checkout. The wrapper copies the completed site there; it does not publish it. Use a new destination for each build. The Nix package uses this same export contract:

```bash
nix build --no-update-lock-file --no-link --print-out-paths .#documentation
```

Generated diagrams and site files remain outside the checkout. See [blueprint sources and regeneration](../blueprints/index.md#sources-and-regeneration). A build command or workflow definition is not evidence of a deployed site.

## Ports

Explorer and ordinary application labs allocate a free high-port block on first startup, saved until successful `down`:

```bash
LAB_PORT_BASE=53000 just up trading
just urls trading
```

Explorer accepts bases 49152–65520; ordinary apps accept 49152–65530. `LAB_PORT_BASE` selects initial allocation only when saved state is absent. Do not remove saved port state while containers run. Initial probes cannot prevent a later bind race.

| Offset from base | Explorer | Ordinary application lab |
| --- | --- | --- |
| 0 | App | App |
| 1 | Console | Console |
| 2 | Grafana | Broker Admin API |
| 3 | Prometheus | HTTP Proxy |
| 4 | Schema Registry | External Kafka listener |
| 5 | HTTP Proxy | Not allocated |
| 6 | Broker-zero Admin API | Not allocated |
| 10, 11, 12 | External Kafka listeners | Not allocated |

Terraform persists a path-derived block with thirteen endpoints. `LAB_TF_PORT_BASE=59000` selects its base before the first plan, in 49152–65520. A collision fails instead of changing an approved target. Its [guide](../labs/terraform.md) owns state and socket options.

Jurisdictions publishes one gateway port, in 49152–65535; Kafka and Admin APIs remain on container networks. `LAB_PORT_BASE` selects the port before startup. `./labs/run jurisdictions outage REGION` and `recover REGION` stop/start one owned broker (`eu`, `us`, `apac`, `global`). See its [export and recovery rules](../labs/jurisdictions.md).

All published ports are loopback-only and unauthenticated. Nonroot app users, read-only roots and bounded inputs do not replace authorization. Terraform's Podman socket grants host-user authority. Resource identity depends on the absolute checkout path; dispose before moving it or keep the original path for cleanup.

## Compression

KafkaJS application labs support uncompressed records and GZIP; their APIs publish uncompressed records. Manual fixtures require the exact documented schema and `rpk topic produce --compression none`. Stock `rpk` can select Snappy, which these clients cannot decode without an extension.

An unsupported codec stops the authoritative consumer. Inspect logs and preserve evidence. If you can discard the history, dispose of only the affected lab and start over; retrying does not repair its log. Production needs a tested producer/consumer codec contract. See [KafkaJS compression](https://kafka.js.org/docs/producing#compression) and [client-specific tuning](tuning.md#client-knobs-belong-to-their-client).

## Inspect explorer records

```bash
just rpk explorer topic list
just rpk explorer topic describe lab.events -p
just rpk explorer group describe lab-explorer
```

`REDPANDA_LAB_SHELL` is an internal recursion guard. `REDPANDA_LAB_PODMAN` is the Nix-owned absolute path to the local-engine adapter; neither is a tuning knob. Caches and reports can contain prompts or records: use synthetic data and choose retention deliberately.
