---
description: Send and schedule real local-model prompts, cancel pending work, and inspect the durable boundary between a due time and an inference attempt.
---

# Clockwork Correspondence

Clockwork Correspondence is a fictional notebook for immediate and one-shot scheduled prompts. Redpanda retains conversation, schedule, cancellation, attempt and reply transitions. One Node app owns the timer and calls internal llama.cpp for real SmolLM2-135M-Instruct Q8_0 replies. Redpanda is the log, not the timer. No tools, internet retrieval, cloud credential or canned reply is provided.

## Run and correspond

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash title="Start the local conversation notebook"
./labs/run agent-chat up
./labs/run agent-chat urls --json
```

Open the app and wait for the log and model to become ready.

1. Enter a synthetic **New conversation title**, such as `A small idea`, then select **New conversation**. The composer becomes available for that notebook.
2. Enter `Name one friendly animal in a short sentence.`, keep **Send now** and select **Send prompt**. Follow its job in **Prompt journal** until the real local-model reply completes.
3. Enter another prompt, choose **Schedule for later**, and set **Local date and time** a few minutes ahead. Check the displayed timezone, then select **Schedule prompt**.
4. Inspect its pending journal entry and **Log details**, including the exact UTC due instant. To let it run, leave it pending through that instant. To test cancellation instead, select **Cancel pending prompt** before its recorded start.

A recorded cancellation prevents an attempt only if it wins topic order before start. A late cancellation cannot stop inference. **Send now** means eligible for the one inference slot, not preemption of another job. Reply text varies; a completed small-model answer is not a quality or factuality guarantee.

Browser state/conversation/uncertain-operation reads refresh every second. Pause aborts a pending read and stops automatic polling, not scheduled execution. Refresh reads one complete cycle while paused; Resume restarts polling. Explicit selection/mutation requests a fresh view without resuming. The composer shows its IANA timezone, displayed times include a local zone abbreviation, and job details expose exact UTC `dueAt`. Theme follows system or valid manual/stored choice; denied storage leaves controls usable. Conversations live in the broker, not browser storage.

Only the loopback app is published; the model is internal. The lab has no user authentication, authorization or tenant isolation. All prompts, recorded input and replies are visible. Use synthetic content, never secrets. The small English-first model can hallucinate, misunderstand or produce inconsistent/bias-laden text; verify important answers.

## API and request IDs

Every mutation requires caller `requestId`, 8–80 ASCII letters, digits, underscores or hyphens. Creation ID becomes conversation ID; prompt ID becomes job ID. Same semantic command/ID returns its current resource without another effect. Conflicting reuse returns 409; the first ordered command owns a racing ID. Retained history supplies deduplication, not exactly-once external inference.

POST bodies must be JSON, no larger than 16,384 bytes, with `Content-Type: application/json` and matching browser Origin when present. No CORS bypass or authorization is supplied.

| Route | Input or result |
| --- | --- |
| `GET /health` | 200 `{ready:true,schedulerError:null}` after replay, interruption reconciliation and initial model health; 503 initializing/paused/shutting down; no continuous model probe |
| `GET /api/state` | Readiness, topic, model, runtime owner, revision, server time, conversation summaries, all jobs and scheduler `{ownerCount:1,busy,error,tickMs:250}`; ownerCount is configuration, not detected membership |
| `GET /api/conversations` | Summaries `{id,title,createdAt,messageCount}` |
| `POST /api/conversations` | `{requestId,title}`; nonblank title ≤80 characters; 201 conversation |
| `GET /api/conversations/ID` | Conversation/messages/jobs; 404 if absent |
| `POST /api/conversations/ID/prompts` | `{requestId,prompt,dueAt?}`; nonblank prompt ≤2,000 characters; omit `dueAt` for now; 202 observed job, not completed reply |
| `GET /api/jobs` / `GET /api/jobs/ID` | All jobs or one job with due/start/end times, mode, status, attempts/owner, recorded input, reply/usage/error, unknown flag and transitions/offsets |
| `POST /api/jobs/ID/cancel` | `{requestId}`; 200 if pending cancel wins, 409 if start/terminal state won; also applies to queued send-now jobs |
| `GET /api/operations/REQUEST_ID` | Signature, acceptance/reason and related conversation/job/attempt, partition/offset; 404 not observed |
| `GET /api/events?after=OFFSET` | Unique logical events after an exclusive nonnegative decimal offset; duplicates cause gaps; Console/rpk show physical records |

Errors are 400 input, 403 Origin, 404 resource, 409 ID/transition conflict, 413 size, 415 media type, 503 scheduler/unresolved publication and generic 500. Failed append or ten-second observation timeout returns 503 with `outcomeUnknown:true` and the request ID. Inspect operation/job before resubmission; never blindly replace the ID. Browser forms block and look up uncertainty without automatic mutation retry. While paused, use Refresh or Resume to continue lookup. A missing operation is not proof of failed publication; await replay readiness after restart.

```bash
app=$(./labs/run agent-chat urls --json | jq -er .app)
curl --fail-with-body -sS -H 'content-type: application/json' \
  --data '{"requestId":"notebook-demo-001","title":"A small idea"}' \
  "$app/api/conversations"
