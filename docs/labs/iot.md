# IoT: Cryowell Instruments

Cryowell Instruments is a fictional cold-chain monitoring desk. Three synthetic devices submit HTTP readings; one KafkaJS consumer derives device history, receipts and temperature/battery incidents from Redpanda. No physical sensor, MQTT broker, notification service or actuator is connected.

## Run

Use the [shared setup and lifecycle](./index.md). From the repository root:

```bash
labs/run iot up
labs/run iot urls
```

Open the reported app URL. Send a high-temperature reading, then a normal reading to open and close an incident. Low battery opens a separate incident. Each new reading needs a new ID and an increasing device sequence; retries retain the exact ID and payload.

## Readings and incidents

| Device ID | Normal range, inclusive | Fixture normal |
| --- | --- | --- |
| `freezer-1` | −25 to −15 °C | −20 °C |
| `cooler-1` | 2 to 8 °C | 4 °C |
| `dock-1` | 0 to 15 °C | 10 °C |

Temperature alerts open strictly outside these ranges. Battery alerts open below 20%; 20% is normal. An accepted abnormal reading opens one incident per condition, continued abnormal readings leave it open, and a normal reading closes it. A later recurrence gets a new incident ID, derived from its opening reading ID and condition.

Sequences are positive safe integers and must exceed the last accepted sequence for that device; gaps are allowed. Equal or stale sequences retain a 409 receipt without changing device history or alerts. The server records `at` as ingestion wall-clock time in Unix milliseconds. There is no device event-time field, lateness window, monotonic-clock check or clock-driven expiration; sequence, not time, controls acceptance.

## HTTP API

| Route | Contract |
| --- | --- |
| `GET /health` | `{ready}`; 503 when unavailable. |
| `GET /api/state` | Devices and accepted history, active and closed incidents, operations, last offset, duplicates and unresolved completion. |
| `POST /api/readings` | `id`, `deviceId`, `sequence`, `temperatureC`, `batteryPercent`; returns the consumed receipt, 200 accepted or 409 stale. |
| `GET /api/readings/ID` | Original receipt; 503 for the locally unresolved ID, otherwise 404 if not observed. |

IDs use 1–80 ASCII letters, digits, underscores or hyphens. Temperature must be finite and within −100 to 100 °C; battery must be finite and within 0 to 100%. Unknown devices return 404; invalid values return 400 before append. The server normalizes the five command fields and supplies its own `schema` and `at`; extra input fields are not command identity. POST requires `application/json`, with a 16 KiB body limit and same-origin HTTP checks when an Origin header is present. These checks are not authentication.

A receipt contains the canonical command, original record and offset, `accepted`, rejection reason, last accepted sequence and incident changes. An identical ID/payload returns that first receipt without append. Changed telemetry under an existing ID returns 409 before append.

## Log and recovery

`iot.events.v1` has one partition and replication factor 1. Schema-1 records are keyed by reading ID and contain the five command fields plus `schema` and `at`. Only consumption changes visible state; the gateway holds its command queue through consumer completion. Replay validates records and deduplicates canonical telemetry identity. A duplicate broker record may have a different valid ingestion timestamp, but cannot replace the first receipt or apply incidents twice.

After unknown completion, keep the exact ID and payload and inspect its receipt. A missing receipt does not prove failure. New readings stop until recovery; restart with `labs/run iot restart app`, wait for readiness, then inspect the ID before retrying its original input. Graceful log close waits for in-flight KafkaJS sends before disconnect, but a forced kill does not establish their outcome.

The browser preserves unresolved input in memory and attempts session storage; storage denial leaves the visible ID usable on the current page. It can look up a consumed receipt automatically, but never automatically resubmits. Retry is an explicit action, so complete writer recovery before using it. Run one gateway only and do not inject arbitrary records through Console.

Startup replays through the captured high watermark before readiness. The [full-prefix policy](../reference/tuning.md#topic-policy) retains readings until disposal; device history, receipts and incidents also grow without bounds in memory.

## Workload tuning

| Supported environment | Default | Owner |
| --- | --- | --- |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated KafkaJS broker list; Compose supplies this value. |

The app listens on container port 3000. Topic, devices, thresholds and sequence policy are code-owned. KafkaJS request and append deadlines are 30 seconds; the gateway adds a separate 30-second consumption deadline. There is no supported alert-window, MQTT, batching or retention environment knob.

Measure command queue wait, consumption latency, replay time and memory. Do not sample safety readings, relax sequence checks or raise thresholds for throughput. Device sharding needs new ownership and fleet-incident aggregation rules; extra partitions fail readiness. See [client and host limits](../reference/tuning.md).

## Proposed production architecture

[Production blueprint](../blueprints/iot.md).

A production gateway would authenticate and rotate device identities, spool readings during outages, and define device-time and sequence validation. Redpanda would retain accepted telemetry for independently rebuildable time-series/read projections; notifications and actuators would use separately reconciled delivery workflows, not replay side effects. MQTT 5 is an optional transport proposal, not a running component, and its [QoS guarantees](https://docs.oasis-open.org/mqtt/mqtt/v5.0/os/mqtt-v5.0-os.html) do not establish exactly-once actuation across the HTTP/Kafka/device boundary.

## Scenario and disposal

`just test iot` recreates owned lab data, exercises real HTTP and Kafka boundaries, inclusive thresholds, sequence races, broker duplicates and exact restart replay, then disposes the lab. The checked-in `labs/iot/e2e.sh` can also run against a disposable running instance. `labs/run iot down` deletes the log volume, not just the view. No production sensor-safety or delivery guarantee follows from this scenario.
