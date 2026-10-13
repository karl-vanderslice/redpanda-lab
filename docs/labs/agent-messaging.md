# Agent messaging: two agents, one ordered conversation

This lab runs **two genuinely separate agent containers**. `planner` and `reviewer` each have their own Node worker, private fx home, loopback relay and independent upstream `vercel-labs/fx` invocations. They coordinate only through Redpanda records. A third app container serves **Relay**, a violet/neutral operations transcript. A fourth container serves a project-pinned, CPU-friendly **SmolLM2-135M-Instruct Q8_0** model with llama.cpp.

No host model, provider account, API key, credential directory or ambient service is mounted. The agents do not invoke the unrelated JSON-viewer executable also named `fx`.

## Start and observe

From the repository's Nix development environment:

```bash
just up agent-messaging
./labs/run agent-messaging urls
```

Open the app URL reported by the runner. Open the separately reported Redpanda Console URL to inspect the event topic. The project-derived Compose name, network, volumes and loopback host ports are isolated from the other labs.

1. Submit a small English task such as **“Plan a small community book swap in three steps.”**
2. Watch **Planner / proposal** move from pending to running to completed. The text comes from actual local inference, not a fixture.
3. **Reviewer / critique** consumes the completed proposal and returns a risk and improvement.
4. **Planner / synthesis** consumes both texts and returns a final plan.
5. Inspect the agent IDs, stable step IDs, fx model, version and elapsed time below each message. Console shows the corresponding ordered records.
6. Select an older conversation to recover its full transcript. **Pause updates** freezes the visible view without stopping agents; **Resume updates** displays the latest snapshot. The light/dark toggle remembers a choice when browser storage is available.

The UI deliberately shows completed messages rather than token-by-token fragments: a model stream is not a durable result until its `step.completed` record is consumed. SSE makes the event transcript live at each durable transition.

```bash
just test agent-messaging
./labs/run agent-messaging logs
./labs/run agent-messaging down
```

The E2E script uses real local inference and bounded waits, checks both independent agent identities and all three results, resubmits the same task ID, publishes a duplicate record through the real `rpk` interface and observes event-ID deduplication, checks invalid/conflicting/foreign-origin submissions, restarts each worker, verifies zero new inference effects on replay, and restarts the UI projection without changing the transcript. It requires the lab already running; root tooling owns setup/teardown. It does not assert the tiny model's answer quality.

## Architecture and ownership

```text
Browser → app → task.submitted ─────────────────────────┐
                                                      │
Redpanda / agent-messaging.events.v1 / partition 0      │
  planner:  step.started → fx proposal → step.completed◀┘
  reviewer: step.started → fx critique → step.completed
  planner:  step.started → fx synthesis → step.completed
                                                      │
Browser ← app projection ←────────────────────────────┘

Each worker's fx → 127.0.0.1:18080/v1 → model:8080/v1
```

All domain records use the single topic **`agent-messaging.events.v1`**, one partition, replication factor one. The message key is `taskId`. A completed result includes `agentId`, `instanceId`, `stepId`, model/provider metadata, actual `final_output`, usage and timing. `instanceId` is a random process boot identity; `agentId` is the stable role (`planner` or `reviewer`). A user task follows exactly **proposal → critique → synthesis**. Generated wording is model-dependent; routing is deterministic.

The app and both agents replay the topic into independent in-memory projections. There is no direct planner-to-reviewer HTTP request. Every callback checks the schema, stage, actor and predecessor, ignores duplicate operation IDs, and changes only the projection. External effects begin **only after** the shared log's pre-start high-watermark replay barrier resolves. HTTP append success is not treated as domain success: the app waits until its consumer observes the submitted task, and agents wait until their accepted start is observed before invoking fx.

### Record and state contracts

| Record | Stable event ID | Meaning |
| --- | --- | --- |
| `task.submitted` | `<taskId>:submitted` | Immutable user task, initially pending |
| `step.started` | `<taskId>:<stage>:started` | Running step and owning process boot ID |
| `step.completed` | `<taskId>:<stage>:completed` | Successful fx `final_output`, makes the next stage eligible |
| `step.failed` | `<taskId>:<stage>:failed` | Actual inference failure or interruption, stops the workflow |

All records contain `schema: 1`, `taskId`, `eventId`, `type` and an informational UTC `at`. Step records add `stage`, `stepId`, `agentId` and `instanceId`. Ordering comes from broker offsets, **not wall-clock timestamps**. Steps start pending, become running only on a recorded claim, and end completed or failed. A failure prevents downstream execution.

The domain reducer ignores a duplicate event ID and duplicate task ID. A duplicate HTTP request with the same task ID and text returns the original projection; a different task with the same ID returns `409`. During concurrent submissions, the first consumed record wins. Keep the original ID when reconciling an ambiguous submission. Do not automatically retry with a new ID.

### Restart, replay and the deliberate interruption rule

```bash
./labs/run agent-messaging restart planner
./labs/run agent-messaging restart reviewer
./labs/run agent-messaging restart app
```

