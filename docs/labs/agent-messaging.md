---
description: Trace a real local fx task through proposal, critique, and synthesis, with durable handoffs and explicit interrupted-attempt outcomes.
---

# Relay Loom Cooperative

Relay Loom Cooperative is a fictional task desk with two separate agent workers. `planner` proposes, `reviewer` critiques, then `planner` synthesizes. Each owns a Node worker, private fx home, loopback relay and independent Vercel Labs fx invocation. `app` serves the transcript; an internal llama.cpp container supplies SmolLM2-135M-Instruct Q8_0. No host model, account, API key, credential directory or ambient service is mounted.

## Run and submit

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash title="Start the local agent task desk"
./labs/run agent-messaging up
./labs/run agent-messaging urls --json
```

Open the app and wait for log readiness. Under **New task**:

1. Enter `Plan a small community book swap in three steps.` in **Task for the agents**.
2. Select **Send to planner** once. The desk records a stable task ID and selects its transcript.
3. Follow **Proposal**, **Critique** and **Synthesis** in order. Planner owns the first and third stages; reviewer owns the second. Each stage must consume its predecessor's completion before its inference becomes eligible.
4. Inspect the completed lanes' output, task/step/agent IDs, harness/model metadata and elapsed seconds. These are real `fx` invocations against the local model, not seeded answers.

Only consumed `step.completed` output is a durable result. A running indicator or streamed progress is not completion. If a stage fails, inspect its error; successors stay blocked and the lab does not regenerate an uncertain model effect automatically.

After completion, restart only the transcript app with `./labs/run agent-messaging restart app`. The same recorded outputs return from replay without another inference. Restarting a worker during a running stage is a different [interruption experiment](#replay-and-interruption), not a way to improve an answer.

SSE updates durable snapshots. Pause freezes automatic display updates while receiving the latest snapshot; agents continue running. Refresh reads `/api/tasks` once while paused. Resume renders cached state. Explicit task submission, lookup and selection still show their requested view while paused. Theme follows the system until a stored/manual choice; denied storage leaves choices usable in memory.

## Handoff and ownership

`agent-messaging.events.v1` is one partition, RF1, keyed by task ID. All three Node roles replay independent projections. Planner/reviewer exchange no HTTP messages: a consumed predecessor completion enables the next stage. Each role waits for its own consumed start before invoking fx, and only the boot instance whose claim was accepted performs that call. Stable role IDs and random boot `instanceId` are different identities.

| Record | Stable `eventId` | Transition |
| --- | --- | --- |
| `task.submitted` | `TASK:submitted` | Immutable task, pending |
| `step.started` | `TASK:STAGE:started` | Running, owned by boot instance |
| `step.completed` | `TASK:STAGE:completed` | Successful `final_output`; enables successor |
| `step.failed` | `TASK:STAGE:failed` | Failure/interruption; stops workflow |

Envelope fields are `schema:1`, `taskId`, `eventId`, `type` and informational UTC `at`. Step events add `stage`, `stepId`, `agentId`, `instanceId`. Results include actual text and `inference` harness/version/model/provider/steps/usage/duration evidence. Offsets, not timestamps, order transitions. Reducers check stage/actor/predecessor and deduplicate seen event/task IDs; malformed/out-of-order records are rejected/counted rather than repaired. A failed stage blocks successors.

A same-ID, same-trimmed-text retry after the original is consumed returns the current original task without another append; changed text returns 409. Two identical submissions in flight together can each append, and consumption ignores the later copy by its stable event ID, so neither starts another inference. Concurrent claims are first-consumed-wins. Retained IDs make transitions idempotent, not model HTTP exactly once.

## HTTP and operations

| Route | Result |
| --- | --- |
| `GET /health` | `{ready,role,agentId,instanceId}`; 200 after replay/recovery, otherwise 503 |
| `GET /metrics` | Readiness, task/state gauges, duplicate/rejected records, process-local inference counters |
| `POST /api/tasks` | `{id,task}`; ID 8–80 ASCII letters/digits/underscore/hyphen, trimmed task 1–1,200 characters; 202 observed new task, 200 existing |
| `GET /api/tasks` | Full tasks, position, topic, readiness, role, agents and duplicate/rejected counts |
| `GET /api/tasks/ID` | Observed task; otherwise 404 |
| `GET /api/events` | SSE `snapshot`; coalesces pending snapshots under socket backpressure |

Only app serves task/browser routes. Private agents expose health/metrics on port 3000. JSON body limit is 16,384 bytes. Errors include 400 input, 403 Origin, 409 ID conflict, 413 size and 415 media type. Origin checks are not authentication. Do not expose the desk or use private tasks: prompts/results are plaintext in the topic.

```bash
app=$(./labs/run agent-messaging urls --json | jq -er .app)
curl --fail-with-body -sS -H 'content-type: application/json' \
  --data '{"id":"book-swap-task-001","task":"Plan a small community book swap in three steps."}' \
  "$app/api/tasks"
