# Agent chat: now, or later

A real local-model conversation notebook with Redpanda as the authority for **both messages and scheduling**. The browser is a view, not a database. The model is SmolLM2-135M-Instruct Q8_0 served by llama.cpp; answers come from its actual `/v1/chat/completions` response, never a canned reply. The agent has no tools, internet access, or cloud credentials.

## Start and explore

From the repository root, use the pinned Nix development environment and runner:

```bash
nix develop
just up agent-chat
./labs/run agent-chat urls
```

Open the printed app URL. Console is the other printed URL; inspect the `agent-chat-events` topic there. Each runner project has its own Redpanda volume, network, ports, app, and model instance. No host Node/npm installation or model daemon is needed.

1. Enter a title such as **A small idea** and choose **New conversation**.
2. Ask **Explain why the sky is blue in one sentence.** Choose **Send now**. The journal moves from pending to running to completed, and the actual model reply appears in the transcript.
3. Select **Schedule for later**. Pick a local date and time about a minute ahead. The waiting-room card displays the due time and pending status. It does not invoke the model early.
4. Schedule another prompt, then choose **Cancel pending prompt**. Cancellation is durable; that prompt never creates a model attempt if cancellation wins the topic order.
5. Before the first schedule is due, run `./labs/run agent-chat restart app`. Refresh or wait for the browser to reconnect. The conversation and pending schedule are reconstructed from Redpanda; the prompt runs when due (or after replay if overdue).
6. Open **Log details** on a card to see status timestamps and offsets, or **Inspect the event log** for the API's logical event projection.

A small English-language model is intentionally used for a lightweight CPU lab. It may ramble, hallucinate, misunderstand a prompt, or reach the 160-token limit. The lab demonstrates the scheduling and message system, not strong agent reasoning. Verify important answers.

Theme initially follows the operating system; the theme button remembers the choice if browser storage is available. Conversations do not depend on browser storage. The layout becomes a single column on small screens. Inputs are labelled, errors are announced, and status is expressed in text rather than only color. The original warm-paper/cobalt treatment draws on the inspected Getburnt and ElevenLabs taste-book references (editorial hierarchy, generous whitespace, fine rules); it copies no source assets or external fonts.

## Run the scenarios

With the lab already running:

```bash
just test agent-chat
# Equivalent scenario script, within the pinned development shell:
bash labs/agent-chat/e2e.sh
```

The script discovers the public app URL through `./labs/run agent-chat urls --json`. It creates a conversation, proves request-ID deduplication, waits for real local-model output with nonzero generated-token usage, checks a future prompt is not early, cancels pending work, restarts only the app before a due instant, checks one successful scheduled attempt and no cancelled attempt, then restarts again and compares exact persisted message history. It uses bounded waits and exits nonzero on failure. It neither starts nor destroys the project. A passing scenario observes one execution in this single-owner run; it is **not a proof of exactly-once external inference under every failure**.

```bash
./labs/run agent-chat logs app
./labs/run agent-chat rpk topic consume agent-chat-events --num 10
just down agent-chat
```

The model is internal-only; only the loopback app port is published by this lab. Keep the runner's loopback binding. This is an unauthenticated local development application, not a multi-user service.

## API

All payloads and responses are JSON. Mutations use `POST`, `Content-Type: application/json`, and same-origin browser requests. The common HTTP utility rejects cross-origin browser mutations. JSON bodies are capped at 16 KiB. No CORS bypass, authorization, or public deployment is provided.

Every mutation requires a caller-generated **`requestId`**, 8–80 ASCII letters, digits, underscores, or hyphens (a UUID works). Create IDs become conversation IDs; submit IDs become job IDs. Repeating the same semantic command with the same ID returns its current resource without another domain effect. A conflicting reuse returns `409`. The first ordered command owns the ID even if multiple conflicting submissions race. IDs are deduplicated only while their records remain in the retained log.

