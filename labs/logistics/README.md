# Wayline Dispatch

A fictional three-driver dispatch board on a synthetic 20 × 20 km grid. Request a trip, explicitly report the driver's pickup position, confirm pickup, report the destination, then complete it. Cancellation before pickup releases the driver. No GPS, routing provider or physical delivery is connected.

```bash
labs/run logistics up
labs/run logistics urls
```

[Commands, assignment and recovery](../../docs/labs/logistics.md) · [Shared setup](../../docs/labs/index.md)

Keep the exact command ID/input after uncertain completion. `just test logistics` recreates and disposes owned data; `labs/run logistics down` deletes the log. `bash labs/logistics/e2e.sh` requires a fresh running fleet and checks dispatch transitions, duplicate records and restart replay.