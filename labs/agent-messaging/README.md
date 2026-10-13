# Agent Messaging

Two separate agents coordinate through a Redpanda topic. A planner proposes an approach, a reviewer critiques it, and the planner produces a synthesis using the recorded critique. Each role runs in its own container and invokes the genuine upstream `vercel-labs/fx` harness against a contained local model server.

The topic is the handoff mechanism and the durable transcript. A worker waits for the preceding step's recorded completion before starting its own inference. Restarting the app reconstructs completed outputs from the log instead of asking the model to generate them again.

## Run it

From the repository root:

```bash
nix develop --no-update-lock-file
just up agent-messaging
just urls agent-messaging
```

Open the app URL and submit a short English task. The page shows the planner, reviewer, and synthesis steps, their state, and the recorded model output. Inspect the same records in Console or with the broker CLI:

```bash
just rpk agent-messaging topic describe agent-messaging.events.v1
just logs agent-messaging planner
just logs agent-messaging reviewer
```

The image supplies `fx` 0.0.13. This is not Nixpkgs' unrelated `fx` JSON viewer. `fx.nix` pins the genuine native release by architecture and preserves its license notices. Both agents use SmolLM2-135M-Instruct Q8_0 through the project's llama.cpp server. No host credentials, ambient model endpoint, or cloud account is used.

## What completion means

A completed step contains a successful harness result that was published and consumed. It does not establish that the model's advice is correct. The 135M model keeps this lab small; the model server constrains each answer to a punctuation-terminated ASCII line of at most 220 characters. Short, imperfect answers are expected. A harness error still fails the step rather than accepting partial output.

Tools are denied. Each worker has a confined loopback relay to the model's text-completion endpoint and an allowlisted child environment. The lab demonstrates coordination, not autonomous code execution.

Stable task and step IDs make replay idempotent. An interrupted started step becomes visibly failed rather than being silently regenerated. An uncertain publish outcome is not permission to submit a new ID automatically. The [full guide](../../docs/labs/agent-messaging.md) explains lookup, recovery, and the distinction between singleton role ownership and production writer fencing.

## Check and remove

```bash
just check agent-messaging
just test agent-messaging
just down agent-messaging
```

The E2E requires three real harness results, independent agent instances, broker-record deduplication, and replay without new inference for completed work. It uses real containers and the local model, not fixed answers. `down` deletes the transcript and broker data.

This is a single-partition, replication-factor-one lab with finite retention. Prompts remain plaintext in the local log. Do not use private data or expose the application publicly.