| Method and path | Input / result |
| --- | --- |
| `GET /health` | `200 {ready:true,schedulerError:null}` after replay, interrupted-attempt reconciliation, and initial model health; `503` while initializing/paused/shutting down. It does not continuously probe model health. |
| `GET /api/state` | `ready`, `topic`, `model`, runtime `owner`, `revision`, `serverTime`, conversation summaries, every job, and `{ownerCount:1,busy,error,tickMs:250}` scheduler state. `ownerCount` describes the configured single-owner lab, not detected cluster membership. |
| `GET /api/conversations` | `{conversations:[{id,title,createdAt,messageCount}]}`. |
| `POST /api/conversations` | `{requestId,title}`; title is nonempty, at most 80 characters. `201` returns the conversation, messages, and jobs. |
| `GET /api/conversations/:id` | `{id,title,createdAt,messages,jobs}` or `404`. |
| `POST /api/conversations/:id/prompts` | `{requestId,prompt,dueAt?}`. Prompt is nonempty, at most 2,000 characters. Omit `dueAt` to send now. `202` returns the observed pending/running job, not a promised completed reply. |
| `GET /api/jobs` | `{jobs:[...]}`, all conversations. |
| `GET /api/jobs/:id` | Job with prompt, mode (`now`/`scheduled`), due/submitted/started/finished timestamps, status, attempt count, attempt/owner IDs, durable input snapshot when started, reply/usage or error, `outcomeUnknown`, and status transitions with log offsets. |
| `POST /api/jobs/:id/cancel` | `{requestId}`. `200` returns a cancelled job if cancellation wins while pending; `409` if start or a terminal state already won. Cancellation applies to any pending job, including a queued send-now prompt. |
| `GET /api/operations/:requestId` | Observed command result `{id,signature,accepted,reason?,conversationId?,jobId?,attemptId?,partition,offset}`. `404` means not observed **in the retained projection**, not proof a timed-out publication never happened. Wait for `/health` before reconciling after restart. |
| `GET /api/events?after=OFFSET` | `{topic,events:[...]}`; optional exclusive, nonnegative decimal offset cursor. Every unique logical event includes version, ID, type, timestamp, domain payload, partition, and offset. Also includes rejected cancel/start events. Duplicate operation IDs are omitted by projection, so offsets can have gaps. Use Console or `rpk` for physical broker records. |

Invalid input returns `400`; missing resources `404`; conflicting IDs/ordered transitions `409`; wrong media type `415`; oversized JSON `413`; unavailable scheduler or uncertain publication `503`. Unexpected errors return a generic `500`. If a write fails or its projection is not observed within ten seconds, the `503` response includes `outcomeUnknown:true` and `requestId`. **Inspect the operation and job before deciding whether to resubmit.** Do not manufacture a new ID and blindly repeat it. The browser pauses mutation forms and polls the uncertain request ID; it never automatically retries a mutation. The browser's local uncertainty notice is not a durable broker event.

Example, using the URL printed by the runner:

```bash
APP=$(./labs/run agent-chat urls --json | jq -r .app)
curl -fsS -H 'content-type: application/json' "$APP/api/conversations" \
  --data '{"requestId":"notebook-demo-001","title":"A small idea"}'
curl -fsS -H 'content-type: application/json' "$APP/api/conversations/notebook-demo-001/prompts" \
  --data '{"requestId":"prompt-demo-0001","prompt":"Explain gravity briefly."}'
curl -fsS "$APP/api/jobs/prompt-demo-0001"
# Use an actual future timestamp (with seconds and an explicit timezone):
DUE=$(date -u --date='+60 seconds' '+%Y-%m-%dT%H:%M:%SZ')
jq -nc --arg due "$DUE" \
  '{requestId:"schedule-demo-001",prompt:"Name a friendly animal.",dueAt:$due}' |
  curl -fsS -H 'content-type: application/json' \
    "$APP/api/conversations/notebook-demo-001/prompts" --data-binary @-
curl -fsS -H 'content-type: application/json' "$APP/api/jobs/schedule-demo-001/cancel" \
  --data '{"requestId":"cancel-demo-0001"}'
```