Completed outputs are replayed verbatim, never regenerated. Pending steps with no recorded start can run once the required predecessor is complete and replay is ready. A recorded running step whose worker restarts **fails as interrupted** if replay contains no terminal result. It is not silently rerun: inference may already have happened even when publication or acknowledgment failed. This conservative rule trades automatic recovery for visible uncertainty and avoids inventing exactly-once external inference.

For a hands-on failure exercise, submit a task and restart the currently running worker. If the restart occurs before its result record is accepted, the transcript says interrupted and later steps do not run. If completion wins the race, that real completed result is preserved instead. Inspect offsets rather than assuming which action won. Submit a new task only after consciously accepting that decision.

An fx process is bounded to 100 seconds, one agent step and 128 KiB captured stdout. An empty/invalid JSON result, nonzero process or fx exit status, unexpected tool call, oversized final answer or failed local relay produces a failed step; there is no substitute answer. Publish failure or consumer-observation timeout is **unknown**, not rejection. The worker stops and its `unless-stopped` restart policy rebuilds from the log to determine whether its result exists. A broker-unavailable startup remains unready rather than accepting tasks.

The lab has a disposable 24-hour retained log and no snapshots. After retention removes history, older state cannot be reconstructed. This is not a durable production task database.

## The actual fx integration

`labs/agent-messaging/fx.nix` packages upstream **fx v0.0.13**, tag commit **`4d966e272cfc4296cdf703f409480088cf2e72ba`**, as a native release executable. The checked-in fixed-output release hashes are:

| Platform | Release tarball SHA-256 |
| --- | --- |
| Linux x86_64 | `53a3b30ce1541048f8fa4b42b7bc68161466bb2e3708db104449a58af3807430` |
| Linux aarch64 | `78f6a8171193a1d2033f93d1b5a2940ea4a62147daf60a37ae670a9bf85f12e9` |

The repository's `flake.lock` pins Nixpkgs. Its stock `pkgs.fx` is **antonmedv/fx 40.0.0**, a JSON viewer, so the lab deliberately uses a local `fx` binding for the genuine Vercel harness. `default.nix` calls `common.mkNodeImage` with `extraContents = [ fx pkgs.bash pkgs.coreutils ]`; all three Node roles share that image and select their role through `LAB_ROLE`. Model repository/revision/content hash and llama.cpp tooling are fixed in the root's shared model image definition, not downloaded at runtime. `/model/model.gguf` is inside `${LAB_MODEL_IMAGE}`.

Each worker creates this private profile in `/tmp/fx-home/.fx/settings.json`:

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

Its real invocation, with generated prompt text sent through stdin, is:

```bash
FX_PROVIDER=local FX_MODEL=lab-small FX_PERMISSION_MODE=ask \
  FX_MAX_AGENT_STEPS=1 FX_AUTO_UPGRADE=0 FX_HERDR=0 \
  fx ask --json --no-save --no-color --system 'short role instructions' --
```

`inference.mjs` uses an argument-vector process spawn, not a shell-interpolated task. It passes an allowlisted environment, a private empty workspace and short planner/reviewer system instructions. No `--full-access`, login, auto-review cloud request, MCP server or host credentials are used. The v0.0.13 Chat Completions adapter actually omits tool schemas for `first_call_tool_choice: none` and rejects unexpected tool calls. The relay also rejects requests containing tools. The generated content published to Redpanda is exactly the successful JSON `final_output`, not the broader progress `output` field.

