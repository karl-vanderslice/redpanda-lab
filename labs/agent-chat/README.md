# Scheduled Agent Chat

A web chat application with local inference and one-shot scheduled prompts. Redpanda stores conversations, messages, and job transitions. One application process owns the scheduler and rebuilds its pending work from the log after a restart.

Redpanda is not the timer. The application checks due instants, records an accepted start transition, calls the model, and records the result. That separation makes scheduling, cancellation, and interruption visible instead of hiding them behind a queue acknowledgement.

## Run it

From the repository root:

```bash
nix develop --no-update-lock-file
just up agent-chat
just urls agent-chat
```

Open the app URL and create a conversation. Send a short prompt now, then schedule another for a minute ahead. The journal shows pending, running, completed, failed, and cancelled jobs. A pending prompt can be cancelled before its start wins the log order.

The app and its SmolLM2-135M model server run in containers. Nix supplies the immutable model file and llama.cpp runtime. There is no cloud account, API credential, model tool access, or ambient provider connection.

## Restart and interruption

```bash
just restart agent-chat app
```

Pending schedules are reconstructed from `agent-chat-events`; overdue pending work runs after replay. A job starts no earlier than its stored UTC due instant. The browser accepts local date/time input and converts it to that instant when submitted. The [guide](../../docs/labs/agent-chat.md) explains timezone, daylight-saving, and context limits.

A running model call interrupted by restart has an unknown external outcome. The job becomes visibly failed and is not retried automatically. Completed replies are replayed without another model call. Stable request IDs suppress repeated submissions, but that does not make external inference exactly once.

Run only one scheduler. This lab has no distributed lease or fencing protocol. Its single-partition, replication-factor-one log has finite retention, so it is not a durable production conversation store.

## Check and remove

```bash
just check agent-chat
just test agent-chat
just down agent-chat
```

The E2E covers actual local inference, scheduled execution no earlier than due, cancellation, restart before due, and completed-history replay without another attempt. `down` deletes the conversations, schedules, and broker data.

The [full walkthrough](../../docs/labs/agent-chat.md) includes the API, state transitions, unknown-outcome handling, model provenance, and the ownership and recovery work needed before using this design across regions.
