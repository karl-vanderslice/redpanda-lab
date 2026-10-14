# Commonfield Dispatch

Commonfield Dispatch is a fictional publisher and public reading room. One Node owner records original local articles, profiles, follows, likes, feed preferences and article opens in `activity.events.v1`. Its consumer alone changes the in-memory projection. No external news service, asset download, sign-in or private messaging runs.

## Run and read

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash
./labs/run activity up
./labs/run activity urls --json
```

Create or select a public profile, follow an author, choose all posts or followed authors, publish a dispatch and open an article. The read ledger shows consumed opens, distinct public profile IDs and current likes, not verified people or attention. Anyone with lab access can act as any profile and inspect all data. Use synthetic text only.

First startup consumes `fixture-commonfield-v1`, installing two original profiles (`cf-mara`, `cf-ellis`) and articles (`cf-bench`, `cf-route`) without interactions. Fixture labels remain visible; no popularity counts are seeded. The browser polls every two seconds while visible. Pause stops automatic reads, not commands; explicit commands still consume and refresh receipts. Refresh works while paused. Optional storage preserves viewer/pending-command choices; denied storage falls back to memory.

## Commands and state

Records contain `{schema:1,command,at,outcome}`. `at` is server-assigned Unix milliseconds; callers cannot supply it. The Kafka key is the command ID. Each complete outcome contains acceptance, changed/no-op status, reason and immutable result data. Only the consumer updates state, and the owner serializes commands through consumption.

Command/resource IDs use 1–80 ASCII letters, digits, underscores or hyphens. Equal ID and payload return the original receipt without another append. Different payload under an existing ID returns 409 before publication. Text must be nonblank and within the limits below. Tabs, newlines and carriage returns are allowed; other U+0000–U+001F controls are rejected. Unknown fields are rejected.

| `type` | Required fields in addition to `id` and `type` |
| --- | --- |
| `profile` | `profileId`, `name` (1–80 characters), `bio` (1–320); creates an immutable public profile |
| `publish` | `viewerId`, `postId`, `title` (1–160), `summary` (1–400), `body` (1–8,000), `visibility:"public"`; creates an immutable article |
| `follow` | `viewerId`, `targetId`, boolean `following` desired state |
| `like` | `viewerId`, `postId`, boolean `liked` desired state |
| `feed` | `viewerId`, `mode:"all"` or `"following"` |
| `read` | `viewerId`, `postId`, `surface:"article"`; records one local open |

Follow and like are desired-state sets, not toggles. A new command ID requesting the current state succeeds with `changed:false`. Unknown resources, existing profile/post IDs and self-follow are durable domain rejections. Public callers cannot submit the internal `fixture` command.

A read ID identifies one open. Retrying it adds no read; opening again with a new ID adds one. Distinct readers count public profile IDs. Article GET alone records nothing, and API callers can submit reads without human attention. Feed order is descending consumed publication offset, not timestamps or likes. Fixture posts share an offset and use a deterministic ordinal. Following-only feeds do not automatically include the viewer's own posts. All articles remain public regardless of the filter.

## HTTP API

Mutations require POST JSON, `Content-Type: application/json`, a body no larger than 16,384 bytes and a matching Origin when provided. Origin validation is not authentication or authorization.

| Route | Result |
| --- | --- |
| `GET /health` | 200 when ready; 503 when writes stop or shutdown begins |
| `GET /api/state` | Readiness, topic, unknown command, limitations, public profiles/posts, per-reader opens, receipts, offsets and broker duplicates |
| `GET /api/feed?viewerId=ID` | Viewer and ordered feed; 404 for unknown viewer |
| `GET /api/articles/ID` | Article, author, `readRecorded:false`; 404 for unknown article |
| `POST /api/commands` | Consumed receipt: 200 accepted, 409 durable domain rejection |
| `GET /api/commands/ID` | Original receipt; 503 known unresolved append, 404 not observed |

Receipts contain `command`, `record`, first consumed `offset`, `accepted`, `changed`, `reason` and immutable `data`. Later likes or reads do not rewrite them. Conflicting IDs return an error with `commandId`, not a new receipt. Invalid input is rejected before publication: 400 fields/JSON, 403 Origin, 413 size, 415 media type. Unknown completion returns 503 and `outcomeUnknown:true`; unexpected failures return generic 500.

```bash
app=$(./labs/run activity urls --json | jq -er .app)
curl -fsS "$app/api/articles/cf-bench"
curl -fsS "$app/api/commands/fixture-commonfield-v1"
curl --fail-with-body -sS -H 'content-type: application/json' \
  --data '{"id":"reading-open-001","type":"read","viewerId":"cf-ellis","postId":"cf-bench","surface":"article"}' \
  "$app/api/commands"
