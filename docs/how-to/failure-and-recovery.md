# Stop one broker and recover

This experiment destroys no volume, but interrupts one broker. Use only this lab's container names. Do not stop arbitrary Podman containers.

1. Start with `just up`, then produce a few events.
2. Pause consumption and start a bounded generator.
3. Run `just status` and identify the container whose service is `redpanda-1`.
4. Stop that exact container with `podman kill <container-name>` (replace the example placeholder with the observed name).
5. Produce more events. The remaining two brokers elect leaders as needed. Requests can pause during election; observe actual acknowledgments and errors.
6. Open Prometheus and Grafana. Broker availability and under-replicated-partition alerts appear after their evaluation windows, not instantly.
7. Resume consumption. Committed lag should drain. At-least-once redelivery means consumed count can exceed produced count.
8. Restart the same container with `podman start <container-name>`, then run `just rpk explorer cluster health` until it reports healthy.

For a repeatable automated version, run `just test`. The E2E checks production of 24 distinct keys with a broker stopped, retained pause intent, broker-stored lag, resumed consumption, cluster recovery, and disposal. Its report lives under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/e2e/`.

## What this proves, and what it does not

A healthy majority can survive one broker process failure. It does not prove survival of a host outage, loss of all data volumes, a network split across regions, or external side-effect exactly-once processing. See [production and recovery](../explanation/production.md) before translating the experiment into a deployment design.
