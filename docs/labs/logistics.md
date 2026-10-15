---
description: Assign a synthetic driver, report positions, and distinguish a recorded arrival from a trip lifecycle transition.
---

# Logistics: Wayline Dispatch

Wayline Dispatch is a fictional three-driver dispatch board. Redpanda retains the fleet fixture, explicit location observations, trip assignments and rejected commands. The plotted 20 × 20 km grid is synthetic: no GPS receiver, road map, rider account, routing provider or physical delivery is connected.

## Dispatch one trip {#run}

Use the [shared setup and lifecycle](./index.md). From the repository root:

```bash title="Start the synthetic dispatch board"
labs/run logistics up
labs/run logistics urls
```

Open the app and wait for the fleet. The steps below use the untouched fixture; with earlier trips, first inspect driver availability and the assignment receipt.

1. Under **Request trip**, keep the generated **Trip ID**. Leave pickup at **(2, 2)** and destination at **(6, 6)**, then select **Assign nearest driver**. On the untouched fixture, Alex (`driver-1`) is already at pickup and receives the assignment.
2. Copy that Trip ID into **Progress trip**; this field is not filled automatically. Select **Confirm pickup**. If the assigned driver is elsewhere, first use **Report driver position** to record the exact pickup coordinates.
3. Open **Report driver position**, select the assigned driver, enter **X = 6**, **Y = 6** and select **Record position**. The map moves the driver, but the trip remains picked up.
4. In **Progress trip**, keep the same Trip ID and select **Complete trip**. The assignment ledger reports `completed`, and the driver becomes available again.

Position and lifecycle are separate commands: reaching a plotted destination does not complete a trip. **Cancel before pickup** releases an assigned driver but cannot cancel a picked-up trip. These are synthetic observations and accounting transitions, not evidence of physical travel.

**Pause updates** freezes this browser's automatic view without discarding form input. Use **Refresh view** for an explicit observation; pausing does not stop the backend.

## Dispatch and location contracts

The logged `synthetic-grid-v1` fixture starts Alex (`driver-1`) at `(2,2)`, Blair (`driver-2`) at `(8,2)` and Casey (`driver-3`) at `(5,8)`, all available. Coordinates are finite numbers in the inclusive range 0–20 km on each axis, not geographic latitude/longitude.

Requests choose the available driver with minimum squared Euclidean distance from the recorded position to pickup. Ties use ascending driver ID. A driver can own only one active trip; no capacity is a retained rejection, not an unassigned booking or automatic retry.

Trips follow `assigned → picked-up → completed`, or `assigned → cancelled`. Pickup requires exact coordinate equality with pickup, and completion requires exact equality with destination. Only an assigned trip can be cancelled. Location commands explicitly change the recorded position, including while busy; status changes never move a driver, and location arrival never advances trip status. There is no speed, ETA, route feasibility, freshness deadline or GPS sequence guard.

## HTTP API

| Route | Result |
| --- | --- |
| `GET /health` | Readiness and fault; 503 while unavailable. |
| `GET /api/state` | Drivers, trips, availability, command summaries, uncertain ID, duplicates and last offset. |
| `POST /api/commands` | Consumed receipt: 200 accepted, 409 retained domain rejection. |
| `GET /api/commands/ID` | Original receipt including the exact record; 404 if not consumed. |
| `GET /metrics` | Available drivers, trip/command totals and duplicates. |

All commands require `id` and `kind`:

| Kind | Other fields |
| --- | --- |
| `location` | `driverId`, `position:{x,y}` |
| `request` | `tripId`, `pickup:{x,y}`, `destination:{x,y}` |
| `pickup`, `complete`, `cancel` | `tripId` |

Identifiers use 1–80 ASCII letters, digits, underscores or hyphens; `synthetic-grid-v1` is reserved for internal initialization. Extra fields or malformed coordinates return 400 before append. Unknown drivers/trips and illegal lifecycle transitions are valid commands with retained 409 outcomes. POST requires `application/json`, a body no larger than 16 KiB and same-origin HTTP when Origin is supplied. This is a local operator interface without authentication.

An identical ID and command returns its original receipt without appending, including an old rejection after capacity changes. Conflicting input returns 409 before publication. Receipts contain `id`, canonical `command`, original offset and audit timestamp, complete `result` and `record`.

## Log and recovery

`logistics.events.v1` has one partition and replication factor 1. Its keyed schema-1 record contains `fixtureId`, `command`, `at` and `result:{accepted,reason,effect}`. Assignment effects retain the chosen driver and endpoints. Replay applies that saved assignment rather than rerunning nearest-driver selection, validates its consistency with available fleet state, and recomputes other transitions. Exact duplicate records cannot apply an effect twice; conflicting records fail the consumer.

One owner holds its command queue through consumption, not just producer acknowledgment. `at` is server wall-clock audit metadata in Unix milliseconds, not physical arrival time or a monotonic location clock. Ordering comes from Kafka offsets. All fleet, trips and receipts are in memory; restart reconstructs them through a fresh consumer group and the captured startup high watermark. A nonzero low watermark or additional partition prevents readiness.

Unknown completion blocks new writes. Inspect the original command ID; an absent receipt is not evidence of failure. A later consumed record can restore readiness. Otherwise use `labs/run logistics restart app`, wait for readiness, inspect the receipt and only then retry the exact original input. Do not replace the ID or retry while the old writer can publish. Graceful close waits for pending KafkaJS sends before disconnect; forced termination leaves uncertainty.

The browser keeps pending input in memory and attempts local storage, offers receipt lookup and never automatically resubmits. If storage is denied, copy the visible ID/input before leaving the page. A missing receipt leaves new actions blocked rather than silently replacing the command.

The [full-prefix policy](../reference/tuning.md#topic-policy) retains dispatch history until disposal; trips and receipts also grow without bounds in memory. Keep one process owner: its queue is not a dispatch lease or distributed fence.

## Workload tuning

| Supported environment | Default | Owner |
| --- | --- | --- |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated KafkaJS broker list; Compose supplies it. |

Container port 3000, fixture, grid bounds, dispatch selection and exact-position rules are code-owned. Shared KafkaJS request/append deadlines are 30 seconds, with another 30-second consumption deadline. No dispatch radius, routing provider, GPS window, batching or retention environment option exists.

Measure candidate scans/sorting, queue wait and state serialization. Any spatial index must leave assignment under exclusive authority; geographic sharding needs driver fencing and cross-zone handoff. Do not parallelize assignments to the same driver or discard location/lifecycle commands. See [client and host limits](../reference/tuning.md).

## Proposed production architecture

[Production blueprint](../blueprints/logistics.md).

Production would add authenticated device observations, freshness checks and a dispatch lease/fence before commands reach the authoritative log. Routing and spatial read projections would support decisions without becoming independent assignment writers; driver notifications and proof of delivery would require their own reconciled workflows. Those components do not run here, and a consumed `completed` trip is not evidence that a person or parcel arrived.

## Scenario and disposal

`just test logistics` recreates owned data, exercises real HTTP/Kafka dispatch, busy-driver exclusion, ties, location-gated transitions, ID races, broker duplicates and exact restart replay, then disposes the lab. `labs/logistics/e2e.sh` requires a fresh running fixture. `labs/run logistics down` deletes all owned event history; neither command is safe for dispatch data worth retaining.
