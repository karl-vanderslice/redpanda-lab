# Stop one broker and recover

Explorer only. This interrupts a broker without deleting volumes. Stop only the container identified in this lab's `just status` output.

1. Run `just up` and produce a few events.
2. Pause the shared consumer and start a bounded generator.
3. Run `just status`; identify the `redpanda-1` container.
4. Run `podman kill <container-name>`, replacing the placeholder with that exact name.
5. Produce more events. The remaining brokers elect leaders; requests can stall. Inspect acknowledgments and errors. A timeout is an [unknown outcome](../explanation/telemetry-and-delivery.md#delivery-promises), not permission to retry.
6. Check Prometheus and Grafana. Alerts have [evaluation delays and metric limits](../explanation/telemetry-and-delivery.md#what-the-charts-mean).
7. Resume consumption; wait for committed lag to drain. Redelivery can make consumed count exceed produced count.
8. Run `podman start <container-name>` for the same container. Check `just rpk explorer cluster health` until healthy.

## Automated experiment

`just test` exercises 24 distinct keys with one broker stopped, retained pause intent, broker-stored lag, resumed consumption, recovery, and disposal. It deletes explorer data. Reports: `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/e2e/`.

## Limits

A majority can survive one broker process failure. This is not evidence for host loss, lost volumes, regional network splits, or exactly-once external effects. See [production and recovery](../explanation/production.md).
