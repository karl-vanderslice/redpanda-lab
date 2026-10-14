# Explorer architecture

Redpanda owns records and committed offsets. App counters and recent records are process-local, not a durable database.

Browser commands reach the app over HTTP; the app produces and consumes Kafka records. Console inspects Redpanda. Prometheus scrapes the brokers and app. Grafana queries Prometheus.

## Brokers

`lab.events` has six partitions with replication factor three: one leader and two followers per partition. One broker can stop while a majority remains. All brokers share one host failure domain, not independent zones.

Each runs `--mode=dev-container --smp=1 --memory=1G --reserve-memory=0M`. These are lab settings, not production sizing.

## Listeners

Container clients use `redpanda-0:9092` through `redpanda-2:9092`; host clients use printed loopback ports. Advertised addresses must be reachable from the client. Publishing a port does not resolve internal names on the host.

Schema Registry and HTTP Proxy are exposed through broker zero. Console inspects topics, groups, schemas, and the Admin API. Grafana's dashboard is provisioned; [telemetry](telemetry-and-delivery.md) describes scrapes and alerts.

## Ownership

`lab` derives the Compose project from the checkout's absolute path. Port allocation and lifecycle locks live under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/`; data lives in named container volumes, not the repository. Dispose before moving a checkout, or retain its original path for cleanup.

`up` and `down` serialize with `flock`; containers must not inherit its descriptor. Port probes cannot prevent a later bind race. Diagnose collisions without stopping unrelated processes. See [commands](../reference/commands.md).
