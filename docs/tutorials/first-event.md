# Publish your first event

Publish one record, find it in the app and Console, then drain a consumer backlog.

## Start

From the repository root, with the [host prerequisites](../reference/commands.md) met:

```bash
nix develop --no-update-lock-file
just up
```

Startup builds the app, waits for the three brokers and browser services, and prints URLs. Open **Stream app**. A timeout leaves containers intact; see [troubleshooting](../how-to/troubleshooting.md).

## Publish

Submit the produce form once:

- Key: `warehouse-1`
- Kind: `sensor.reading`
- Payload: `{"celsius":20}`

The acknowledgment shows an event ID, partition, and offset. Find that ID in **Recent records** and in Console's `lab.events` topic.

Submit another event with the same key. With unchanged partition count and partitioner, both use the same partition. Different keys can share a partition. Offsets are partition-local, not cluster-wide.

## Drain a backlog

Pause the **Shared consumer**, then run the generator at **50 events/second for 30 seconds**. Committed lag grows while consumption stops; Grafana shows the backlog, broker health, and request traffic. Resume consumption and wait for lag to reach zero.

Pause affects every browser. Another browser can change it; an in-progress callback can finish before pause settles.

## Dispose

```bash
just down
```

This erases this checkout's records and telemetry volumes, not downloaded upstream images or Nix caches. To keep exploring, leave it running; `just urls` prints its endpoints.
