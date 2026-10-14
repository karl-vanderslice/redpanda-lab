# Folio Harbor Archives

A fictional archival work-item ledger. Create an item, assign an archivist, close it with an audit note, then reopen it. Rebuild from the log closes the owner, clears memory and replays the actual Kafka prefix; it appends no rebuild events. No archival files or external archive are connected.

```bash
labs/run event-log up
labs/run event-log urls
```

[Item contracts, exact rebuild evidence and recovery](../../docs/labs/event-log.md) · [Shared setup](../../docs/labs/index.md)

Run one owner and retain the complete unmodified prefix. Keep the exact command ID/input after uncertain completion; a missing receipt does not prove failure. `just test event-log` recreates and disposes owned data; `labs/run event-log down` deletes the log. `bash labs/event-log/e2e.sh` requires a fresh running topic and checks transitions, duplicates, restart and exact rebuild equality.