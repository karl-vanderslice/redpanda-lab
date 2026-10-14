# Stop one broker and recover

Use the explorer to observe a broker process failure without deleting its volumes. This experiment does not cover host loss or power failure.

## Interrupt an owned broker

1. Run `just up` and [publish a few events](../tutorials/first-event.md).
2. Pause the shared consumer and start a bounded generator. Keep live browser updates enabled so you can observe the result.
3. Run `just status`. Copy the exact container name for this explorer's `redpanda-1` service.
4. Stop that process:

   ```bash
   podman --remote=false kill <container-name>
   ```

   Replace the placeholder with the name from step 3. Do not stop an unrelated container.

5. Publish another event. The remaining brokers can elect leaders; requests may stall during recovery. Inspect the acknowledgment or error. A timeout is an [unknown outcome](../explanation/telemetry-and-delivery.md#delivery-promises), not permission to send the event again.
6. Inspect Grafana and Prometheus. Account for [scrape and alert delays](../explanation/telemetry-and-delivery.md#what-the-charts-mean); absent under-replication series do not prove health.
7. Resume the shared consumer and watch committed lag drain. Redelivery can make the consumed counter exceed the produced counter.
8. Restart the same container and check cluster health:

   ```bash
   podman --remote=false start <container-name>
   just rpk explorer cluster health
   ```

   Repeat the read-only health query until the cluster is healthy. Confirm that the broker is visible in `just status` and the app's broker readings.

The Compose services declare `restart: unless-stopped`; check actual status during the experiment rather than assuming the killed broker remains down indefinitely.

## Run the automated scenario

**`just test` deletes existing explorer records and telemetry.** It exercises 24 distinct keys with one broker stopped, retained pause intent, broker-stored lag, resumed consumption and broker recovery, then disposes of the lab. Reports go under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/e2e/`.

The scenario's source describes those checks; a successful run is evidence only for that run's environment. It does not establish power-failure durability, independent failure domains or exactly-once external effects. See [storage limits](../reference/tuning.md#delivery-is-not-stable-storage) and [production recovery](../explanation/production.md).

## Upgrade retained telemetry

`up` keeps volumes. Grafana can migrate its database when its pinned version changes. An older image must not open the migrated database.

From the checkout root, enter `nix develop`, then stop only this explorer's telemetry writers and export their volumes:

```bash
identity=$(printf '%s' "$(pwd -P)" | sha256sum)
project="rp-lab-${identity:0:10}"
cache="${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab"
mkdir -p "$cache"
backup=$(mktemp -d "$cache/telemetry-backup.XXXXXX")
podman --remote=false stop "${project}_grafana_1" "${project}_prometheus_1"
podman --remote=false volume export --output "$backup/grafana.tar" "${project}_grafana"
podman --remote=false volume export --output "$backup/prometheus.tar" "${project}_prometheus"
printf 'Private backup: %s\n' "$backup"
just up
```

Do not run `down` as an upgrade step. Keep the private backup until dashboard queries and stored annotations work under the new version. Grafana backups can contain credentials.

For rollback, import the archive into a **fresh volume** and run the original pinned image against that volume. Preserve the migrated volume. Recreate the original provisioning mounts for a full explorer restore; the volume alone is not the whole configuration.

The local review preserved a stored annotation through Grafana 11.6.0 → 12.4.13 and recovered it from the exported backup under 11.6.0. That is one SQLite-backed lab migration, not validation of arbitrary dashboards, plugins or production data.
