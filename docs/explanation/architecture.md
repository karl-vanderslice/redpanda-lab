# Explorer architecture

The explorer connects a browser workbench to a Redpanda cluster and a set of inspection tools. Redpanda retains the records and committed consumer offsets. The app keeps counters and a recent view of the latest 100 consumed records in process memory, so those reset when it restarts.

The browser sends HTTP commands to the app, whose native Kafka client publishes and consumes `lab.events` directly. Redpanda Console lets you inspect the cluster. Prometheus collects broker and app metrics, and Grafana turns those readings into dashboards. Broker zero also exposes Schema Registry and HTTP Proxy as separate endpoints.

## Brokers and ordering

`lab.events` has six partitions and replication factor three: a leader and two followers per partition. Ordering is partition-local. With a majority available, the cluster can elect new leaders after one broker process stops. This is the mechanism exercised by [failure and recovery](../how-to/failure-and-recovery.md).

All three brokers share one host. Each starts with `--mode=dev-container --smp=1 --memory=1G --reserve-memory=0M` to support the local demonstration. For production capacity and durability, plan around independent failure domains and supported storage settings; a successful acknowledgment in this mode alone cannot establish stable-storage durability. See [delivery versus storage](../reference/tuning.md#delivery-is-not-stable-storage).

The explorer requests a six-hour event retention window when creating its topic. Prometheus has separate six-hour/256 MB retention limits. Application restart resets the app counters and recent view; committed group offsets remain in the broker. This differs from ordinary application labs, which reconstruct domain state from a complete prefix. [Topic policy](../reference/tuning.md#topic-policy) describes both.

## Addresses depend on the client

Container clients use `redpanda-0:9092` through `redpanda-2:9092`. Host clients use the printed loopback ports. Advertised Kafka addresses must be reachable from the client: publishing a port does not make internal container names resolvable on the host.

Use `just urls` rather than assuming a port. Console can inspect topics, groups, schemas and the Admin API. The provisioned Grafana dashboard has no login requirement; [delivery and telemetry](telemetry-and-delivery.md) explains its measurements.

Console, Grafana and Prometheus are unmodified upstream interfaces. A rendered review of the pinned versions found unnamed Console 3.12.0 Messages controls and horizontal overflow on that page at 320 CSS pixels, and Prometheus 3.13.4 target-health control text measured 3.55:1 contrast. The lab does not patch upstream interfaces; use the API or `rpk` when those pages do not suit your keyboard, screen reader or zoom setting.

## Runtime ownership

The `lab` wrapper derives a Compose project name from the checkout's absolute path. Named volumes hold broker and telemetry data, outside the repository. Port state and lifecycle locks live under `${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/`.

`up` and `down` serialize through `flock`. Containers must not inherit that lock descriptor. Initial port probes reduce collisions but cannot prevent another process binding before startup. Diagnose collisions without stopping unrelated processes.

Before moving a checkout, dispose of its lab or keep the original path available for cleanup. `down` permanently removes that lab's runtime and volumes. [Commands and ports](../reference/commands.md) covers the wrapper interface.

## Podman or Kubernetes?

Rootless Podman keeps the local workflow focused on event delivery, application decisions and recovery. The existing wrappers handle image identity, readiness, loopback ports, checkout-specific resources and deliberate data disposal.

[kind can run Kubernetes on rootless Podman](https://kind.sigs.k8s.io/docs/user/rootless/). It's useful when you want to explore Kubernetes itself, and brings a few additional responsibilities:

| Concern | Current lab | A kind-based deployment would also need |
| --- | --- | --- |
| Images | Load or build the exact app image in Podman. | Import it into the node's containerd image store and preserve the intended pull policy. |
| Addresses | Use the printed loopback endpoints or container-network names. | Distinguish pod/service addresses, Kafka advertised listeners and host access. |
| Data | Named volumes survive an app restart and are deleted by the selected lab's `down`. | Define PVC retention, storage-class behavior and what namespace or cluster deletion means for each dataset. |
| Recovery | Restart an owned process and inspect its retained log. | Reconcile pod/controller rollout state as well as broker and application readiness. |

A StatefulSet with a retained PVC can preserve broker data across pod replacement. You still need backups, independent host failure domains and an application writer fence. Several labs require exactly one matcher, scheduler or effect owner, so replica management must respect that ownership.

Use Kubernetes when controllers, storage and operational reconciliation are part of what you want to learn. The repository currently supports the Podman workflow; Kubernetes, Helm and operator deployments would be separate implementations. The [production blueprints](../blueprints/index.md) can help you plan the responsibilities involved.

## Beyond the explorer

Each [domain lab](../labs/index.md) has its own decision owner, replay rules and external-effect handling. Keep that ownership intact as you explore: ordering within a partition alone cannot fence a competing writer. The [production blueprints](../blueprints/index.md), including [Signal Harbor Works](../blueprints/explorer.md), show how these responsibilities could be separated in a larger system.
