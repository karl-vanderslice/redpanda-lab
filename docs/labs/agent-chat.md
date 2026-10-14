# Agent chat: now, or later

Redpanda owns conversation messages **and schedules**; the browser is a view. SmolLM2-135M-Instruct Q8_0, served by llama.cpp, supplies real `/v1/chat/completions` answers. No canned replies, tools, internet or cloud credentials.

## Start and explore

Use the [common environment and lifecycle commands](../reference/commands.md):

```bash
just up agent-chat
./labs/run agent-chat urls
```

Create a conversation, then **Send now** or **Schedule for later**. Jobs move pending → running → completed/failed. Scheduled work waits until due. **Cancel pending prompt** prevents an attempt only if cancellation precedes start in topic order. App-only restart reconstructs conversations/schedules; overdue pending work resumes after replay. Cards expose timestamps/offsets; **Inspect the event log** shows logical projected events.

Each project has its own network, ports, broker volume, app/model. No host Node/npm or model daemon is needed. Only loopback app is published; model is internal. This is unauthenticated, not multi-user. The English-first tiny model may hallucinate, misunderstand, ramble or reach 160 tokens; verify consequential answers. Theme follows OS/stored choice; conversations do not need browser storage. Labelled inputs, announced errors and textual statuses work in the narrow single-column layout. The original interface uses no copied assets/external fonts.

## Run the scenarios

`bash labs/agent-chat/e2e.sh` requires a running lab; it neither starts nor destroys it. Root `just test agent-chat` owns fresh setup/disposal; see [commands](../reference/commands.md). The scenario discovers the URL, checks request deduplication, real output/nonzero generated-token usage, no early scheduled start, pending cancellation, app restart before due, one scheduled attempt/no cancelled attempt, and exact message replay after another restart. Bounded waits fail nonzero. One observed execution is **not proof of exactly-once inference under all failures**.

```bash
./labs/run agent-chat logs app
./labs/run agent-chat rpk topic consume agent-chat-events --num 10
```

## API

Mutations require POST JSON, `Content-Type: application/json`, and same-origin browser requests. Body limit: 16 KiB. No CORS bypass or authorization is provided.

Every mutation requires caller `requestId`: 8–80 ASCII letters/digits/underscores/hyphens (UUID works). Create ID becomes conversation ID; submit ID becomes job ID. Same semantic command/ID returns its current resource without another effect; conflicting reuse returns 409. First ordered command owns a racing ID. Deduplication lasts only while records are retained.

| Route | Input / result |
| --- | --- |
| `GET /health` | 200 `{ready:true,schedulerError:null}` after replay, interruption reconciliation and initial model health; 503 initializing/paused/shutting down. No continuous model probe. |
| `GET /api/state` | `ready`, `topic`, `model`, runtime `owner`, `revision`, `serverTime`, conversation summaries, all jobs, scheduler `{ownerCount:1,busy,error,tickMs:250}`. Count is configured ownership, not detected membership. |
| `GET /api/conversations` | `{conversations:[{id,title,createdAt,messageCount}]}` |
| `POST /api/conversations` | `{requestId,title}`; nonempty title ≤80 characters; 201 conversation/messages/jobs |
| `GET /api/conversations/:id` | `{id,title,createdAt,messages,jobs}`; otherwise 404 |
| `POST /api/conversations/:id/prompts` | `{requestId,prompt,dueAt?}`; nonempty prompt ≤2,000 characters; omit `dueAt` for now. 202 observed pending/running job, not completed reply. |
| `GET /api/jobs` | `{jobs:[...]}` across conversations |
| `GET /api/jobs/:id` | Prompt, mode `now`/`scheduled`, due/submitted/started/finished times, status, attempt count/IDs, owner, durable started input, reply/usage or error, `outcomeUnknown`, transitions/offsets |
| `POST /api/jobs/:id/cancel` | `{requestId}`; 200 cancelled if pending cancel wins; 409 if start/terminal state won. Includes queued send-now work. |
| `GET /api/operations/:requestId` | `{id,signature,accepted,reason?,conversationId?,jobId?,attemptId?,partition,offset}`; 404 not observed in retained projection. Await health after restart before reconciling. |
| `GET /api/events?after=OFFSET` | `{topic,events:[...]}`; exclusive nonnegative decimal cursor. Unique logical version/ID/type/time/payload/partition/offset, including rejected cancel/start. Deduplication creates offset gaps; Console/`rpk` shows physical records. |

Errors: 400 invalid input, 404 missing resource, 409 ID/transition conflict, 415 media type, 413 body size, 503 unavailable scheduler/uncertain publication, generic 500 unexpected failure. A failed write or ten-second observation timeout returns 503 with `outcomeUnknown:true` and `requestId`. Inspect operation/job before resubmitting; never invent a replacement ID blindly. Browser forms pause and poll the uncertain ID, with no automatic mutation retry. The local notice is not a durable event.

```bash
APP=$(./labs/run agent-chat urls --json | jq -r .app)
curl -fsS -H 'content-type: application/json' "$APP/api/conversations" \
  --data '{"requestId":"notebook-demo-001","title":"A small idea"}'
curl -fsS -H 'content-type: application/json' "$APP/api/conversations/notebook-demo-001/prompts" \
  --data '{"requestId":"prompt-demo-0001","prompt":"Explain gravity briefly."}'
curl -fsS "$APP/api/jobs/prompt-demo-0001"
DUE=$(date -u --date='+60 seconds' '+%Y-%m-%dT%H:%M:%SZ')
jq -nc --arg due "$DUE" \
  '{requestId:"schedule-demo-001",prompt:"Name a friendly animal.",dueAt:$due}' |
  curl -fsS -H 'content-type: application/json' \
    "$APP/api/conversations/notebook-demo-001/prompts" --data-binary @-
curl -fsS -H 'content-type: application/json' "$APP/api/jobs/schedule-demo-001/cancel" \
  --data '{"requestId":"cancel-demo-0001"}'
```

