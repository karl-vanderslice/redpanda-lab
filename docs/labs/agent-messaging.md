# Agent messaging: two agents, one ordered conversation

Two separate agent containers coordinate only through Redpanda. `planner` and `reviewer` each own a Node worker, private fx home, loopback relay and independent **Vercel fx** invocations. `app` serves the Relay transcript; a fourth container runs SmolLM2-135M-Instruct Q8_0 with llama.cpp. No host model, account, API key, credential directory or ambient service is mounted. This is not the unrelated `fx` JSON viewer.

## Start and observe

Use the [common environment and lifecycle commands](../reference/commands.md):

```bash
just up agent-messaging
./labs/run agent-messaging urls
```

Submit a short English task, for example “Plan a small community book swap in three steps.” Routing is fixed: **planner proposal → reviewer critique → planner synthesis**. Each stage shows pending/running/completed or failed, stable step/agent IDs, model/version and elapsed time. Wording comes from actual inference, not fixtures. The UI displays completed messages only: streamed progress is not durable until `step.completed` is consumed. SSE updates durable transitions; **Pause updates** freezes only the view. Older conversations remain selectable; theme persists when storage works.

## Architecture and ownership

```text
Browser → app → task.submitted
                    │
Redpanda / agent-messaging.events.v1 / partition 0
  planner:  step.started → fx proposal  → step.completed
  reviewer: step.started → fx critique  → step.completed
  planner:  step.started → fx synthesis → step.completed
                    │
Browser ← app projection

Each worker's fx → 127.0.0.1:18080/v1 → model:8080/v1
```

One topic, one partition, RF1; key `taskId`. Results contain `agentId`, random boot `instanceId`, `stepId`, model/provider metadata, actual `final_output`, usage and timing. Stable agent roles and random process identity are distinct.

App/agents replay into independent projections; no planner-to-reviewer HTTP exists. Callbacks validate schema/stage/actor/predecessor, deduplicate IDs and update state only. External effects wait for pre-start high-watermark replay. App submission waits for consumer observation; agents await their accepted start before invoking fx. Append acknowledgment is not domain completion.

### Record and state contracts

| Record | Stable `eventId` | Transition |
| --- | --- | --- |
| `task.submitted` | `<taskId>:submitted` | Immutable task, pending |
| `step.started` | `<taskId>:<stage>:started` | Running, owned by boot ID |
| `step.completed` | `<taskId>:<stage>:completed` | Successful `final_output`; enables successor |
| `step.failed` | `<taskId>:<stage>:failed` | Inference failure/interruption; stops workflow |

Envelope: `schema: 1`, `taskId`, `eventId`, `type`, informational UTC `at`. Steps add `stage`, `stepId`, `agentId`, `instanceId`. Offsets, not timestamps, order transitions. A recorded claim is required for running; failure blocks successors.

Reducer ignores duplicate event/task IDs. HTTP same-ID/same-text repeats return the original projection; changed text returns 409. Concurrent submissions are first-consumed-wins. Keep the original ID for ambiguous submissions; never automatically replace it.

### Restart, replay and the deliberate interruption rule

```bash
./labs/run agent-messaging restart planner
./labs/run agent-messaging restart reviewer
./labs/run agent-messaging restart app
```

Completed outputs replay verbatim. Unstarted pending steps become eligible after predecessor completion/replay. A restarted worker's recorded running step with no terminal result **fails as interrupted**, never silently reruns: inference may have happened before publication/ack failed. If completion wins the restart race, it survives; inspect offsets. Submit a new task only after accepting that decision.

Fx is bounded to 100 seconds, one step and 128 KiB captured stdout. Empty/invalid JSON, nonzero process/fx exit, unexpected tool call, oversized answer or failed relay causes failure, never a substitute answer. Publication failure/observation timeout is **unknown**, not rejection; the worker stops and `unless-stopped` restarts it to reconstruct whether the result exists. Broker-unavailable startup stays unready. The 24-hour log has no snapshots; expired history cannot recover old tasks.

## The actual fx integration

`fx.nix` packages native upstream **v0.0.13**, commit `4d966e272cfc4296cdf703f409480088cf2e72ba`:

| Platform | Release tarball SHA-256 |
| --- | --- |
| Linux x86_64 | `53a3b30ce1541048f8fa4b42b7bc68161466bb2e3708db104449a58af3807430` |
| Linux aarch64 | `78f6a8171193a1d2033f93d1b5a2940ea4a62147daf60a37ae670a9bf85f12e9` |

Locked Nixpkgs `pkgs.fx` is antonmedv/fx 40.0.0; the lab uses a local Vercel `fx` binding. `default.nix` adds `[ fx pkgs.bash pkgs.coreutils ]` through `common.mkNodeImage`; all Node roles share the image and select `LAB_ROLE`. Root shared model declarations pin repository/revision/hash and llama.cpp. `${LAB_MODEL_IMAGE}` contains `/model/model.gguf`; runtime downloads nothing.

Private `/tmp/fx-home/.fx/settings.json`:

```json
{
  "provider": "local",
  "models": { "local": "lab-small" },
  "permission_mode": "ask",
  "permission": { "*": "deny" },
  "first_call_tool_choice": "none",
  "max_agent_steps": 1,
  "context": false,
  "session_titles": false,
  "auto_upgrade": false,
  "providers": {
    "local": {
      "protocol": "openai-chat-completions",
      "base_url": "http://127.0.0.1:18080/v1",
      "auth": { "type": "none" },
      "model_metadata": {
        "lab-small": {
          "context_window": 8192,
          "max_output_tokens": 256,
          "supports_tool_use": false,
          "supports_vision": false
        }
      }
    }
  }
}
```