curl -fsS "$app/api/commands/reading-open-001"
```

## Replay and unknown completion

A fresh consumer group rebuilds from offset zero through the startup high watermark. A missing retained prefix, extra partition, malformed record or outcome inconsistent with deterministic replay stops the app. Identical broker commands/outcomes preserve the first receipt and do not repeat effects; only duplicate accounting and last consumed offset advance. No external effects occur during replay.

On unknown append completion, writes stop. Preserve the exact ID and payload, inspect the receipt, restart to replay, inspect again, then retry exactly if needed. Absence alone does not prove an in-flight append failed; never substitute an ID automatically.

```bash
./labs/run activity restart app
./labs/run activity logs app
```

The browser offers receipt lookup and exact retry. When storage is denied, copy a pending payload before closing the page. Shutdown rejects new admission, drains admitted HTTP work and the serialized queue, then awaits in-flight KafkaJS sends before disconnect. Compose allows 75 seconds; a forced stop still requires reconciliation after replay.

Run one owner only; its queue is not a distributed lease. Under the [full-prefix policy](../reference/tuning.md#topic-policy), projections, read history and receipts grow until disposal. `./labs/run activity down` deletes the broker volume, not caches or browser state. Pending IDs cannot recover disposed articles or interactions.

## Workload tuning and privacy

| Supported setting | Default or owner |
| --- | --- |
| `KAFKA_BROKERS` | Comma-separated addresses; default/Compose `redpanda:9092` |
| `LAB_APP_IMAGE`, `APP_PORT` | Runner-owned image and loopback publication; container listens on 3000 |
| Topic, body limit, waits | Fixed in source: `activity.events.v1`, 16,384 bytes, 30-second append and consumer-completion deadlines |

There are no session-window, feed-limit, analytics-expiry or deletion environment knobs. Counts are lifetime retained opens and reader IDs, not time-window analytics. See [shared producer and codec settings](../reference/tuning.md#client-knobs-belong-to-their-client) and [container limits](../reference/tuning.md#container-declarations-need-host-evidence). The image uses UID/GID 10001, a read-only root, 16 MiB tmpfs, dropped capabilities and no-new-privileges.

Measure full-projection payload, feed-read cost, interaction cardinality and consumed lag separately. Bounded feed query stores and independent analytics are proposed, not current controls. Never sample authoritative publish/follow/like commands to reduce load. Adding partitions requires a cross-partition contract for reader/author interactions, not a configuration-only change.

All profile IDs, article text, follow/like sets and per-reader opens are exposed. There is no moderation, authentication, private visibility, deletion or consent enforcement. Production privacy expiry conflicts with this lab's full-prefix replay and lifetime deduplication: deleting old commands without a governed snapshot/redaction and ID-recovery policy destroys reconstruction, while retaining everything preserves identifiable click history. [UK ICO data-minimisation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/) supports purpose-limited retention review, not a claim of compliance; the guidance is under review and UK-specific.

## Proposed production view

[Production blueprint](../blueprints/activity.md).

An authenticated authorization boundary, moderation and abuse controls would precede command admission. Independent feed and analytics consumers would need durable bounded query stores, explicit raw-click access rules and consent/deletion policy; this lab runs none of them. Fenced ownership, schemas, backups and restore exercises must preserve interaction and deduplication meaning rather than merely add replicas.

## Scenario coverage

`bash labs/activity/e2e.sh` uses public HTTP, the scoped broker CLI and an app restart to exercise profile/feed ordering, desired-state likes, read retries versus new opens, input/domain/ID conflicts, public identity, broker duplicates and exact replay. It appends synthetic records to a running lab; [test orchestration](../reference/commands.md) owns fresh startup and disposal. Browser accessibility, denied-storage behavior and capacity require separate proof.