## Time, context, and options

`dueAt` is a one-shot ISO 8601 instant with **seconds and `Z` or `±HH:MM`**. New schedules require a future instant within seven days of server time; stored UTC includes milliseconds. Already-observed idempotent commands remain repeatable after their due instant.

The browser converts `datetime-local` to UTC and displays its timezone. DST-gap times fail; ambiguous fall-back uses the earlier occurrence. Explicit API offsets select a particular occurrence. Later timezone changes do not reinterpret persisted UTC.

Scheduler interval: 250 ms, app wall clock. It never intentionally starts early; CPU/model occupancy, broker lag, downtime and clock changes can delay it. Synchronize clocks. No precise deadline, recurring schedule, retry policy or clock fencing. One inference slot spans conversations; eligible jobs sort by due instant then job ID. Send-now means eligible, not preemptive. Recorded start carries due-check time; cancel remains possible until start wins.

`job.started` records input: brief system instruction, up to six recent successful whole exchanges and new prompt, ≤6,000 characters (not tokenizer-enforced). Older/failed/interrupted turns stay visible but are not context. Inference is nonstreaming, `max_tokens:160`, `temperature:0.2`, 120-second client deadline. Model/context errors fail visibly, never synthesize answers.

| Environment | Value |
| --- | --- |
| `KAFKA_BROKERS` | Shared KafkaJS connection; Compose `redpanda:9092` |
| `CHAT_TOPIC` | Default `agent-chat-events` |
| `MODEL_URL` | Default `http://model:8080/v1`; append `/chat/completions`; initial readiness uses sibling `/health` |
| `APP_PORT` | Runner loopback publication; image always listens `0.0.0.0:3000` |

Alias is fixed `lab-small`. Runner supplies `${LAB_APP_IMAGE}`/`${LAB_MODEL_IMAGE}`; `default.nix` returns `common.mkNodeImage` `{app,image}`. Node built-ins/shared KafkaJS 2.2.4 require no mutable install/build. Root lock pins Nixpkgs/Node/llama.cpp; shared model declaration pins revision/bytes/hash. Model flags:

```text
-m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 --alias lab-small --jinja
```

## Topic flow and restart semantics

`agent-chat-events`: one partition, RF1; envelope `{version:1,id,type,at,...payload}`. Pure reducer applies offsets and deduplicates stable IDs. Replay callbacks have no timer/model effects.

```text
conversation.created
job.submitted → pending ─── job.cancelled → cancelled
                  │
              job.started (due, durable attempt + input)
                  │
                running ─── job.completed (text + usage) → completed
                  └──────── job.failed (error + outcomeUnknown) → failed
```

Submission durably stores the prompt; start adds its user-message transcript entry, so cancelled future work is not an executed turn. Completion atomically adds assistant message/status in one record/reducer, not an external DB transaction. Failed turns keep journal errors. Topic-earlier cancel/start wins; late cancel is retained with `accepted:false` and does not stop inference. Rejected start never calls the model. Terminal events must match durable attempt ID.

The app also schedules; async remote inference does not block HTTP/consumption. Startup replays from zero in an ephemeral group through pre-start high watermark, reconstructs state, then durably fails still-running prior attempts with `outcomeUnknown:true`. It never reruns them. A generated reply may have been lost before logging. After initial model health, pending/overdue jobs resume; terminal/cancelled jobs do not.

Timeout, interrupted model connection or malformed success yields unknown-outcome failure. Definite non-2xx yields failure without unknown transport status. Failed/uncertain terminal publication pauses scheduling and exposes error in state; it never recalls the model. Restart preserves landed completion, fails uncompleted running attempts as unknown, or leaves safe pending work if start never landed. A new prompt requires deliberate review of the failure.

## Guarantees and production boundary

**One scheduler owner per project. Do not scale app or share its topic between owners.** UUID is diagnostic, not lease/fence/lock. Log-ordered start rejection and consumer membership are not production ownership. Production needs execution-boundary fencing, partition/tenant assignment and coordinated failover with indeterminate-effect policy.

Delivery is at least once; retained IDs make reducer transitions idempotent. API waits for consumption, not just append. Kafka/model HTTP share no transaction: crash before HTTP can lose an unattempted started job; crash after generation can lose a reply. Both become visible unknown failure rather than possible duplicate inference.

RF1/24-hour retention is disposable. Volume/broker loss or expired creation records can destroy reconstruction. **Seven-day scheduling ceiling is not seven-day retention**; keep experiments inside retained history. Production needs complete snapshots/retention/compaction, replicated brokers/backups, bounded projections, auth/quotas and operational ownership. Prompts and input are intentionally exposed: no secrets.

Regional recovery must restore conversation/message identities, due times, cancel/start/completion transitions and offsets consistently; fence the old scheduler, preserve model artifact, reconcile missing replies. Async replication can lose acknowledged cancellation/completion; that is a recovery decision, not authorization to repeat inference. See [production and disaster recovery](../explanation/production.md).

## Primary references and model rights

- [llama.cpp server API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md): runtime comes from pinned Nixpkgs, not current upstream docs.
- [SmolLM2 model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct): English-first limits, Apache-2.0. Preserve GGUF attribution/license; quantization adds no accuracy/safety guarantee.
- [Redpanda idempotent producers](https://docs.redpanda.com/current/develop/produce-data/idempotent-producers/): session-scoped broker idempotence is not exactly-once model effects.
