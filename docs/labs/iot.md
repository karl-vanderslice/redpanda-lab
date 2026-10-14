# Cold-chain sensors

Three synthetic devices send readings through an HTTP ingestion gateway. Redpanda stores the readings; a direct KafkaJS consumer derives device history, command receipts, and temperature/battery incidents. There is no MQTT broker, physical sensor, notification service, or external provider.

## Run

```bash
labs/run iot up
labs/run iot urls
```

Open the app URL. **High temperature → Send reading** opens a temperature incident. **Normal → Send reading** clears it. **Low battery** opens a separate incident. The form suggests the next sequence after each consumed outcome. Automatic updates can be paused without losing form values.

See [commands](../reference/commands.md) for shared setup and lifecycle, or the [lab chooser](index.md) for other domains.

## Log

`iot.events.v1` has one partition. Each record uses the reading ID as its Kafka key:

```json
{"schema":1,"id":"reading-001","deviceId":"freezer-1","sequence":1,"temperatureC":-10,"batteryPercent":90,"at":1791849600000}
```

The gateway supplies `schema` and `at` (Unix milliseconds). IDs are 1–80 letters, digits, underscores, or hyphens. Sequences are positive safe integers. Temperature is finite and within −100…100 °C; battery is finite and within 0…100%. Thresholds belong to the server, not the request.

| Device | Inclusive safe range |
| --- | --- |
| `freezer-1` | −25…−15 °C |
| `cooler-1` | 2…8 °C |
| `dock-1` | 0…15 °C |

Temperature outside that range opens an incident. A subsequent accepted reading inside the range closes it. Battery below 20% opens an incident; 20% or more closes it. Repeated abnormal readings keep the existing incident open. Another abnormal reading after clearing opens a new incident. No wall-clock timer changes alert state.

## API

- `GET /health`: `{ready}`; 503 while the gateway is unavailable.
- `GET /api/state`: devices with latest reading/history, active alert IDs, complete alert/receipt lists, `lastOffset`, duplicate-record count, and unresolved completion state.
- `POST /api/readings`: `id`, `deviceId`, `sequence`, `temperatureC`, and `batteryPercent`, without `schema` or `at`. A consumed accepted reading returns 200 and its receipt.
- `GET /api/readings/:id`: the original consumed receipt, or 404 when none is observed. An unresolved local ID returns 503.

A sequence must exceed the device’s last accepted sequence; gaps are allowed. Equal/stale sequences produce durable 409 receipts without changing device or alert state. An identical ID/payload returns its original outcome. Reusing an ID for different telemetry returns 409 before publishing. Unknown devices return 404; malformed/range-invalid input returns 400. Foreign-origin writes return 403. Infrastructure failures use 5xx, not domain rejections.

## Limits

One gateway writer serializes commands through consumed completion, not merely producer acknowledgment. Do not run multiple writers or inject arbitrary records. Broker duplicates with identical telemetry preserve the first receipt and never repeat alert transitions.

Unknown append/completion pauses new writes. Keep the exact ID and payload; inspect the receipt, restart the app to replay, then retry that same command if necessary. Missing receipts alone do not prove failure. Never replace an unresolved command with a new ID.

Restart reconstructs state from Kafka only. Replay requires intact history beginning at offset zero; expired history fails startup. This disposable projection retains full history in memory and provides no production authentication or delivery SLA.

`labs/iot/e2e.sh` writes synthetic records directly through HTTP and Kafka and restarts the app. Run only against disposable lab state. `labs/run iot down` deletes its containers and log volume.
