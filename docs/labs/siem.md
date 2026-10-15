---
description: Correlate synthetic authentication and network observations, inspect the evidence, and triage an incident through recorded decisions.
---

# Vesper Lantern Networks

Vesper Lantern Networks is a fictional security desk for synthetic authentication and network observations. One Node HTTP owner publishes to `siem.events.v1`; its consumer alone changes the incident queue, evidence and receipts. There is no database, packet capture, remote collector, customer traffic or notification service.

## Run and inspect

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash title="Start the synthetic security desk"
./labs/run siem up
./labs/run siem urls --json
```

Open the app and wait for the owner to become ready. No collector or capture permission is needed.

1. In **Ingest observations**, select **Ingest fixture sequence** once. The browser sends three authentication failures, a matching success and four observations of distinct destination ports.
2. Select **Authentication burst** in **Incident queue**. In a fresh lab it is high severity: the three failures opened a medium incident, and the linked success raised its severity. Inspect **Correlation evidence** and follow an event link to its original consumed receipt.
3. Compare **Multi-port observation**. Its four distinct ports open a separate medium incident; observing a port does not prove that a connection succeeded.
4. Keep or enter a synthetic analyst ID, then select **Acknowledge**. The incident changes to acknowledged and gains a recorded transition.
5. Select **Resolve**. The default **Open and acknowledged** filter now hides that resolved incident. Switch to **All incidents** to inspect its retained evidence and transition history.

The analyst field is recorded text, not a sign-in. A rule match is a prompt to inspect evidence, not a verdict that an attack or compromise occurred. Existing history can change the displayed incident count and revisions.

The timeline shows the latest 100 telemetry receipts; `/api/state` exposes the complete projection. Automatic reads run every 2.5 seconds. **Pause updates** stops automatic display updates, including an automatic read already in flight; **Refresh** still reads and displays state. Neither stops ingestion or correlation.

## Telemetry contract

`POST /api/telemetry` accepts one object with these fields. Unknown fields are rejected. IDs and entities use 1–80 ASCII letters, digits, underscores or hyphens. Addresses must be canonical IPv4 addresses in the RFC 5737 documentation ranges `192.0.2.0/24`, `198.51.100.0/24` or `203.0.113.0/24`.

| Field | Contract |
| --- | --- |
| `id` | Stable ID shared across telemetry and incident commands |
| `eventTime` | Integer Unix milliseconds in [2000, 2100) |
| `sensor`, `srcIp`, `dstIp` | Synthetic source identifier and documentation addresses |
| `kind` | `auth.failure`, `auth.success` or `flow` |
| `actor` | Required for authentication; forbidden for flow |
| `dstPort`, `protocol` | Flow only: integer 1–65535 and `tcp` or `udp` |

The owner rejects telemetry more than 300,000 ms ahead of its wall clock before publication. After the first accepted event, a timestamp more than 300,000 ms beyond the maximum accepted event time receives a durable `time-jump` rejection. Neither guard makes this a historical backfill API.

```bash
app=$(./labs/run siem urls --json | jq -er .app)
time_ms=$(date +%s%3N)
jq -nc --argjson time "$time_ms" '{
  id:"lantern-auth-001", eventTime:$time, sensor:"lantern-edge",
  srcIp:"192.0.2.17", dstIp:"198.51.100.24",
  kind:"auth.failure", actor:"mira-synthetic"
}' | curl --fail-with-body -sS "$app/api/telemetry" \
  -H 'content-type: application/json' --data-binary @-
