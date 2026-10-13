# Read delivery and telemetry correctly

A producer acknowledgment, a consumed event, and a committed offset describe different stages. They are not interchangeable success counters.

## Delivery promises

The app uses `@confluentinc/kafka-javascript` 1.11.0 and its bundled librdkafka 2.16.0. Its native producer enables idempotence and `acks=all`. Internal producer retries do not duplicate the same delivery, but a second HTTP request is a new operation. This is not end-to-end exactly-once processing.

A produce timeout leaves completion **unknown**. The record may already exist. Search Console for the event ID before deciding whether to send a new operation. The app does not automatically retry a timed-out HTTP mutation.

The consumer group is `lab-explorer`. Processing is at-least-once. Successful offsets are committed every second, so failover or process interruption can redeliver records. `Consumed` can exceed `Produced`. Process counters reset when the app restarts.

Readiness requires leaders for all six replicated partitions, all three broker IDs in metadata, and the consumer's actual six-partition assignment. Calling `consumer.run()` is not proof of readiness. The lifecycle script also waits for a healthy three-node Admin API overview and the web services.

## What the charts mean

Lag comes from topic watermarks and broker-stored committed group offsets, queried by a separate admin client. It is not computed by subtracting the app's two counters. A backlog can remain after records are processed but before offsets commit.

Prometheus scrapes every five seconds, so a chart does not update instantly. The dashboard covers production and consumption, committed lag, delivery latency, broker availability, requests, and resource use. The three provisioned alert rules detect broker unavailability, under-replication, and paused-consumer lag growth. There is no Alertmanager or notification delivery.

Native delivery has a 30-second budget and a 10-second broker acknowledgment timeout. Leader election and consumer group reassignment can briefly stall requests. Requested pause intent is reapplied after assignments.

## Useful endpoints

| Endpoint | Meaning |
| --- | --- |
| `GET /api/stats` | Readiness, current counters, recent events, lag, and generator state. |
| `POST /api/produce` | Produce a keyed event; a 201 response includes ID, partition, and string offset. |
| `POST /api/consumer` | Set the shared boolean pause state. |
| `POST /api/generator` | Start one bounded generator; concurrent generators are rejected. |
| `POST /api/generator/stop` | Stop the current generator. |
| `GET /metrics` | App metrics in Prometheus format, with `lab_*` names. |

Payloads must be JSON objects. The generator allows at most 100 events per second. Use the UI's validation feedback rather than assuming invalid input entered the log.
