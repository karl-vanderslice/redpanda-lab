# Explorer architecture

Redpanda owns the explorer's records and committed consumer offsets. The app owns process-local counters and a latest-100 consumed-record view; neither is a durable business database.

The browser sends HTTP commands to the app. Its native Kafka client publishes and consumes `lab.events`. Redpanda Console inspects the cluster; Prometheus scrapes the brokers and app; Grafana queries Prometheus. Schema Registry and HTTP Proxy are exposed separately through broker zero. The explorer does not route its Kafka traffic through the HTTP Proxy.

## Brokers and ordering

`lab.events` has six partitions and replication factor three: a leader and two followers per partition. Ordering is partition-local. With a majority available, the cluster can elect new leaders after one broker process stops. This is the mechanism exercised by [failure and recovery](../how-to/failure-and-recovery.md).

All three brokers share one host. Each starts with `--mode=dev-container --smp=1 --memory=1G --reserve-memory=0M`. These are demonstration settings, not capacity guidance or independent failure domains. A successful acknowledgment under this mode is not proof of stable storage; see [delivery versus storage](../reference/tuning.md#delivery-is-not-stable-storage).

The explorer requests a six-hour event retention window when creating its topic. Prometheus has separate six-hour/256 MB retention limits. Application restart resets the app counters and recent view; committed group offsets remain in the broker. This differs from ordinary application labs, which reconstruct domain state from a complete prefix. [Topic policy](../reference/tuning.md#topic-policy) describes both.

## Addresses depend on the client

Container clients use `redpanda-0:9092` through `redpanda-2:9092`. Host clients use the printed loopback ports. Advertised Kafka addresses must be reachable from the client: publishing a port does not make internal container names resolvable on the host.

Use `just urls` rather than assuming a port. Console can inspect topics, groups, schemas and the Admin API. The provisioned Grafana dashboard has no login requirement; [delivery and telemetry](telemetry-and-delivery.md) explains its measurements.

Console, Grafana and Prometheus are unmodified upstream interfaces. A rendered review of the pinned versions found unnamed Console 3.12.0 Messages controls and horizontal overflow on that page at 320 CSS pixels, and Prometheus 3.13.4 target-health control text measured 3.55:1 contrast. The lab does not patch upstream interfaces; use the API or `rpk` when those pages do not suit your keyboard, screen reader or zoom setting.

## Runtime ownership

The `lab` wrapper derives a Compose project name from the checkout's absolute path. Named volumes hold broker and telemetry data, outside the repository. Port state and lifecycle locks live under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/`.

`up` and `down` serialize through `flock`. Containers must not inherit that lock descriptor. Initial port probes reduce collisions but cannot prevent another process binding before startup. Diagnose collisions without stopping unrelated processes.

Dispose of a lab before moving its checkout, or retain the original path for cleanup. `down` removes the owned runtime and volumes; it is not a reversible stop. [Commands and ports](../reference/commands.md) covers the wrapper interface.

## Beyond the explorer

[Domain labs](../labs/index.md) have their own decision owners, replay and effect contracts. A single ordered partition is not distributed writer fencing. Their [production blueprints](../blueprints/index.md), including [Signal Harbor Works](../blueprints/explorer.md), propose separate operational responsibilities; they do not describe deployed infrastructure.
