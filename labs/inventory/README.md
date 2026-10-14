# Cedarline Supply

A fictional stock desk for North warehouse and Quay stockroom. Receive stock, reserve available units, then release or fulfill a whole reservation. Transfer commits both location changes in one Redpanda record. Fulfillment is local accounting, not physical shipment.

```bash
labs/run inventory up
labs/run inventory urls
```

[Commands, conservation and recovery](../../docs/labs/inventory.md) · [Shared setup](../../docs/labs/index.md)

Keep the exact command ID/input after uncertain completion. Released or fulfilled reservation IDs cannot reopen or be reused. `just test inventory` recreates and disposes owned data; `labs/run inventory down` deletes the log. `bash labs/inventory/e2e.sh` requires a fresh running catalog and checks conservation, races, duplicates and restart replay.