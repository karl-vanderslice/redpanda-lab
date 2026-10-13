# Commands and configuration

Run `nix develop --no-update-lock-file` at the repository root before using `just`. Direct `./lab` and `./labs/run` commands enter the same environment automatically. Nix supplies the CLIs; Linux user namespaces, subordinate UID/GID mappings and cgroup delegation remain host prerequisites.

`LAB` is `explorer`, `trading`, `sports`, `agent-messaging`, `agent-chat`, `bitcoin`, or `terraform`. Lifecycle commands default to `explorer` where shown. Terraform adds an explicit plan-review boundary.

| Command | Effect |
| --- | --- |
| `just up [LAB]` | Build/start an isolated lab and wait for readiness. Terraform displays a plan and requires the project name before apply. |
| `just down [LAB]` | Delete that lab's containers and broker data. Terraform requires destroy-plan review. Shared upstream/Nix caches remain. |
| `just status [LAB]` | Show the selected runtime's state. |
| `just urls [LAB]` | Print its actual loopback endpoints. Application/explorer URLs require initialized port state. |
| `just logs [LAB] [SERVICE]` | Recent explorer/application logs; use scoped `podman logs` for Terraform containers shown by `status`. |
| `just rpk LAB ARGS...` | Run the broker CLI against that lab, never an ambient Kafka cluster. |
| `just exec LAB SERVICE COMMAND...` | Execute inside an application service, for example the trading CLI. Not supported for explorer or Terraform. |
| `just restart LAB SERVICE` | Restart exactly one application service; broker volumes remain. Not supported for explorer or Terraform. |
| `just test [LAB]` | Delete the selected application lab's existing history, run a fresh real workflow, then dispose it. Terraform instead requires empty owned state and retains failed deployments for diagnosis. |
| `just check [LAB]` | Syntax/lint, package evaluation and domain validation, then strict docs build. No name means all labs. |
| `just tf ARGS...` | Terraform `plan`, hash-bound `apply`, `show`, `drift`, `health` and other documented commands. |
| `just docs` / `just docs-serve` | Build/preview Zensical outside the checkout; preview requests a free high loopback port. |
| `just lock` | Regenerate the original explorer's public npm lockfile without host installation. Not a blanket dependency update. |

See each [lab guide](../labs/index.md) before using domain-specific options. `just check` validates sources and packaging; `just test` exercises runtime behavior. Neither is a production deployment or multi-region recovery test.

The sports, agent messaging, scheduled chat and Bitcoin clients use KafkaJS's built-in **uncompressed/GZIP** support. The application APIs publish uncompressed records. For deliberate manual application-record fixtures, select `rpk topic produce --compression none` and preserve the documented schema. Stock `rpk` can otherwise publish Snappy, which these minimal clients cannot decode. Unsupported codecs stop their authoritative consumers; inspect logs and reset only the disposable lab, rather than retrying against its poisoned log. Production clients need an explicit, tested codec contract across all producers. See [KafkaJS compression](https://kafka.js.org/docs/producing#compression).

## Choose ports

The explorer and five application labs select an available high-port block on first startup and retain it until successful `down`. For example:

```bash
LAB_PORT_BASE=53000 just up trading
just urls trading
```

The explorer permits bases 49152–65520; application labs permit 49152–65530. `LAB_PORT_BASE` only selects allocation when no saved state exists. Do not delete saved port state while containers run. Changing checkout paths changes resource identity.

| Offset | Explorer | Five application labs |
| --- | --- | --- |
| 0 | App | App |
| 1 | Console | Console |
| 2 | Grafana | Broker Admin API |
| 3 | Prometheus | HTTP Proxy |
| 4 | Schema Registry | External Kafka listener |
| 5 | HTTP Proxy | Not allocated |
| 6 | Broker zero Admin API | Not allocated |
| 10, 11, 12 | External Kafka listeners | Not allocated |

Terraform uses its own persisted path-derived block. Set `LAB_TF_PORT_BASE=59000` before its first plan if needed (49152–65520). Its thirteen endpoints and state/socket overrides are explained in the [Terraform guide](../labs/terraform.md). A collision fails; it does not silently reallocate an approved infrastructure target.

All published ports are loopback-only and unauthenticated. Non-root app users, read-only roots, dropped capabilities and bounded input do not replace authentication. Terraform's Podman socket has broad host-user authority, not a container-isolation guarantee.

## Inspect explorer records

```bash
just rpk explorer topic list
just rpk explorer topic describe lab.events -p
just rpk explorer group describe lab-explorer
```

The internal `REDPANDA_LAB_SHELL` recursion guard is not a supported route for supplying ambient tools. Keep commands inside the declared shell. Local cache/state paths and retained evidence may contain prompts or records; use synthetic data and manage retention deliberately.
