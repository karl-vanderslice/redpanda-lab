# Relay Loom Cooperative

Two separate workers hand off a proposal, critique and synthesis through Redpanda. Each invokes Vercel Labs fx 0.0.13 against the confined local SmolLM2-135M-Instruct Q8_0 model, not the unrelated fx JSON viewer. Tools and host/cloud credentials are unavailable.

From the repository root, use the [shared setup](../../README.md), then:

```bash
just up agent-messaging
just urls agent-messaging
just rpk agent-messaging topic describe agent-messaging.events.v1
just logs agent-messaging planner
just logs agent-messaging reviewer
```

Submit a short English task. Pause freezes the automatic transcript view, not workers; Refresh reads once while paused. A completed stage contains a consumed successful harness output, not a claim of correct advice. Generated grammar limits answers to a punctuation-terminated ASCII line of at most 220 characters; failed/partial harness output is not substituted.

[Guide: pins/licenses, APIs, confinement, handoffs and recovery](../../docs/labs/agent-messaging.md). Native release packaging preserves fx's Apache-2.0 `LICENSE` and `THIRD_PARTY_NOTICES.md`; the model image retains its Apache-2.0 license/card. An interrupted started stage fails visibly instead of automatically rerunning. Preserve uncertain task ID/text and look it up. Run one planner and one reviewer; stable IDs are not distributed fencing. Prompts/results remain plaintext: no private data or public exposure.

```bash
just check agent-messaging
just test agent-messaging
just down agent-messaging
```

The E2E checks three-stage inference and completed-output replay without new calls; it does not grade quality. `down` deletes the transcript and broker data. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) retains claims/results until disposal, with unbounded task state.