# IoT

Three synthetic cold-chain sensors, an HTTP telemetry gateway, and a Kafka-backed device/alert view. No MQTT, physical devices or notifications.

```bash
labs/run iot up
labs/run iot urls
```

Open the app. Send **High temperature**, then **Normal** to open and clear an alert. **Low battery** opens a separate incident. Each new reading needs an increasing per-device sequence and a new ID; retries keep both ID and payload.

The single gateway waits for consumer completion. Restart replays `iot.events.v1`; unknown completion blocks new writes until recovery.

[API and limits](../../docs/labs/iot.md) · [Shared setup](../../README.md)

`labs/iot/e2e.sh` writes records and restarts the app. `labs/run iot down` deletes the lab log.
