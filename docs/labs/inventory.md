# Inventory: Cedarline Supply

Cedarline Supply is a fictional two-location stock desk. Redpanda stores its versioned catalog, initial stock, reservations and complete movement outcomes; one consumer owns the visible stock sheet. Receiving, transferring and fulfillment are local accounting commands, not scanner observations, supplier deliveries or physical shipments. No inventory database or warehouse system is connected.

## Run

Use the [shared setup and lifecycle](./index.md). From the repository root:

```bash
labs/run inventory up
labs/run inventory urls
```

Receive stock, reserve available units, then release or fulfill that reservation. Transfer moves unreserved stock between North warehouse and Quay stockroom in one record. Reservation IDs remain stable for the reservation's lifetime; each new command has its own ID. Polling preserves inputs and can be paused.

## Catalog and conservation

The internal `catalog-v1` initialization is the first consumed record at offset zero. The API cannot edit the catalog or initial stock.

| Product ID | Unit | North (`north`) | Quay (`quay`) | Initial total |
| --- | --- | --- | --- | --- |
| `field-tote` | unit | 12 | 8 | 20 |
| `shelf-tray` | unit | 18 | 10 | 28 |
| `packing-wrap` | roll | 24 | 16 | 40 |

Every cell starts with reserved 0. Always `available = onHand - reserved`, with nonnegative integer quantities. Per product, `initial + received = onHand + fulfilled`; per-product on-hand/reserved totals equal their location sums.

Receive adds on-hand units. Reserve moves available units into reserved without changing on-hand. Release frees a whole active reservation without changing on-hand; fulfill reduces both on-hand and reserved and adds fulfilled units. A reservation ends as `released` or `fulfilled`; neither can reopen, and its ID can never be reused. There is no partial fulfillment, expiry timer, damage/write-off or return operation.

Transfer moves only available stock and commits both resulting cells in one event. It preserves per-product totals and cannot move reserved units. The code-owned lifetime cap is 1,000,000,000 units per product for `initial + received`, across all locations. Fulfillment does not restore that lifetime allowance.

## Commands and HTTP API

Every command requires `id` and `kind`:

| Kind | Other fields |
| --- | --- |
| `receive` | `productId`, `locationId`, `units` |
| `reserve` | `productId`, `locationId`, `units`, `reservationId` |
| `transfer` | `productId`, source `locationId`, `units`, `destinationId` |
| `release`, `fulfill` | `reservationId` |

IDs use 1–80 ASCII letters, digits, underscores or hyphens; `catalog-v1` is reserved. Units are safe integers from 1 to 1,000,000,000. Extra fields or invalid units return 400 before append. Unknown catalog references, insufficient available stock, same-location transfers, lifetime-cap breaches and illegal reservation transitions are valid commands with retained 409 rejection receipts.

| Route | Result |
| --- | --- |
| `GET /health` | Readiness and fault; 503 while unavailable or stopping. |
| `GET /api/state` | Catalog, stock, reservations, conservation totals, limit, commands, duplicates and offsets. |
| `POST /api/commands` | Complete consumed receipt; 200 accepted or 409 domain rejection. |
| `GET /api/commands/ID` | Original receipt and exact record; 404 if not consumed. |
| `GET /metrics` | Command/duplicate counters and per-product on-hand/reserved/available gauges. |

POST requires `application/json`, at most 16 KiB, and same-origin HTTP when Origin is supplied; there is no operator authentication. Identical IDs and input return the original receipt without append, including old rejections after stock changes. Changed input under an existing ID returns 409 without a new receipt.

Receive two Field totes:

```bash
APP=$(labs/run inventory urls --json | jq -er '.app')
curl --fail-with-body -H 'content-type: application/json' \
  --data '{"id":"receive-01","kind":"receive","productId":"field-tote","locationId":"north","units":2}' \
  "$APP/api/commands"
```

## Log, clocks and recovery

`inventory.events.v1` has one partition and replication factor 1. Keyed schema-1 records are `{schema,fixtureId,at,command,result}`. Results retain `accepted`, `reason` and `effect`: accepted effects contain complete affected cells, reservation when applicable and per-product totals; initialization also retains the full catalog. A rejection has a reason and `effect:null`.

Only consumption changes stock. One process serializes commands through consumption, not just acknowledgment, and replay checks each full outcome against preceding state. Exact duplicate records do not move stock twice. Conflicts, invalid data, a non-initialization first record, offset gaps and expired prefixes fail closed. The owner queue is not a distributed fence; adding app replicas or partitions breaks this contract.

`at` is server wall-clock audit time in Unix milliseconds, validated as a nonnegative safe integer. It does not expire reservations or reorder inventory. No stale event-time correction, reservation TTL or monotonic-clock policy is implemented.

After unknown completion, inspect the exact command ID. A missing receipt is not proof of failure, and new writes stop until the uncertain record is consumed or the owner is recovered. Use `labs/run inventory restart app`, wait for readiness, inspect the receipt and only then retry the original ID/input. Graceful shutdown drains admitted commands, and shared log close waits for in-flight KafkaJS sends before disconnect. Forced termination does not prove nonpublication.

The browser preserves submitted input in memory and attempts local storage; it never automatically resubmits. The retry control requires explicit confirmation that the old writer was stopped and restarted. Storage denial does not block on-page operations, but copy pending input before leaving the page.

Startup replays the complete prefix through its captured high watermark. The [topic policy](../reference/tuning.md#topic-policy) retains stock history until disposal; command/reservation maps also grow without bounds. Missing history fails closed, with no snapshot or database fallback.

## Workload tuning

| Supported environment | Default | Owner |
| --- | --- | --- |
| `KAFKA_BROKERS` | `redpanda:9092` | Comma-separated KafkaJS broker list; Compose supplies it. |

Container port 3000, catalog, unit/lifetime cap and whole-reservation rules are code-owned. KafkaJS request/append deadlines are 30 seconds; the inventory owner has a separate 30-second consumption deadline. Compose supplies a read-only nonroot app, 16 MiB temporary filesystem and 75-second stop grace period. No supported `RESERVATION_TTL`, `MAX_STOCK`, warehouse-count or transfer-batch variable exists.

Measure hot-product queue wait, replay RSS and stock-response serialization. A read index must not authorize reservations from stale stock. Sharding needs cross-shard transfer and conservation rules; adding partitions or batching acceptance does not preserve the current single-record transfer. See [client and host limits](../reference/tuning.md).

## Proposed production architecture

[Production blueprint](../blueprints/inventory.md).

Production would add authenticated warehouse/catalog adapters and audited receiving or cycle-count observations, while a fenced owner keeps reservations and conservation authoritative in Redpanda. A stock read store would remain a projection; an idempotent fulfillment outbox and receipt reconciliation would connect committed reservations to actual shipment workflows. Those components are absent here: local `fulfilled` accounting neither sends a parcel nor proves delivery, and cross-shard transfer would require a new protocol.

## Scenario and disposal

`just test inventory` recreates owned data, exercises real HTTP/Kafka catalog initialization, independent conservation checks, reservation races, terminal IDs, two-sided transfers, the lifetime cap, broker duplicates and exact restart replay, then disposes the lab. `labs/inventory/e2e.sh` requires a fresh running catalog. `labs/run inventory down` deletes the owned log volume and every recovery receipt; Nix outputs and reusable images remain cached.
