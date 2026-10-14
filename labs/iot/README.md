# Cryowell Instruments

A fictional cold-chain desk with three synthetic devices. Send a high-temperature reading, then a normal reading to open and close an incident. Low battery is a separate incident. No physical sensors, MQTT or notifications are connected.

```bash
labs/run iot up
labs/run iot urls
```

[Readings, thresholds and recovery](../../docs/labs/iot.md) · [Shared setup](../../docs/labs/index.md)

Keep the exact reading ID and payload after uncertain completion. `just test iot` recreates and disposes owned data; `labs/run iot down` deletes the log. `bash labs/iot/e2e.sh` requires a disposable running app and writes HTTP/Kafka records, including restart replay.