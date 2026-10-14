# Logistics

A dispatch board with three synthetic drivers, explicit location observations and durable trip assignments. Redpanda stores the fleet fixture, locations, decisions and rejected domain commands. There is no Uber integration, map service, live GPS, rider account or delivery effect.

```bash
just up logistics
just urls logistics
```

Open the app URL. The default pickup `(2, 2)` assigns Alex. Enter the trip id in **Progress trip**, confirm pickup, report Alex at the destination `(6, 6)`, then complete the trip. For another pickup, report the driver's position there first. **Cancel before pickup** releases an assigned driver. **Pause updates** freezes background refresh without discarding form inputs; action responses still refresh state.

See the [shared lifecycle](index.md) for logs, inspection and disposal.

## Dispatch

The fixture starts Alex at `(2, 2)`, Blair at `(8, 2)` and Casey at `(5, 8)`. Coordinates are finite numbers from 0 to 20 kilometers on each axis. The SVG plots these local coordinates, not geographic streets.

A request selects the available driver with the smallest squared Euclidean distance to pickup. Equal distances use ascending driver id. Each driver owns at most one active trip. No capacity returns a retained HTTP 409 rejection, not an unassigned booking or automatic retry.

Trips follow `assigned → picked-up → completed`. An assigned trip can instead become `cancelled`. Pickup requires the driver's recorded position to equal pickup; completion requires destination. Position reports are manual synthetic observations. Status changes never move drivers, and reaching a coordinate never advances a trip automatically. There is no speed, road, ETA or route-feasibility model.

## Log and API

`logistics.events.v1` has one partition. Each schema-1 record contains `fixtureId`, `command`, observation time `at`, and `result: {accepted, reason, effect}`; its key is the mutation id. Assignment effects include the chosen driver and both endpoints.

One app process serializes commands through consumer application, not merely producer acknowledgment. Startup reads from offset zero before readiness. Replay applies the saved driver choice rather than dispatching again; incompatible records and expired history fail closed. This is a single-writer lab, not a distributed lock or production dispatch coordinator.

| Route | Result |
| --- | --- |
| `GET /health` | `{ready}` and fault details. |
| `GET /api/state` | Fleet, trips, receipts, availability and `lastOffset`. |
| `POST /api/commands` | Consumed receipt; 409 for domain rejection. |
| `GET /api/commands/ID` | Original receipt and exact broker record. |
| `GET /metrics` | Fleet, trip, command and duplicate counters. |

Commands require a stable `id`. Kinds and extra fields:

- `request`: `tripId`, `pickup:{x,y}`, `destination:{x,y}`.
- `location`: `driverId`, `position:{x,y}`.
- `pickup`, `complete`, `cancel`: `tripId`.

Identical ids and payloads return the original result, including rejection. Conflicting payloads return 409. Invalid shapes return 400; foreign origins return 403. Infrastructure failures return 5xx.

## Recovery

An uncertain append or projection timeout stops new mutations. A later consumed event resolves that uncertainty. The browser retains the pending id and command when storage works and offers receipt lookup, never automatic resubmission.

A missing receipt proves nothing about an in-flight append. Stop the old writer and reconcile the broker before retrying an absent command with its **original id and payload**. A consumed id returns its saved receipt after restart; do not invent a replacement id. Rejected ids remain rejected even after capacity becomes available.

`just test logistics` deletes existing lab data and exercises real HTTP/broker dispatch, concurrent exclusion, transitions, stable ids, duplicate records and exact restart replay. `just down logistics` deletes its event history. Neither is safe against data worth keeping.
