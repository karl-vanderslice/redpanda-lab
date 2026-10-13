# Diagnose startup and delivery failures

Start with `just status` and `just logs`. A readiness timeout leaves containers intact so you can inspect them. Do not repeat a data mutation merely because its HTTP request timed out.

| Symptom | Check and recovery |
| --- | --- |
| Podman cannot create a user namespace or map IDs | Confirm the host permits user namespaces and has subordinate UID/GID ranges and privileged mapping helpers. Nix supplies Podman, not host policy. Do not switch silently to rootful containers. |
| Port already in use | Keep other processes running. Dispose of this lab, then select another `LAB_PORT_BASE` on startup. |
| Image pull returns `toomanyrequests` | Authenticate interactively with `podman login registry-1.docker.io`, or wait for the registry limit. Never put a password in command arguments. |
| Broker or app not ready | Inspect service logs and `just rpk explorer cluster health` (or the selected lab name). Readiness includes assignments and internal topic leaders. |
| Consumer lag does not drain | Check shared pause state, consumer-group assignment, and broker health. App counters are not lag. |
| Produce request times out | Outcome is unknown. Search Console by event ID before considering a new request. |
| `down` warns about app-image removal | Runtime disposal can still have succeeded. Read the original Podman error and remove only the named optional image later. |
| A moved checkout leaves old containers | The project identity includes the absolute path. Use the old checkout path/state to dispose of its project; do not globally prune. |

Registry names are fully qualified. A host's `docker.io` mirror is not the intended source for these explicit `registry-1.docker.io` references. Do not copy host npm credentials or registry configuration into a container build.

If you need a fresh experiment, `just down` then `just up` creates empty data volumes. This is reset, not recovery: all previous records and telemetry are gone.
