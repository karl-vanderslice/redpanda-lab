# Logistics

A three-driver dispatch board backed by real Redpanda events. Positions are synthetic coordinates in a 20 km square, not live GPS or Uber data.

```bash
just up logistics
just urls logistics
```

Request a trip, report its driver's pickup position, confirm pickup, report the destination, then complete it. Cancellation before pickup releases the driver. Assignment chooses the nearest available driver; ties use driver id.

One writer waits for consumed events before replying. Restart replays recorded assignments and positions. Keep mutation ids after uncertain responses; missing receipts do not prove failure.

[API, recovery and limits](../../docs/labs/logistics.md) · [Shared lifecycle](../../docs/labs/index.md)

`just test logistics` and `just down logistics` destroy this lab's history.