```

On an existing idle stream, a current timestamp can exceed the logged advance bound. Inspect `maxEventTime` and the receipt rather than replacing its ID to evade rejection.

### Imported JSON

The same route accepts this exact `network-json` subset, not arbitrary security JSON, syslog, ECS, OCSF or a vendor adapter:

```json
{
  "format": "network-json",
  "event_id": "lantern-import-001",
  "timestamp": "2026-10-13T22:00:00.000Z",
  "event_type": "authentication",
  "sensor": "lantern-edge",
  "source": { "ip": "192.0.2.17" },
  "destination": { "ip": "198.51.100.24" },
  "user": { "name": "mira-synthetic" },
  "outcome": "failure"
}
```

The timestamp must be valid canonical UTC ISO 8601 with milliseconds. Authentication requires a `user` object with a `name` key and `outcome` (`failure` or `success`), and forbids `destination.port` and `transport`. A `connection` requires `event_type: "connection"`, `destination.port` and `transport` (`tcp` or `udp`), and forbids `user` and `outcome`. Extra nested fields are rejected. The receipt stores normalized telemetry, not a lossless original document. Equal native/imported normalized values under the same ID return the original receipt; different values return 409 without another append.

## Correlation and review

Windows are fixed UTC minutes: `[floor(eventTime / 60000) × 60000, start + 60000)`. They are not sliding windows. Events across a minute boundary never combine, even one millisecond apart.

| Rule | Entity and threshold | Evidence |
| --- | --- | --- |
| `brute-force` | Same sensor, source IP, destination IP and actor; three failures | All accepted failures plus matching successes at or after the third failure's event time, ordered by event time then ID |
| `multi-port` | Same sensor, source IP, destination IP and protocol; four distinct destination ports | All accepted observations in the bucket, including repeated ports |

Both open medium-severity incidents. Linked authentication success raises severity to high. Earlier successes and other actors do not link. Port observations say nothing about packet flags, reachability or connection success; a match is not proof of compromise.

Incident IDs are `inc-` plus the first 32 hexadecimal SHA-256 characters of compact JSON `[rule,windowStart,sensor,srcIp,dstIp,actorOrProtocol]`. Distinct telemetry IDs remain distinct observations even when their fields match.

The global watermark is `maximumAcceptedEventTime - 30000`. An event exactly at the existing watermark is accepted; an earlier event receives a durable `late-event` rejection. Rejections do not advance time. There is no idle timer or wall-clock expiry. One fast sensor advances the watermark for all sensors. Accepted reordered events recompute their entity's minute from retained candidates. All buckets, including historical and below-threshold buckets, remain in memory.

Review commands contain `id`, an actual `incidentId`, `action`, positive integer `expectedRevision` and synthetic `analyst`. `acknowledge` changes open to acknowledged; `resolve` changes open or acknowledged to resolved; `reopen` changes resolved to open. Accepted changes increment revision and append an evidence-bearing transition. New evidence reopens resolved incidents but preserves acknowledged status. Missing incidents, stale revisions and invalid transitions receive durable rejected receipts.

## API and fixture receipts

| Route | Result |
| --- | --- |
| `GET /health` | 200 after replay while accepting work; otherwise 503 |
| `GET /api/state` | Rules, readiness, unknown command, watermark, buckets, incidents, operations, offsets and duplicate count |
| `POST /api/telemetry` | Normalized or imported telemetry, completed through consumption |
| `GET /api/events/ID` | Original telemetry receipt, including rejection |
| `GET /api/receipts/ID` | Original telemetry or review receipt |
| `GET /api/incidents/ID` | Current incident, evidence links and transition history |
| `POST /api/incidents/actions` | Revision-checked review |
| `POST /api/fixtures` | Eight sequential telemetry records; not an atomic batch |

Fixture input is `{id,sensor,eventTime}`: ID 1–40 identifier characters and a minute-aligned Unix millisecond time. It generates three failures at +0/+1,000/+2,000 ms, a success at +3,000 ms, then TCP ports 22/80/443/8080 at +4,000 through +7,000 ms. IDs are `ID-fail-1` through `ID-fail-3`, `ID-success` and `ID-port-PORT`. All use source `192.0.2.17`, destination `198.51.100.24` and authentication actor `mira-synthetic`. If the last generated event would exceed the future-clock guard, the whole fixture fails with 400 before publication. Inspect every returned receipt. A transport failure can leave a consumed prefix; retry the same fixture payload and IDs.

The browser sends equivalent individual `/api/telemetry` requests, with failure suffixes `-failure-0` through `-failure-2`. It stops on rejection or unknown completion. Its generated minute is clamped to the logged five-minute advance bound, reserving 7,000 ms for the sequence. Initial native/import sample times are also clamped after replay. These are synthetic samples and can be behind wall time after idle; they are never current network telemetry.

Malformed input, JSON/media/origin violations and the future-clock guard reject before publication. HTTP 200 means consumed and accepted. HTTP 409 with `command` and `outcome` is a durable domain rejection; 409 without a receipt is an ID conflict. Unknown completion returns 503 with `outcomeUnknown:true`. Missing receipts do not prove failed publication. Shared JSON bodies are limited to 16,384 bytes; Origin checks are not authentication.

## Replay and recovery

Records contain `{schema:1,command,outcome}`. Complete immutable outcomes include acceptance, reason, before/after watermark, bucket key and any resulting incident. Receipts add the first consumed offset. Later evidence does not rewrite old receipts.

The owner serializes commands through consumption. Replay validates normalized commands, key, partition and complete deterministic outcomes. Identical broker duplicates preserve the first receipt without another domain effect; conflicting or invalid records stop the consumer. Only this HTTP owner is supported for writes. Direct broker production is for controlled duplicate proof, not general ingestion. Do not run a second owner.

On unknown append or consumer completion, writes stop and state retains the exact unresolved command. Look up its receipt, restart the app for full replay, inspect again, then retry the exact ID and payload only if still needed:

```bash
./labs/run siem restart app
./labs/run siem logs app
```

The browser retains uncertain payloads in optional storage, or memory if storage is denied. Copy the unresolved payload before closing a storage-denied page. Shutdown blocks new admission, drains admitted work, and the shared log awaits in-flight KafkaJS sends before disconnect. A deadline does not cancel a send.

The [full-prefix policy](../reference/tuning.md#topic-policy) retains telemetry and review history until disposal. Candidate state, receipts and response sizes also grow without bounds. Replay requires one partition and offset zero. `./labs/run siem down` deletes this evidence; it is not recovery.

## Workload tuning

`KAFKA_BROKERS` is the only application connection setting: comma-separated addresses, default `redpanda:9092`, also supplied by Compose. The runner supplies `LAB_APP_IMAGE` and loopback `APP_PORT`; the app listens on container port 3000. Window, lateness, advance bounds, thresholds and 30-second consumer wait are code-owned constants, not environment options. The image is nonroot/read-only, capability-dropped, with a 16 MiB non-executable `/tmp`; it needs no capture permission or credentials.

Measure candidate cardinality, full-state response size, correlation cost and consumed-receipt lag. Changing windows, source watermarking or candidate expiry changes evidence semantics. A bounded search projection and evidence archive are proposals, not current limits. See [client and host limits](../reference/tuning.md).

## Proposed production view

[Production blueprint](../blueprints/siem.md).

Authenticated collectors would need disk spooling, schema provenance and clock-health checks before Redpanda ingestion. Fenced correlation ownership, a search index and a restricted original-evidence archive would separate rule state, analyst queries and retention; none runs in this lab. External alerts and response actions need their own deduplication and authorization, not an inference from a broker acknowledgment.

[NIST SP 800-92](https://nvlpubs.nist.gov/nistpubs/Legacy/SP/nistspecialpublication800-92.pdf), the September 2006 final guide, supports timestamp, provenance and disposal planning, not modern product settings or compliance claims. Its [2023 revision](https://csrc.nist.gov/pubs/sp/800/92/r1/ipd) is an initial public draft. Proposed event-time policies should state their late-data meaning explicitly; the [Beam watermark guide](https://beam.apache.org/documentation/programming-guide/#watermarks-and-late-data) is conceptual guidance, not an implemented Beam pipeline here.

## Scenario coverage

On a fresh empty disposable stack, `bash labs/siem/e2e.sh` exercises thresholds, entity separation, import forms, minute/watermark edges, reordering and time jumps, review races, fixture receipts, broker duplicates and exact restart replay including below-threshold candidates. See [commands](../reference/commands.md) for orchestration. Browser behavior and sustained capacity need separate proof.
