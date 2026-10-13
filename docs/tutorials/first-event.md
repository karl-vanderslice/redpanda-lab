# Publish your first event

By the end of this tutorial you will see the same record in the app and Redpanda Console, then create and drain a consumer backlog.

## 1. Start the stack

From the repository root:

```bash
nix develop --no-update-lock-file
just up
```

The command builds the app, starts the containers, waits for the three-node cluster and all browser services, then prints their URLs. Open **Stream app**. If startup fails, use [troubleshooting](../how-to/troubleshooting.md); a timeout leaves containers available for diagnosis.

## 2. Follow one record

Use the app's produce form. Give the event a key such as `warehouse-1`, choose a kind, and enter a JSON object as its payload. Submit once. The producer reports an event ID, partition, and offset when Redpanda acknowledges delivery. Watch the record appear in the consumed event list.

Open the printed Console URL, choose `lab.events`, and find the event ID. A partition is an ordered stream within a topic. An offset identifies a record's position in that partition, not a global position across the cluster.

Produce another event with the same key. With the same partition count and partitioner, it maps to the same partition. Different keys can share a partition; six partitions do not mean six distinct keys.

## 3. Build a backlog

Pause the consumer. Start the generator at **50 events per second for 30 seconds**. Watch committed lag grow while the consumed count stays still. Grafana displays the same consumer backlog alongside broker health and request traffic. Resume the consumer and watch lag return to zero.

The pause applies to the shared consumer, not just your browser. Another browser can change it. One callback already in progress can finish before pause settles.

## 4. Dispose of the lab

```bash
just down
```

This deletes the records and telemetry volumes for this checkout. Downloaded upstream images and Nix caches remain reusable. To keep exploring, leave the stack running and use `just urls` to find it again.
