# Diagnose startup and delivery failures

Inspect the selected lab before changing it. Startup timeouts leave containers available for diagnosis.

```bash
just status iot
just logs iot app
just rpk iot cluster health
```

Replace `iot` with your lab. For the default explorer, use `just status`, `just logs` and `just rpk explorer cluster health`. Terraform has its own [state and socket procedure](../labs/terraform.md).

## Startup

| Symptom | Next step |
| --- | --- |
| User namespace or UID/GID mapping fails | Check host user-namespace policy, subordinate ranges and privileged mapping helpers. Nix supplies Podman, not host policy. Do not switch to rootful containers to bypass the failure. |
| Rootless resource controls fail | Check cgroup delegation and effective controllers with the host owner. A Compose limit does not prove enforcement; see [resource limits](../reference/tuning.md#container-declarations-need-host-evidence). |
| Port occupied | Leave unrelated processes running. Check the selected lab's saved ports. If you can discard its data, dispose of it before selecting a new `LAB_PORT_BASE`; see [ports](../reference/commands.md#ports). Do not remove port state while its containers run. |
| Pull returns `toomanyrequests` | Wait or run `podman login registry-1.docker.io` interactively. Never pass a password as an argument. |
| Broker or app remains unready | Inspect broker and app logs, then cluster health. Explorer also needs its full consumer assignment; replaying applications need their retained prefix. |
| Old containers remain after moving a checkout | Identity includes the absolute path. Use the original checkout path and state to dispose of its runtime. Do not use global prune. |

Explicit `registry-1.docker.io` references do not use a host `docker.io` mirror. Keep personal npm credentials and registry configuration out of builds; see [supply chain](../reference/supply-chain.md).

## Delivery and replay

| Symptom | Next step |
| --- | --- |
| Explorer lag does not drain | Check shared consumer pause, group assignment and broker health. **Pause live updates** only freezes the browser. App counter subtraction is not committed lag. |
| Explorer produce times out | Inspect Console for the event ID, when available, before sending again. [Delivery outcome is unknown](../explanation/telemetry-and-delivery.md#delivery-promises). |
| A domain command has an uncertain result | Keep its exact ID and payload. Follow that [lab's receipt/replay procedure](../labs/index.md); never substitute a new ID just because a receipt is absent from a live projection. |
| Replay reports expired history or a nonzero low offset | Increasing retention cannot restore deleted records. The ordinary labs have no alternative authoritative snapshot. Preserve evidence; if discarding the lab is acceptable, dispose and start over. |
| Authoritative consumer stops on a codec or record error | Inspect the log and the lab's schema/codec contract. Arbitrary publication can poison replay. Resending does not repair history; [compression](../reference/commands.md#compression) explains the supported codecs and destructive reset option. |

## Disposal

`just down LAB` removes only that lab's owned runtime. **It deletes broker history**; `down` followed by `up` is a reset, not recovery. Explorer also loses its telemetry volumes.

If the explorer warns that its optional app image could not be removed, read the Podman error. Runtime disposal may already have succeeded. Remove only that exact image later if needed; upstream images and Nix outputs are reusable caches, not lab records.
