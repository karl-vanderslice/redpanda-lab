# Delivery and telemetry

A producer acknowledgment, consumer processing and offset commit are separate events. The explorer exposes each so you can observe the difference.

## Delivery promises

The explorer uses `@confluentinc/kafka-javascript` 1.11.0 with bundled librdkafka 2.16.0. Its producer enables idempotence, permits one in-flight request and requests `acks=all` (`-1`). Within that producer session, protocol retries preserve the same operation. Submitting another HTTP request creates a new event ID, so end-to-end exactly-once processing would need additional application-level handling.

A produce timeout means **outcome unknown**. Inspect `lab.events` in Console before resubmitting; search by event ID when the response provides one. Browser mutations are not automatically retried. A missing record in the latest-100 app view does not establish that publication failed.

Native delivery has a 30-second budget and a 10-second broker acknowledgment timeout. Elections and reassignment can stall requests. The browser can time out before native delivery finishes. These deadlines do not cancel a broker append.

Consumer group `lab-explorer` processes at least once and commits successful offsets every second. Failover or interruption can redeliver records, so **Consumed** can exceed **Produced**. Both counters reset on app restart. Shared pause intent is reapplied after reassignment; an in-progress read or commit can still finish.

`acks=all` is the client request, not a promise that every replica or stable disk acknowledged. Redpanda uses Raft majority commitment, and these brokers use development-mode storage settings. See [delivery versus stable storage](../reference/tuning.md#delivery-is-not-stable-storage) before drawing durability conclusions.

## Readiness

The app waits for six partitions with leaders and three replicas each, three broker IDs in metadata, and an actual six-partition consumer assignment. Merely calling `consumer.run()` is insufficient. The wrapper also waits for a healthy three-node Admin API overview, Console, Grafana and Prometheus before reporting startup complete.

Readiness gives you a known starting point. During an experiment, keep an eye on errors, current broker state and lag to follow changes in health.

## What the charts mean

A separate admin client queries partition watermarks and broker-stored group offsets. **Committed lag** is their difference, using the retained low offset when no commit exists. Counter subtraction is not lag; processed records may still be uncommitted.

Prometheus scrapes and evaluates rules every five seconds. Grafana shows production, consumption, committed lag, creation-to-consumption latency, broker availability, requests and resource use. The latency chart includes time spent waiting in a paused backlog, which is useful when exploring the consumer's experience. Measuring broker append latency needs a separate observation.

| Alert | Condition and limit |
| --- | --- |
| Broker unavailable | A failed metrics scrape for 30 seconds. Scrape reachability is not Kafka readiness. |
| Under-replication | Reported live, lagging replicas for one minute. Unreachable replicas are not counted; a missing series leaves the rule inactive. |
| Paused-consumer lag | Shared consumer paused, positive lag and growth across the last minute, sustained for 30 seconds. A short demonstration may not fire it. |

You can inspect alert states in Prometheus. Delivering those alerts would require an Alertmanager and a notification configuration.

## Explorer HTTP endpoints

| Endpoint | Contract |
| --- | --- |
| `GET /api/stats` | Readiness, broker/partition readings, counters, recent records, lag and generator state. |
| `POST /api/produce` | `{key, kind, payload}`; 201 returns event ID, partition and string offset. |
| `POST /api/consumer` | `{paused}` with a boolean; changes shared consumer pause intent. |
| `POST /api/generator` | `{rate, duration}`; starts one bounded generator, rejects concurrent starts. |
| `POST /api/generator/stop` | Stops future generator sends; in-flight sends can complete. |
| `GET /metrics` | Prometheus process and `lab_*` application metrics. |

Every POST, including generator stop, must send JSON with `Content-Type: application/json` (otherwise 415). A browser Origin must be the same loopback origin (otherwise 403); command-line callers may omit it. The body limit is 64 KiB. Event keys contain 1–200 characters. Kinds are `order.created`, `payment.received` or `sensor.reading`, and payloads must be JSON objects. Generator rate is an integer from 1–100 events/second; duration is an integer from 1–300 seconds. Rejected input does not enter the topic.

These are explorer contracts. Domain applications have separate receipt, reconstruction and uncertain-effect rules in their [lab guides](../labs/index.md).
