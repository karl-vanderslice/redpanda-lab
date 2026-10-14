# Publish your first event

Use Signal Harbor Works, the fictional explorer company, to publish a record, find its partition and offset, then drain a consumer backlog.

## Start the workbench

From the checkout root, with the [host prerequisites](../reference/commands.md) met:

```bash title="Start the explorer"
nix develop --no-update-lock-file
just up
```

Startup builds the app, waits for the three brokers and web services, and prints URLs. Open **Stream app** to reach the **Stream workbench**. Use `just urls` to print the links again. A startup timeout leaves containers available for [diagnosis](../how-to/troubleshooting.md).

## Publish and find a record

In **Produce an event**, enter:

| Field | Value |
| --- | --- |
| Event key | `warehouse-1` |
| Event kind | `sensor.reading` |
| JSON payload | `{"celsius":20}` |

Select **Produce event** once. The acknowledgment includes an event ID, partition and offset. Expand that ID under **Recent records** after the consumer reads it.

Open **Redpanda Console** from the workbench or printed URLs. Browse `lab.events` and find the same ID. The workbench holds only the latest 100 consumed records in app memory; Console reads the broker topic.

Publish another event with the same key. With unchanged partition count and partitioner, both go to the same partition. Different keys can share a partition. Offsets order records within a partition, not across the cluster.

!!! warning "A timeout is not a rejected event"

    If the request times out, do not send it again immediately. Inspect Console using the ID in the error, if available. A timeout leaves the [delivery outcome unknown](../explanation/telemetry-and-delivery.md#delivery-promises).

## Build and drain a backlog

1. Under **Shared consumer**, select **Pause consumer**.
2. Start the generator at **50 events per second for 30 seconds**.
3. Watch **Produced** increase while **Committed lag** grows. Open Grafana to compare the app readings with the dashboard.
4. Select **Resume consumer**. Wait for committed lag to reach zero after processing and offset commits catch up.

Consumer pause affects the shared backend, including other browsers. An in-progress read or commit can still finish. **Pause live updates** only freezes this browser's polling; it does not pause consumption or stop the generator. **Stop generator** prevents future sends, not completion of sends already in flight.

Produced and consumed are process counters, not an accounting identity. [Delivery and telemetry](../explanation/telemetry-and-delivery.md) explains lag, redelivery and alert delays.

## Keep exploring or erase the lab

Try [stopping one broker](../how-to/failure-and-recovery.md), or inspect the [architecture](../explanation/architecture.md) and its [proposed production blueprint](../blueprints/explorer.md).

When you no longer need the records:

!!! warning "Deletion is permanent"

    `just down` deletes this checkout's explorer containers, network, broker records and telemetry volumes. To keep the data for another experiment, leave the lab running instead.

```bash title="Erase the explorer and its records"
just down
```

Downloaded upstream images and Nix caches remain.