Fx requires HTTPS except loopback for custom connections. The Node relay therefore listens only on `127.0.0.1:18080` inside each agent container, not a host-published proxy. It accepts only POST `/v1/chat/completions` and forwards to the fixed internal model endpoint, without credentials or redirects. Input and duration are bounded. Generation uses temperature 0.2 and a 256-token cap. A native llama.cpp [GBNF grammar](https://github.com/ggml-org/llama.cpp/blob/master/grammars/README.md) restricts each answer to at most 220 ASCII characters ending in model-generated terminal punctuation. This fits the token allowance without trusting this tiny model to stop rambling on instruction alone. The harness must still exit successfully with a `final_output`; `OutputTruncated` remains a failure, and partial progress is never promoted to a completed result. The format is constrained, not the accuracy or usefulness of the advice. Browser tasks cannot supply arbitrary URLs.

The model image starts `llama-server -m /model/model.gguf --host 0.0.0.0 --port 8080 -c 8192 -np 1 -t 2 --alias lab-small --jinja`. Compose inherits that command rather than overriding its two-thread bound. Only the app's port is published. Agents and model run nonroot, with read-only application files, dropped capabilities and bounded writable `/tmp` tmpfs. They have no host bind mounts.

## HTTP and operational interfaces

| Endpoint | Interface |
| --- | --- |
| `GET /health` | `{ready, role, agentId, instanceId}`, 200 once replay/recovery is ready, otherwise 503 |
| `GET /metrics` | Prometheus text for readiness, task state, duplicate/rejected events and actual inference success/failure counters |
| `POST /api/tasks` | JSON `{id, task}`; ID 8–80 ASCII letters/digits/underscore/hyphen, task 1–1200 characters; 202 observed new task, 200 existing task |
| `GET /api/tasks` | Full projection, topic, consumed offset, replay readiness and duplicate/rejected counts |
| `GET /api/tasks/<id>` | One task or 404 if not observed |
| `GET /api/events` | SSE `snapshot` events for live durable transitions |

Only `app` serves browser/task endpoints. Each private agent serves health/metrics on port 3000. Mutation requests use bounded JSON parsing and same-origin checks; this is local-lab origin protection, **not authentication**. `400`, `403`, `409`, `413` and `415` distinguish invalid input, origin, ID conflict, oversized body and media type. A `503` response with `status: "unknown"` includes the original task ID. The UI offers **Check uncertain submission** and will not blindly create another task.

Example with an explicit durable client operation ID:

```bash
app=$(./labs/run agent-messaging urls --json | jq -r .app)
curl --fail --silent --show-error "$app/health"
curl --fail --silent --show-error \
  -H 'content-type: application/json' \
  -d '{"id":"my-book-swap-task-001","task":"Plan a small community book swap in three steps."}' \
  "$app/api/tasks"
curl --fail --silent --show-error "$app/api/tasks/my-book-swap-task-001"
```

Read agent diagnostics without publishing their ports:

```bash
./labs/run agent-messaging exec planner node -e \
  "fetch('http://127.0.0.1:3000/metrics').then(r=>r.text()).then(console.log)"
./labs/run agent-messaging exec reviewer node -e \
  "fetch('http://127.0.0.1:3000/health').then(r=>r.json()).then(console.log)"
./labs/run agent-messaging rpk topic describe agent-messaging.events.v1
```

Health means the process is replay-ready, not a promise that future model/broker requests will succeed. Inference counters are process-lifetime effects, intentionally zero after completed-task replay; task-state gauges are reconstructed domain state.

## What this does not claim

SmolLM2's model card documents weak instruction following and reasoning at 135M parameters, possible inaccuracies, inconsistent logic and bias, and predominantly English output. Its function-calling claims concern the **1.7B** variant, not this model. Q8_0 makes it small enough for a local CPU demo; it does not turn it into a production reasoner. The reviewer can repeat, misunderstand or fail to improve a plan. The event choreography is the lesson, not autonomous judgment. Never use these outputs for consequential decisions without review.

This is a singleton-per-role lab. **Do not scale planner or reviewer replicas.** A stable domain step ID and replay deduplication are not distributed fencing. A production deployment needs partition ownership and a fenced epoch/lease or transactional claims, idempotent/fenced result writes, and reconciliation for external inference outcomes. Broker transactions can atomically publish records and consumed offsets, but cannot make an HTTP model invocation exactly once. Add durable snapshots/checkpoints, intentional retention, dead-letter/recovery policies, schema evolution, authn/authz, broker TLS/ACLs, restricted network egress, task quotas, operational alerts, and data/privacy controls before sharing beyond a local machine. User tasks and generated results are retained plaintext in this lab's topic.

Across regions, retain tasks, step identities, ownership epochs and successful result records together, with the pinned model and harness artifacts available at the standby. Fence old role owners before resuming task execution. Replication lag can leave a model invocation without its durable completion record; surface that uncertainty and reconcile it instead of replaying the external effect. See [production and disaster recovery](../explanation/production.md) for the async loss window, licensed replication options and restore drills.

## Sources, pins and rights

- [Upstream fx release v0.0.13](https://github.com/vercel-labs/fx/releases/tag/v0.0.13), [pinned CLI implementation](https://github.com/vercel-labs/fx/blob/4d966e272cfc4296cdf703f409480088cf2e72ba/src/core/cli/cli_ask.zig) and [pinned Chat Completions adapter](https://github.com/vercel-labs/fx/blob/4d966e272cfc4296cdf703f409480088cf2e72ba/src/gateway/chat_completions_protocol.zig): Apache-2.0. The package preserves LICENSE and THIRD_PARTY_NOTICES.
- [Official custom model connections](https://fx.sh/docs/configure-fx/custom-model-connections.md), [noninteractive fx ask](https://fx.sh/docs/using-fx/fx-ask.md), [permissions](https://fx.sh/docs/configure-fx/permissions.md) and [configuration](https://fx.sh/docs/configure-fx/configuration.md). The website may evolve; the checked-in package pin and inspected v0.0.13 source define this lab's behavior.
- [SmolLM2-135M-Instruct model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct): Apache-2.0 weights and the stated capability limits. Consult the shared fixed-output GGUF source for quantization provenance.
- [llama.cpp server](https://github.com/ggml-org/llama.cpp/tree/master/tools/server): MIT; provided by the locked Nixpkgs model image, not a floating runtime install.
- [Redpanda transactions and transactional IDs](https://docs.redpanda.com/current/develop/transactions/): the relevant production fencing/atomic-publication boundary. Redpanda broker and Console pins/licenses are documented by shared lab infrastructure; this lab does not redistribute them under an invented license.

The original UI uses no external fonts, images, CDN libraries or copied reference assets. Its visual direction follows the shared taste-book principles: editorial hierarchy, restrained violet accents, neutral surfaces and hairline panels.