## Time, context, and options

- `dueAt` is a one-shot ISO 8601 instant **with seconds and `Z` or an explicit `±HH:MM` timezone**. It is stored normalized to UTC, including milliseconds. Creation requires a future instant within seven days of the server clock. An idempotent repeat of an already observed command is not rejected merely because its due instant has passed.
- The browser uses an actual `datetime-local` form and converts the selected local time to UTC on submission. Its timezone is displayed. Nonexistent DST-gap local times are rejected; an ambiguous fall-back time uses the browser's earlier occurrence. Use an explicit-offset API timestamp to select a particular occurrence. The persisted UTC instant is not reinterpreted if your timezone later changes.
- The scheduler checks every 250 ms and uses the app's wall clock. It never intentionally starts before `dueAt`. CPU load, model occupancy, broker/consumer lag, downtime, and clock changes can delay work. Keep clocks synchronized. No precise real-time deadline, recurring schedule, retry policy, or clock-fencing guarantee is claimed.
- One inference slot runs at a time across conversations. Eligible pending jobs are ordered by due instant, then job ID for ties. Send-now means eligible now, not preempt the active request. A start event records the due-check timestamp; cancellation remains possible until that start wins in the log.
- Model input is recorded in `job.started`: a brief system instruction, up to six recent successful whole exchanges, and the new prompt. History plus new prompt is limited to 6,000 characters (not a tokenizer-enforced guarantee); older or failed/interrupted turns are not model context but remain visible in the transcript. Replies use `max_tokens:160`, `temperature:0.2`, nonstreaming inference, and a 120-second client deadline. Model/context errors are visible failed jobs, not synthetic answers.
- Runtime environment: `KAFKA_BROKERS` (shared KafkaJS connection; Compose `redpanda:9092`), `CHAT_TOPIC` (default `agent-chat-events`), `MODEL_URL` (default `http://model:8080/v1`, append `/chat/completions`; initial readiness uses the sibling `/health`). The image always listens on `0.0.0.0:3000`; runner `APP_PORT` chooses the loopback published port. The model alias is fixed to `lab-small`.
- Compose uses `${LAB_APP_IMAGE}` and `${LAB_MODEL_IMAGE}` supplied by the pinned runner. `default.nix` returns the shared `common.mkNodeImage` `{app,image}` result; no lab package download/install step or mutable container build occurs. Application code uses Node built-ins and shared KafkaJS 2.2.4. Root `flake.lock` pins Nixpkgs, Node, and llama.cpp; the shared model Nix expression pins the model revision/bytes and content hash. Consult those root declarations for the exact immutable pins rather than a floating upstream `main` or `latest`. Model flags are `-m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 --alias lab-small --jinja`.

## Topic flow and restart semantics

`agent-chat-events` has **one partition, replication factor one** in the isolated single-broker lab. The event envelope is `{version:1,id,type,at,...payload}`. One pure reducer applies the retained topic in offset order, deduplicating stable operation IDs. The callback has no model or timer effects, so replay cannot itself repeat inference.

```text
conversation.created
        │
job.submitted ─── pending ───── job.cancelled ─── cancelled
                       │
                  job.started (after due, durable attempt + input snapshot)
                       │
                    running
                       ├──── job.completed (actual model text + usage) ─── completed
                       └──── job.failed (error + outcomeUnknown) ─────── failed
```

Prompts are durable in `job.submitted`, even before their user-message transcript entry exists. `job.started` adds that user message at execution time, preventing a cancelled future prompt from appearing as an executed turn; `job.completed` adds the assistant message and final status atomically **within the single domain record/reducer**, not in an external database transaction. Failed turns remain visible with their journal failure. Cancel and start are conditional commands: whichever is earlier in the topic wins. A late cancel is retained with an `accepted:false` operation result and does not stop running inference. A start rejected after cancellation never calls the model. Terminal events match the durable attempt ID.

