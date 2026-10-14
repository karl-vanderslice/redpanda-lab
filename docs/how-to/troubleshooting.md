# Diagnose startup and delivery failures

Start with `just status` and `just logs`. Readiness timeouts leave containers intact. Never repeat a mutation solely because its HTTP request timed out.

| Symptom | Check or recovery |
| --- | --- |
| User namespace or ID mapping fails | Check host user-namespace policy, subordinate UID/GID ranges, and privileged mapping helpers. Nix supplies Podman, not host policy. Do not silently switch to rootful containers. |
| Port occupied | Leave other processes running. `just down` erases this lab's data; then choose another `LAB_PORT_BASE` for `just up`. See [port allocation](../reference/commands.md#ports). |
| Pull returns `toomanyrequests` | Run `podman login registry-1.docker.io` interactively or wait. Never pass passwords as arguments. |
| Broker or app not ready | Inspect logs and `just rpk explorer cluster health`, substituting the selected lab where applicable. Readiness includes consumer assignments and internal topic leaders. |
| Lag does not drain | Check shared pause state, group assignment, and broker health. App counters are not lag. |
| Produce times out | Outcome unknown. Inspect Console before sending again; search by event ID if available. |
| `down` warns about app-image removal | Runtime disposal may have succeeded. Read the Podman error; remove only the named optional image later. |
| Old containers after moving checkout | Identity includes the absolute path. Dispose using the old path/state, never global prune. |

Explicit `registry-1.docker.io` references do not use the host's `docker.io` mirror. Keep host npm credentials and registry configuration out of container builds.

`just down` followed by `just up` creates empty volumes. It is reset, not recovery: previous records and telemetry are erased.