curl -fsS "$app/api/tasks/book-swap-task-001"
./labs/run agent-messaging exec planner node -e \
  "fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(console.log)"
./labs/run agent-messaging exec reviewer node -e \
  "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(console.log)"
./labs/run agent-messaging rpk topic describe agent-messaging.events.v1
```

A submission append error or 15-second observation timeout returns 503 `status:"unknown"` with the task ID. Keep its exact text and look up that ID; do not create another ID for an automatic retry. A missing task does not prove an in-flight append failed. **Check uncertain submission** looks up the original ID. Health is initial replay/recovery readiness, not a promise of future model or broker success.

## Replay and interruption

```bash
./labs/run agent-messaging restart planner
./labs/run agent-messaging restart reviewer
./labs/run agent-messaging restart app
```

Full-prefix replay has no model effects. Completed outputs reconstruct verbatim; unstarted pending stages become eligible only after their predecessor completes. A recorded running stage without a terminal result becomes failed on its owning role's restart. It is not regenerated: inference may have happened before its result publication failed. If completion landed first, it survives replay. Inspect offsets before deliberately submitting a new task.

Empty/invalid harness JSON, nonzero process or fx exit, unexpected tool calls, oversized answers and relay failures fail the step. Partial progress is never promoted to completion. Publication/observation failure stops the worker with an uncertain outcome; `unless-stopped` restarts it to inspect durable history, not automatically repeat inference. Broker-unavailable startup stays unready. Shared log close awaits outstanding KafkaJS sends before disconnect; its acknowledgment timeout does not cancel retries.

The [full-prefix policy](../reference/tuning.md#topic-policy) retains task/claim/result history until disposal. Tasks, results and seen IDs grow without bounds; no snapshots exist. Missing history prevents replay, and volume loss loses completed outputs. `./labs/run agent-messaging down` deletes the transcript and broker data.

## Pinned fx and local inference

`fx.nix` packages native Vercel Labs fx 0.0.13, not Nixpkgs' unrelated antonmedv/fx JSON viewer. It supports Linux x86_64/aarch64 and preserves `LICENSE` and `THIRD_PARTY_NOTICES.md`.

| Architecture | Release tarball SHA-256 |
| --- | --- |
| Linux x86_64 | `53a3b30ce1541048f8fa4b42b7bc68161466bb2e3708db104449a58af3807430` |
| Linux aarch64 | `78f6a8171193a1d2033f93d1b5a2940ea4a62147daf60a37ae670a9bf85f12e9` |

Each worker writes private `/tmp/fx-home/.fx/settings.json` with provider `local`, model `lab-small`, `permission_mode:"ask"`, wildcard permission `deny`, `first_call_tool_choice:"none"`, `max_agent_steps:1`, `context:false`, `session_titles:false` and `auto_upgrade:false`. The provider protocol is `openai-chat-completions`, base URL `http://127.0.0.1:18080/v1`, auth `none`, model metadata context 8,192, max output 256 tokens, no tool/vision support.

Generated prompts enter stdin in an empty `/tmp/fx-workspace`; argument-vector spawn avoids shell-interpolated tasks. The child inherits only `PATH`, private `HOME`, `TMPDIR=/tmp`, `LANG=C.UTF-8` and these fx controls:

```bash
FX_PROVIDER=local FX_MODEL=lab-small FX_PERMISSION_MODE=ask \
  FX_MAX_AGENT_STEPS=1 FX_AUTO_UPGRADE=0 FX_HERDR=0 \
  fx ask --json --no-save --no-color --system 'short role instructions' --
```

No full-access mode, login, cloud review, MCP or host credentials are used. The pinned adapter omits tool schemas for tool choice `none` and rejects unexpected calls. The relay also rejects tools. Fx requires HTTPS except loopback; the container-local relay accepts only POST `/v1/chat/completions` and forwards without credentials or redirects to the fixed internal model. Tasks cannot provide URLs.