The app also owns the scheduler; a second worker/container is unnecessary because model inference is remote, async, and does not block HTTP/log consumption. On each app start:

1. The shared connection replays from the beginning with a new ephemeral consumer group and waits for its pre-start high watermark.
2. The pure reducer reconstructs conversations, logical operations, jobs, and messages.
3. Any still-running prior attempt is durably marked `failed`, `outcomeUnknown:true`. A reply may have been generated before the crash but never logged. It is **not rerun**.
4. After initial local-model health, scheduling begins. Pending overdue work resumes; cancelled and terminal work does not.

A model timeout, interrupted connection, or malformed success response records an unknown-outcome failed job. A definite non-2xx model response records failure without claiming an unknown transport outcome. A failed/uncertain terminal-log publication pauses the local scheduler and surfaces its error in `/api/state`; it does not call the model again. Restart reconciles against the log: a completion that did land survives, an uncompleted running attempt becomes unknown-outcome failed, and a start that never landed leaves safe pending work. There is no automatic retry of model outcomes and no fake recovery response. You can deliberately submit a **new** prompt after reviewing the failed attempt.

## Guarantees and production boundary

This is **single scheduler owner per Compose project**. Do not scale `app` beyond one replica or run two independent owners against the same topic. The owner UUID is diagnostic, not a lease, fencing token, or distributed lock. Log-ordered start rejection helps the demonstration but is not a production ownership design. Production needs a durable lease with fencing enforced at the execution boundary, partition/tenant assignment, coordinated failover, and a policy for indeterminate external effects. Kafka consumer-group membership alone is not that policy.

Broker delivery/replay is at least once. Stable IDs make reducer transitions logically idempotent while retained; acknowledged append alone does not mean the consumer applied a command. The API awaits consumer observation. There is no transaction spanning the Kafka log and llama.cpp HTTP request, so **exactly-once external inference is not promised**. A crash between durable start and HTTP call can lose an unattempted job; a crash after generation and before durable completion can lose a reply. Both favor visible unknown failure over a possibly duplicate retry.

The broker is RF1 and lab retention defaults to **24 hours**. The log and replay projection are disposable, not production durable storage: deletion, volume removal, broker loss, retention of old conversation creation records, or scheduling beyond the retained window can lose reconstruction authority. The seven-day API ceiling is not a retention guarantee; keep walkthrough schedules and replay experiments comfortably within the retained window. Production needs explicitly chosen retention/compaction/snapshots with complete recoverable state, replicated brokers, backups, bounded/paginated projections, authn/authz, quotas, and operational ownership. All API state/events here are intentionally visible for a local lab, including prompts and model input; do not submit secrets.

For regional recovery, restore conversations, message identities, due times, cancellation/start/completion transitions and consumed offsets consistently. Fence the old scheduler before promoting a standby, retain its model artifact separately, and reconcile any running attempt whose reply is missing. Async replication can lose a cancellation or completion that was acknowledged in the old region. Treat that as a domain recovery decision, not permission to call the model again. See [production and disaster recovery](../explanation/production.md) for replication limits, RPO/RTO and measured restore drills.

## Primary references and model rights

- [llama.cpp server API](https://github.com/ggml-org/llama.cpp/blob/master/tools/server/README.md): OpenAI-compatible chat completions, model alias, server health, and context/parallel flags. Runtime version is the root pinned Nixpkgs package, not the current upstream documentation revision.
- [SmolLM2-135M-Instruct model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct): English-first model limitations and **Apache-2.0** license. The shared Q8_0 GGUF model image supplies the pinned quantized bytes; preserve upstream license/attribution when redistributing. Quantization does not add accuracy or safety guarantees.
- [Redpanda idempotent producers](https://docs.redpanda.com/current/develop/produce-data/idempotent-producers/): broker idempotence is scoped to producer sessions; application-level stable IDs address logical duplicate commands, not exactly-once effects in the model server.