curl --fail-with-body -sS -H 'content-type: application/json' \
  --data '{"requestId":"prompt-demo-0001","prompt":"Explain gravity briefly."}' \
  "$app/api/conversations/notebook-demo-001/prompts"
curl -fsS "$app/api/jobs/prompt-demo-0001"
due=$(date -u --date='+60 seconds' '+%Y-%m-%dT%H:%M:%SZ')
jq -nc --arg due "$due" '{requestId:"schedule-demo-001",prompt:"Name a friendly animal.",dueAt:$due}' |
  curl --fail-with-body -sS -H 'content-type: application/json' \
    --data-binary @- "$app/api/conversations/notebook-demo-001/prompts"
curl --fail-with-body -sS -H 'content-type: application/json' \
  --data '{"requestId":"cancel-demo-0001"}' "$app/api/jobs/schedule-demo-001/cancel"
```

Cancellation can race with start; inspect its durable outcome rather than assume the example always wins.

## Time and context

`dueAt` is one ISO 8601 instant including seconds and `Z` or `±HH:MM`; stored UTC includes milliseconds. New schedules must be strictly in the future and at most seven days from server time. Already-observed idempotent commands remain repeatable after their due time. There are no recurring schedules.

The browser converts `datetime-local` to UTC on submission. Invalid/past times and daylight-saving gaps fail. Ambiguous fall-back time uses the earlier occurrence; an explicit API offset selects the desired occurrence. Subsequent timezone changes do not reinterpret persisted UTC.

The scheduler checks app wall clock every 250 ms, with one inference slot across conversations. Eligible pending jobs sort by due instant then job ID. The consumed start must also be at or after due time. It does not intentionally start early, but CPU/model occupancy, lag, downtime and clock changes can delay execution. Synchronize clocks; neither exact deadlines nor clock fencing are implemented.

`job.started` durably records the exact model input: a brief no-tools system instruction, up to six recent successful whole user/assistant exchanges, then the prompt. History plus new prompt uses at most 6,000 characters, excluding the fixed system instruction. This is not a tokenizer-enforced budget. Older/failed/interrupted turns remain visible but do not enter context. Nonstreaming inference sends `max_tokens:160`, `temperature:0.2`, with a 120,000 ms client deadline. Empty/invalid replies or replies over 16,000 characters fail; no substitute answer is generated.

## Topic flow and recovery

`agent-chat-events` is one partition, RF1. Records have `{version:1,id,type,at,...payload}`. A pure reducer orders offsets and deduplicates stable IDs; replay calls no clock or model.

- `conversation.created` creates an empty transcript.
- `job.submitted` stores prompt, mode and due time as pending.
- `job.cancelled` succeeds only while pending.
- `job.started` records attempt ID, owner and input, changes pending to running, and adds the user message only when due and accepted.
- `job.completed` records reply/usage and adds the assistant message in the same record/reducer transition.
- `job.failed` records error/unknown status. Terminal events must match the recorded attempt.

Cancelled future prompts never become executed transcript turns. Late cancellation/start rejections remain logical events with `accepted:false`; a late cancellation does not stop inference. A rejected start never calls the model. Completion is not a cross-system database transaction.

Startup replays in a fresh group from zero through the pre-start high watermark. It then durably fails unfinished running attempts with `outcomeUnknown:true`; a generated reply might have been lost before logging. After initial model health, safe pending/overdue jobs resume. Terminal and cancelled work never reruns.

```bash
./labs/run agent-chat restart app
./labs/run agent-chat logs app
./labs/run agent-chat rpk topic consume agent-chat-events --num 10
```

A definite non-2xx model response records failure without unknown transport status. Timeout, interrupted connection or malformed success records unknown failure. Failed/uncertain terminal publication pauses the scheduler and exposes an error; it never recalls the model. Restart preserves any landed completion, fails uncompleted running attempts as unknown, or leaves pending work when start never landed. Review the failure before deliberately submitting a new prompt.

Log records may be delivered more than once. A crash before HTTP can lose an unattempted started job; a crash after generation can lose its reply. Both become visible unknown failures rather than automatic duplicate inference. Run one app/scheduler only; its UUID is diagnostic, not a lease, fence or lock. Consumer membership and log-ordered rejection do not provide production ownership.

The [full-prefix policy](../reference/tuning.md#topic-policy) retains conversations and jobs across the seven-day scheduling horizon until disposal. There are no snapshots or bounded conversation/job/event maps; volume loss or full disk can prevent recovery. The app has a five-second forced-exit deadline, so shutdown can still require replay reconciliation. `./labs/run agent-chat down` deletes conversations, schedules and broker history.

## Configuration and workload tuning

| Supported setting | Default or owner |
| --- | --- |
| `KAFKA_BROKERS` | Comma-separated addresses; default/Compose `redpanda:9092` |
| `CHAT_TOPIC` | `agent-chat-events`; changing app environment alone does not change runner topic creation |
| `MODEL_URL` | `http://model:8080/v1`; completion path appended; initial health uses sibling `/health` |
| `LAB_APP_IMAGE`, `LAB_MODEL_IMAGE`, `APP_PORT` | Runner-owned images and loopback port; app listens on 3000 |