| Bound | Actual value |
| --- | --- |
| Task observation | 15,000 ms |
| Relay JSON / model HTTP | 65,536 bytes / 90,000 ms |
| Fx process / captured stdout | 100,000 ms / 131,072 characters, ASCII result path |
| Generation | `max_tokens:256`, `temperature:0.2` |
| Grammar | 2–220 ASCII characters: initial letter, bounded text, terminal `.`, `!` or `?` |
| Successful `final_output` validation | Nonblank, at most 24,000 characters, exit success, no tool calls |

Grammar constrains form, not reasoning. Fx `OutputTruncated` is failure, not a usable partial answer.

The shared model image pins [bartowski's Q8_0 GGUF](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/blob/09816acd5d99df7be770d85ea30822623dab342c/SmolLM2-135M-Instruct-Q8_0.gguf), revision `09816acd5d99df7be770d85ea30822623dab342c`, Nix hash `sha256-WhOVcW95E3QcxR2YWBubEijYCYep99NmQQZ0LrBruoM=`. The [pinned card](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/blob/09816acd5d99df7be770d85ea30822623dab342c/README.md) records HuggingFaceTB provenance and llama.cpp b3991 quantization, not runtime engine version. Runtime is locked Nixpkgs llama-cpp 0.6.0, using:

```text
llama-server -m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 -t 2 --alias lab-small --jinja
OMP_NUM_THREADS=2
```

Runtime downloads nothing. Only app is host-published. Workers/model are nonroot/read-only with dropped capabilities and no host binds; worker `/tmp` is 128 MiB and model `/tmp` 64 MiB. These are declared container settings, not proof of effective host isolation or capacity.

## Workload tuning and model limits

`LAB_ROLE` defaults to `app` and allows only `app`, `planner`, `reviewer`. `MODEL_URL` defaults to, and must exactly equal, `http://model:8080/v1`. `KAFKA_BROKERS` is the shared comma-separated connection list, default/Compose `redpanda:9092`. The runner supplies app/model images and loopback `APP_PORT`; HTTP listens on 3000. Task limits, deadlines, grammar, permissions and model slots/context/threads are code-owned, not environment tuning knobs.

Measure enqueue/start/result delay, CPU/RSS and model-slot occupancy separately. With one shared model slot, two worker containers do not imply parallel generation. Thread/batch-thread/slot experiments require rebuilding the pinned image and measuring fixed workloads; the [llama.cpp 0.6.0 server reference](https://github.com/ggml-org/llama.cpp/blob/v0.6.0/tools/server/README.md) defines `-t`, `-tb`, `-np` and `-c`. See [broker and Linux tuning](../reference/tuning.md) for client and host limits. Do not expand permissions or auto-retry unknown attempts for throughput.

The [135M model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) warns of English-first output, factual errors, inconsistent logic and bias. Its function-calling statement applies to 1.7B, not this variant. Q8_0, grammar and a reviewer lane do not establish good judgment; review consequential output. Inference counters are process-local and reset to zero on replay; task gauges reconstruct.

## Proposed production view

[Production blueprint](../blueprints/agent-messaging.md).

Production would need admission/token budgets, persistent projections/checkpoints, isolated inference and quality evaluation before human-approved external actions. Fenced leases/epochs or transactional claims must protect execution ownership; do not scale either current role or share its topic with competing owners. Broker transactions cannot make model HTTP exactly once, and regional recovery must retain task/step/claim/result IDs and pinned artifacts, fence the old owner and reconcile missing completion before any deliberate new attempt.

## Sources and scenario coverage

[Fx 0.0.13](https://github.com/vercel-labs/fx/releases/tag/v0.0.13) is Apache-2.0. The [pinned adapter](https://github.com/vercel-labs/fx/blob/4d966e272cfc4296cdf703f409480088cf2e72ba/src/gateway/chat_completions_protocol.zig), not mutable website guidance, is the no-tools/truncation authority. SmolLM2/GGUF cards and Apache-2.0 license are retained in the model image; llama.cpp is MIT. Shared infrastructure owns vendor pins/license notices.

`bash labs/agent-messaging/e2e.sh` needs a running lab. [Test orchestration](../reference/commands.md) owns setup/disposal and exercises real three-stage inference, deduplication/conflicts, independent workers and completed-output replay without another inference. It does not grade answer quality.
