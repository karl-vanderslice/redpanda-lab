# Commands and configuration

Run `nix develop --no-update-lock-file` at the repository root before using `just`. `./lab` enters the pinned environment itself.

| Command | Effect |
| --- | --- |
| `just up` | Build and start the explorer; wait for readiness; print URLs. |
| `just down` | Delete this explorer's containers, network, volumes, and saved port state; attempt app-image cleanup. |
| `just status` | Show container state and saved URLs. |
| `just urls` | Print URLs; fail if the lab has not been initialized. |
| `just logs [service]` | Read the last 100 log lines, optionally from one service. |
| `just rpk <args>` | Run `rpk` inside broker zero against all three internal brokers. |
| `just test` | Run real producer, consumer, failover, telemetry, and disposal checks; deletes lab data. |
| `just check` | Check source syntax and build the docs. |
| `just docs` | Build Zensical in an external cache staging directory. |
| `just docs-serve` | Preview the docs on a free high loopback port. |
| `just lock` | Regenerate the app's npm lockfile against the public registry, without host installation. |

## Choose ports

The first startup selects an available high-port block and retains it until `down`. To choose a block yourself:

```bash
LAB_PORT_BASE=53000 just up
```

`LAB_PORT_BASE` must be an integer from 49152 through 65520. It only chooses the allocation when no saved state exists. Do not delete saved state while containers are running.

| Offset from base | Service |
| --- | --- |
| 0 | Stream app |
| 1 | Console |
| 2 | Grafana |
| 3 | Prometheus |
| 4 | Schema Registry |
| 5 | HTTP Proxy |
| 6 | Broker zero Admin API |
| 10, 11, 12 | Host Kafka listeners |

Services are unauthenticated and loopback-only. The app has a read-only filesystem, dropped capabilities, no-new-privileges, a non-root image user, and a 256 MiB memory limit. These controls do not replace authentication or authorization.

## Inspect records

```bash
just rpk topic list
just rpk topic describe lab.events -p
just rpk group describe lab-explorer
```

The script's `REDPANDA_LAB_SHELL` variable is an internal recursion guard, not a supported path for supplying ambient tools. Keep commands inside the declared shell.