Alias `lab-small`, ticks/deadlines/history/output limits are fixed in code, not environment knobs. The shared image pins [bartowski's SmolLM2 Q8_0 GGUF/card](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/blob/09816acd5d99df7be770d85ea30822623dab342c/README.md), revision `09816acd5d99df7be770d85ea30822623dab342c`, Nix hash `sha256-WhOVcW95E3QcxR2YWBubEijYCYep99NmQQZ0LrBruoM=`. Card provenance uses llama.cpp b3991 for quantization, not this runtime. Locked Nixpkgs supplies llama-cpp 0.6.0 and this command:

```text
llama-server -m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 -t 2 --alias lab-small --jinja
OMP_NUM_THREADS=2
```

Node/shared KafkaJS 2.2.4 and the fixed model need no runtime install or download. Images are nonroot, read-only and capability-dropped; the current chat Compose declares `/tmp` tmpfs without an explicit size, unlike messaging's bounded temporary directories.

Measure due-lateness as queue wait, tick delay, publication/projection and model time, not tick alone. Shrinking 250 ms cannot increase the one-slot service capacity by itself. Context/output changes alter answer semantics; the 6,000-character budget does not prove arbitrary Unicode fits 8,192 tokens after template overhead. Thread/slot experiments require pinned-image edits/rebuilds and actual measurements. [llama.cpp 0.6.0](https://github.com/ggml-org/llama.cpp/blob/v0.6.0/tools/server/README.md) defines the engine options; see [broker and Linux tuning](../reference/tuning.md) for client and host limits.

## Proposed production view

[Production blueprint](../blueprints/agent-chat.md).

Production requires authenticated conversation access, deletion/retention policy, persistent schedules/results, admission quotas and explicit clock policy. Fenced execution ownership and coordinated failover must reconcile indeterminate model effects before any recorded retry decision; adding app replicas is unsafe here. Regional restore must preserve IDs, due times, cancel/start/completion order and pinned artifacts, fence the old scheduler and account for any replication-lost completion or cancellation rather than infer permission to repeat a call.

## Sources and scenario coverage

The [HuggingFaceTB 135M card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) documents English-first limits, possible factual/logical errors and bias. Its function-calling claim is for 1.7B, not this model; this app grants no tools. SmolLM2/GGUF card and Apache-2.0 license are retained in the model image; llama.cpp is MIT. Quantization adds no accuracy or safety guarantee.

`bash labs/agent-chat/e2e.sh` needs a running lab and exercises request deduplication, actual output/usage, no early scheduled start, pending cancellation, restart before due, one scheduled attempt and exact completed-message replay. [Test orchestration](../reference/commands.md) owns setup/disposal. One execution is not proof of exactly-once inference under all failures.