Generated prompts enter stdin; the actual invocation is:

```bash
FX_PROVIDER=local FX_MODEL=lab-small FX_PERMISSION_MODE=ask \
  FX_MAX_AGENT_STEPS=1 FX_AUTO_UPGRADE=0 FX_HERDR=0 \
  fx ask --json --no-save --no-color --system 'short role instructions' --
```

`inference.mjs` uses argument-vector spawn, allowlisted environment, empty private workspace and short role instructions, not shell-interpolated tasks. No `--full-access`, login, cloud auto-review, MCP or host credentials. The pinned adapter omits tool schemas for `first_call_tool_choice: none` and rejects unexpected calls; relay rejects tools too. Only successful JSON `final_output`, never progress `output`, is published.

Fx requires HTTPS except loopback. Each relay is container-local `127.0.0.1:18080`, accepts only POST `/v1/chat/completions`, and forwards to the fixed internal model without credentials/redirects. Input/duration are bounded; tasks cannot supply URLs. Temperature is 0.2; cap 256 tokens. [GBNF](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md) limits output to 220 ASCII characters ending in generated terminal punctuation. This constrains format, not accuracy. Successful harness exit/`final_output` remains required; `OutputTruncated` fails and partial progress is never promoted.

Model command:

```text
llama-server -m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 -t 2 --alias lab-small --jinja
```

Compose retains the two-thread bound. Only app is host-published. Agents/model are nonroot, read-only, capability-dropped, with bounded `/tmp` tmpfs and no host binds.

## HTTP and operational interfaces

| Endpoint | Contract |
| --- | --- |
| `GET /health` | `{ready,role,agentId,instanceId}`; 200 replay/recovery-ready, otherwise 503 |
| `GET /metrics` | Readiness, task gauges, duplicate/rejected records, actual inference counters |
| `POST /api/tasks` | `{id,task}`; ID 8–80 ASCII letters/digits/underscore/hyphen, task 1–1200 characters; 202 observed new task, 200 existing |
| `GET /api/tasks` | Full projection, topic, offset, readiness, duplicate/rejected counts |
| `GET /api/tasks/<id>` | One observed task; otherwise 404 |
| `GET /api/events` | SSE `snapshot` transitions |

Only app serves task/browser routes; private agents serve health/metrics on 3000. Bounded JSON and Origin checks are not authentication. Errors: 400 input, 403 origin, 409 ID conflict, 413 size, 415 media type. 503 `status:"unknown"` retains task ID. **Check uncertain submission** does not blindly create another task.

```bash
app=$(./labs/run agent-messaging urls --json | jq -r .app)
curl -fsS -H 'content-type: application/json' \
  -d '{"id":"my-book-swap-task-001","task":"Plan a small community book swap in three steps."}' \
  "$app/api/tasks"
curl -fsS "$app/api/tasks/my-book-swap-task-001"
./labs/run agent-messaging exec planner node -e \
  "fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(console.log)"
./labs/run agent-messaging exec reviewer node -e \
  "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(console.log)"
./labs/run agent-messaging rpk topic describe agent-messaging.events.v1
```

Health is replay readiness, not future model/broker success. Inference counters are process-local effects, zero after completed-task replay; task gauges reconstruct.

The E2E uses real inference/bounded waits to check both agents/three results, task/event deduplication via `rpk`, input/conflict/origin errors, worker replay without new inference and app transcript replay. It needs a running lab; root `just test agent-messaging` owns setup/disposal. It does not grade answer quality.

## What this does not claim

The 135M model has weak instruction following/reasoning, inaccuracies, inconsistent logic, bias and mostly English output. Function-calling claims apply to **1.7B**, not this variant. Review consequential output; Q8_0 and a reviewer role do not guarantee good judgment.

**Do not scale either role.** Stable IDs are not fencing. Production needs partition ownership, fenced leases/epochs or transactional claims, fenced/idempotent results and external-outcome reconciliation. Broker transactions cannot make model HTTP exactly once. Also required: recoverable snapshots/checkpoints, retention/schema/recovery policy, TLS/ACLs/auth, restricted egress, quotas, alerts and privacy controls. Tasks/results are plaintext in the topic.

Regional recovery must retain task/step/ownership/result identities and pinned artifacts together, fence old owners and reconcile inference without a completion record. Replication lag is not permission to repeat inference; see [production and disaster recovery](../explanation/production.md).

## Sources, pins and rights

- [fx release](https://github.com/vercel-labs/fx/releases/tag/v0.0.13), [pinned CLI](https://github.com/vercel-labs/fx/blob/4d966e272cfc4296cdf703f409480088cf2e72ba/src/core/cli/cli_ask.zig), [adapter](https://github.com/vercel-labs/fx/blob/4d966e272cfc4296cdf703f409480088cf2e72ba/src/gateway/chat_completions_protocol.zig): Apache-2.0; LICENSE/THIRD_PARTY_NOTICES retained.
- Official [connections](https://fx.sh/docs/configure-fx/custom-model-connections.md), [ask](https://fx.sh/docs/using-fx/fx-ask.md), [permissions](https://fx.sh/docs/configure-fx/permissions.md), [configuration](https://fx.sh/docs/configure-fx/configuration.md). Pinned source, not evolving website, defines behavior.
- [SmolLM2 card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct): Apache-2.0; shared fixed-output GGUF records quantization provenance.
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server): MIT, locked Nixpkgs package.
- [Redpanda transactions](https://docs.redpanda.com/current/develop/transactions/): production atomic-publication/fencing boundary; shared infrastructure retains vendor pins/licenses.

Original UI uses no copied assets, external fonts, images or CDN libraries.
