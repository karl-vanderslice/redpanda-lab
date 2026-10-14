# Delivery and telemetry

Acknowledgment, consumption, and offset commit are separate stages.

## Delivery promises

The explorer uses `@confluentinc/kafka-javascript` 1.11.0 with bundled librdkafka 2.16.0, producer idempotence, and `acks=all`. Native retries do not duplicate the same delivery; another HTTP request creates a new operation. This is not end-to-end exactly-once processing.

A produce timeout means **outcome unknown**. Inspect Console before resubmitting; search by event ID if available. HTTP mutations are not automatically retried.

Group `lab-explorer` processes at-least-once and commits successful offsets every second. Failover or interruption can redeliver records: `Consumed` may exceed `Produced`. App counters reset on restart.

Native delivery has a 30-second budget and 10-second broker acknowledgment timeout. Elections and reassignment can stall requests. Pause intent survives reassignment.

Readiness requires six replicated partitions with leaders, three broker IDs in metadata, and actual six-partition consumer assignment, not merely `consumer.run()`. Startup also waits for a healthy three-node Admin API overview and web services.

## What the charts mean

A separate admin client queries watermarks and broker-stored committed offsets for lag. Counter subtraction is not lag; processed records can remain uncommitted.

Prometheus scrapes every five seconds. Grafana covers production, consumption, committed lag, creation-to-consumption latency (including backlog time), broker availability, requests, and resource use.

Provisioned alerts have delays:

- Broker scrape unavailable: 30 seconds; not Kafka readiness.
- Under-replication: live lagging replicas for one minute, not unreachable replicas. Missing series leaves the rule inactive, not proof of health.
- Paused-consumer lag: positive and increasing over the last minute, sustained for 30 seconds.

No Alertmanager or notification delivery is configured.

## Useful endpoints

| Endpoint | Result |
| --- | --- |
| `GET /api/stats` | Readiness, counters, recent records, lag, generator state. |
| `POST /api/produce` | Keyed event; 201 includes ID, partition, string offset. |
| `POST /api/consumer` | Shared boolean pause state. |
| `POST /api/generator` | One bounded generator; concurrent starts rejected. |
| `POST /api/generator/stop` | Stop generator; in-flight sends can complete. |
| `GET /metrics` | Prometheus app metrics with `lab_*` names. |

Payloads must be JSON objects. Generator limit: 100 events/second. Rejected input does not enter the topic; the UI reports validation errors.
