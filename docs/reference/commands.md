# Commands and configuration

Run `nix develop --no-update-lock-file` at the repository root before using `just`. Direct `./lab` and `./labs/run` commands enter the same environment automatically. Nix supplies the CLIs; Linux user namespaces, subordinate UID/GID mappings and cgroup delegation remain host prerequisites.

`LAB` is `explorer`, `iot`, `pos`, `logistics`, `trading`, `sports`, `agent-messaging`, `agent-chat`, `bitcoin`, `terraform`, or `jurisdictions`. Lifecycle commands default to `explorer` where shown. Terraform adds an explicit plan-review boundary.

| Command | Effect |
| --- | --- |
| `just up [LAB]` | Build/start an isolated lab and wait for readiness. Terraform displays a plan and requires the project name before apply. |
| `just down [LAB]` | Delete that lab's containers and broker data. Terraform requires destroy-plan review. Shared upstream/Nix caches remain. |
| `just status [LAB]` | Show the selected runtime's state. |
| `just urls [LAB]` | Print its actual loopback endpoints. Application/explorer URLs require initialized port state. |
| `just logs [LAB] [SERVICE]` | Recent explorer/application logs; use scoped `podman logs` for Terraform containers shown by `status`. |
| `just rpk LAB ARGS...` | Run the broker CLI against that lab, never an ambient Kafka cluster. For `jurisdictions`, prefix arguments with `eu`, `us`, `apac` or `global`. |
| `just exec LAB SERVICE COMMAND...` | Execute inside an application service, for example the trading CLI. Not supported for explorer or Terraform. |
| `just restart LAB SERVICE` | Restart exactly one application service; broker volumes remain. Not supported for explorer or Terraform. |
| `just test [LAB]` | Delete the selected application lab's existing history, run a fresh real workflow, then dispose it. Terraform instead requires empty owned state and retains failed deployments for diagnosis. |
| `just check [LAB]` | Syntax/lint, package evaluation and domain validation, then strict docs build. No name means all labs. |
| `just tf ARGS...` | Terraform `plan`, hash-bound `apply`, `show`, `drift`, `health` and other documented commands. |
| `just docs` / `just docs-serve` | Build/preview Zensical outside the checkout; preview requests a free high loopback port. |
| `just lock` | Regenerate the original explorer's public npm lockfile without host installation. Not a blanket dependency update. |

Domain options are in the [lab guides](../labs/index.md). `check` validates sources; `test` exercises real services. Neither proves production readiness.

## Compression

KafkaJS application labs support **uncompressed/GZIP**; their APIs publish uncompressed records. Manual fixtures need the documented schema and `rpk topic produce --compression none`. Stock `rpk` can select Snappy, which these clients cannot decode.

An unsupported codec stops the authoritative consumer. Inspect logs, then dispose only the affected lab; retrying does not repair its log. Production needs a tested producer/consumer codec contract. [KafkaJS reference](https://kafka.js.org/docs/producing#compression).

## Ports

The explorer and single-broker apps allocate a free high-port block on first startup, retained until successful `down`:

```bash
LAB_PORT_BASE=53000 just up trading
just urls trading
```

The explorer permits bases 49152–65520; application labs permit 49152–65530. `LAB_PORT_BASE` only selects allocation when no saved state exists. Do not delete saved port state while containers run. Changing checkout paths changes resource identity.

| Offset | Explorer | Single-broker application labs |
| --- | --- | --- |
| 0 | App | App |
| 1 | Console | Console |
| 2 | Grafana | Broker Admin API |
| 3 | Prometheus | HTTP Proxy |
| 4 | Schema Registry | External Kafka listener |
| 5 | HTTP Proxy | Not allocated |
| 6 | Broker zero Admin API | Not allocated |
| 10, 11, 12 | External Kafka listeners | Not allocated |

Terraform uses a persisted path-derived block, with thirteen endpoints. `LAB_TF_PORT_BASE=59000` selects a base before the first plan (49152–65520). A collision fails rather than changing an approved target. [Terraform state/socket options](../labs/terraform.md).

Jurisdictions publishes one gateway port (49152–65535); Kafka and Admin APIs stay on container networks. `LAB_PORT_BASE` selects that port before startup. `./labs/run jurisdictions outage REGION` / `recover REGION` stop/start an owned broker (`eu`, `us`, `apac`, `global`). [Export and recovery rules](../labs/jurisdictions.md).

All published ports are loopback-only and unauthenticated. Non-root app users, read-only roots, dropped capabilities and bounded input do not replace authentication. Terraform's Podman socket has broad host-user authority, not a container-isolation guarantee.

## Inspect explorer records

```bash
just rpk explorer topic list
just rpk explorer topic describe lab.events -p
just rpk explorer group describe lab-explorer
```

`REDPANDA_LAB_SHELL` is an internal recursion guard, not an ambient-tool override. Commands use the declared Nix shell. Caches and evidence can contain prompts or records; use synthetic data and retain it deliberately.
