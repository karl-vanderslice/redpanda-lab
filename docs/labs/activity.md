---
description: Use seeded public profiles to read, like, and follow local articles, then distinguish recorded opens from verified human attention.
---

# Commonfield Dispatch

Commonfield Dispatch is a fictional public reading room where you can publish local articles, choose a profile, and see how reads, likes and follows change the feed. One Node owner records those actions, profiles and feed preferences in `activity.events.v1`; its consumer builds the in-memory view.

The room uses original local content and public fixture profiles. You can explore it without a news service, asset downloads or sign-in. Treat the profiles as shared identities rather than private accounts; private messaging is outside this workflow.

## Run and read

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash title="Start the public reading room"
./labs/run activity up
./labs/run activity urls --json
```

Open the app. You can use the two logged fixture profiles and articles without creating content first:

1. In **Acting as**, select **Ellis Reed · cf-ellis · fixture**. Until you choose a profile, the feed's reading and interaction controls remain unavailable.
2. On **A bench is a small agreement**, select **Read local article**. The article opens and one consumed read is recorded for that public profile.
3. Select **Close article**, or press ++escape++ from inside it. Focus returns to the Read button that opened it, or to the profile selector if that post has left the feed.
4. Select **Like** on the article's card. It becomes **Unlike** after the consumed decision.
5. Under **Authors to follow**, select **Follow** on the **Mara Vale · fixture** card, then choose **Followed authors only**. On the untouched fixture, the feed contains Mara's article rather than both fixture articles.

Compare the read ledger with the feed. Opening the same article again records another open, but it does not create another distinct reader ID. A public profile is not a verified person, and an open is not evidence of attention. Anyone with lab access can act as any profile and inspect all data. Use synthetic text only.

First startup consumes `fixture-commonfield-v1`, installing profiles `cf-mara` and `cf-ellis` and articles `cf-bench` and `cf-route` without interactions. Fixture labels remain visible; no popularity counts are seeded. After the first workflow, use the profile and publishing forms to add your own synthetic dispatch.

The browser polls every two seconds while visible. **Pause updates** stops automatic reads and discards one already in flight, not commands; explicit commands still consume and refresh receipts. **Refresh** works while paused. Optional storage preserves viewer/pending-command choices; denied storage falls back to memory.

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

Mutations require POST JSON, `Content-Type: application/json`, a body no larger than 65,536 bytes and a matching Origin when provided. The 64 KiB transport limit accommodates the maximum article text even when Unicode is escaped in JSON; field limits still apply. Origin validation is not authentication or authorization.

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
| Topic, body limit, waits | Fixed in source: `activity.events.v1`, 65,536 bytes, 30-second append and consumer-completion deadlines |

There are no session-window, feed-limit, analytics-expiry or deletion environment knobs. Counts are lifetime retained opens and reader IDs, not time-window analytics. See [shared producer and codec settings](../reference/tuning.md#client-knobs-belong-to-their-client) and [container limits](../reference/tuning.md#container-declarations-need-host-evidence). The image uses UID/GID 10001, a read-only root, 16 MiB tmpfs, dropped capabilities and no-new-privileges.

Measure full-projection payload, feed-read cost, interaction cardinality and consumed lag separately. Bounded feed query stores and independent analytics are proposed, not current controls. Never sample authoritative publish/follow/like commands to reduce load. Adding partitions requires a cross-partition contract for reader/author interactions, not a configuration-only change.

All profile IDs, article text, follow/like sets and per-reader opens are exposed. There is no moderation, authentication, private visibility, deletion or consent enforcement. Production privacy expiry conflicts with this lab's full-prefix replay and lifetime deduplication: deleting old commands without a governed snapshot/redaction and ID-recovery policy destroys reconstruction, while retaining everything preserves identifiable click history. [UK ICO data-minimisation guidance](https://ico.org.uk/for-organisations/uk-gdpr-guidance-and-resources/data-protection-principles/a-guide-to-the-data-protection-principles/data-minimisation/) supports purpose-limited retention review, not a claim of compliance; the guidance is under review and UK-specific.

## Proposed production view

[Production blueprint](../blueprints/activity.md).

The proposal starts with authenticated access, moderation and abuse controls before command admission. It then separates feed queries from analytics, giving each consumer a durable bounded read store and explicit rules for raw-click access, consent and deletion. These additions need a recovery design too: fenced ownership, schemas, backups and restore exercises must preserve what an interaction and a duplicate mean as the system grows.

## Scenario coverage

`bash labs/activity/e2e.sh` uses public HTTP, the scoped broker CLI and an app restart to exercise profile/feed ordering, desired-state likes, read retries versus new opens, input/domain/ID conflicts, public identity, broker duplicates and exact replay. It appends synthetic records to a running lab; [test orchestration](../reference/commands.md) owns fresh startup and disposal. Browser accessibility, denied-storage behavior and capacity require separate proof.
