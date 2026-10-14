# Clockwork Correspondence

Local chat with immediate and one-shot scheduled prompts. Redpanda stores conversations, schedules, cancellation/start/result transitions. One app owns the wall-clock scheduler; the internal pinned SmolLM2-135M-Instruct Q8_0 model supplies real replies without tools or cloud credentials.

From the repository root, use the [shared setup](../../README.md), then:

```bash
just up agent-chat
just urls agent-chat
```

Create a conversation, send now, schedule a minute ahead and cancel pending work before its start wins the log order. Browser local time becomes a persisted UTC instant; Pause stops display polling, not scheduling. Refresh reads once while paused.

[Guide: API, timezone/DST, seven-day limit, model rights and recovery](../../docs/labs/agent-chat.md). The model image retains its Apache-2.0 card/license; llama.cpp is MIT. Completed replies replay without inference. Unfinished recorded attempts become unknown-outcome failures, never automatic reruns. Preserve unresolved request IDs and inspect their operations/jobs. Run one scheduler only; IDs and consumer membership are not fencing. This unauthenticated notebook exposes prompts/input/replies: use synthetic content.

```bash
just restart agent-chat app
just check agent-chat
just test agent-chat
just down agent-chat
```

Pending/overdue schedules resume after replay. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) retains the seven-day schedule history until disposal; conversation/job memory remains unbounded. Volume loss or full disk can prevent recovery. `down` deletes conversations, schedules and broker history. The E2E checks replies, due-time execution, cancellation and replay, not exactly-once inference under every failure.