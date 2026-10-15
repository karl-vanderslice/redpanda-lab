---
description: Distinguish approval, reservations, exception review, and balanced local clearing without connecting to a bank.
---

# Northbridge Ledgerworks

Screen fictional transfers, review held obligations and record balanced local clearing entries. No bank, payment network or external watchlist is connected. Approval is not clearance; local clearance is not bank settlement.

## Start the desk

Meet the [common prerequisites](../reference/commands.md), then run from the checkout root:

```bash title="Start the local clearing desk"
nix develop --no-update-lock-file
just up clearing
just urls clearing
```

Open the app URL. **Pause updates** freezes this browser's view, including against an automatic read already in flight, not the ledger. **Refresh ledger** reads current state manually.

Write controls stay disabled until a ready ledger snapshot arrives. If a read fails, the displayed ledger remains available but new writes stop. A successful refresh clears the connection warning. It does not resolve a previously uncertain command or unlock its preserved input.

The first consumed record initializes five accounts and policy `northbridge-risk-1`:

| Account | Opening cents | Fixture marker |
| --- | ---: | --- |
| `operating` | 1000000 | none |
| `treasury` | 1000000 | none |
| `reserve` | 10000 | none |
| `review` | 100000 | review |
| `blocked` | 100000 | block |

Booked balances total **2210000 cents**. Amounts and signed entries use integer cents, not decimal currency. Available cents equal booked cents minus reserved cents.

## Transfer, review and clear

The figures below assume a fresh lab with no earlier transfer instructions and no other writer. If you already have history, inspect it instead of resetting by accident: **`just down clearing` permanently deletes it**.

### Clear an ordinary transfer

1. In **Reserve a transfer**, keep the generated immutable ID. Select `operating` as debit and `treasury` as credit. Change the default amount from **100000** to **10000** cents ($100.00); the default amount would trigger the hold demonstrated in the next section.
2. Select **Screen and reserve** once. The transfer is `approved`; its receipt records the original command and offset. Operating still has 1000000 booked cents, but 10000 are reserved and only 990000 are available. Approval has not moved booked funds.
3. Under **Local clearing calculation**, select that approved transfer, confirm the local entry and select **Clear approved obligation**.
4. Inspect the two entries under the same clearing ID: operating **−10000**, treasury **+10000**. The reservation is consumed. Booked balances are now 990000 and 1010000 cents respectively; the total remains 2210000 and net entries remain zero.

### Review an amount hold

1. Screen a new **100000**-cent transfer from `operating` to `treasury`. This meets the inclusive amount-review threshold, so it is `held`, not rejected. Operating has 990000 booked, 100000 reserved and 890000 available cents.
2. Under **Held obligations**, select its ID. Enter a reviewer ID and a nonempty rationale. Choose **Approve for local clearing**, confirm deliberate review and select **Record review decision**.
3. Inspect the receipt. The transfer is now `approved`; the 100000-cent reservation remains. Reviewer text is recorded evidence, not an authenticated identity.
4. Select the approved transfer in **Local clearing calculation**, confirm and clear it. The new pair is operating **−100000**, treasury **+100000**. Booked balances are now 890000 and 1110000 cents; both reservations are zero. Total booked cents remain **2210000**, and all signed entries sum to **zero**.

A held transfer cannot clear directly. A completed transfer cannot clear a second time under another ID.

### Reject and release a hold

Screen a new **1000**-cent transfer from `operating` to `review`. The explicit fixture marker holds it even though the amount is small. Review it with **Reject and release hold**, a rationale and deliberate confirmation. Operating's reservation returns from 1000 to zero; booked balances and entries do not change.

The `blocked` fixture rejects transfers without reserving funds. It is not a real sanctions or fraud service.

### Rebuild from the log

Note the account balances, transfers, reviews, entries and receipt IDs. Then restart only the app:

```bash
just restart clearing app
```

Refresh the desk after readiness. It reconstructs the same ledger from `clearing.events.v1`, including held/approved reservations and immutable receipts. Restart does not replenish balances. Console can inspect the underlying topic; do not publish arbitrary records into it.

## Screening and money rules

The single ordered owner evaluates rejection before holds:

1. Reject a transfer involving a blocked fixture, an amount **above 500000 cents**, or an amount above the debit account's available balance.
2. Otherwise hold a transfer involving the review fixture, an amount **at least 100000 cents**, or the **fourth or later** screened request from that debit account within the velocity window.
3. Otherwise approve it for local clearing.

The velocity window is `(decisionAt - 60000, decisionAt]`. It counts all screened transfer requests, including rejected ones, not just cleared transfers. Durable evidence includes the rule reasons, count, policy version and decision timestamp.

Approved and held transfers reserve the full amount. Commands are serialized through consumption, so one owner's concurrent requests cannot spend the same available cents. A screened rejection is durable but creates no reservation.

Only held transfers can be reviewed. Approval retains the reservation; rejection releases it without changing booked balance. Policy-rejected, already reviewed and cleared transfers cannot be approved through the review API.

Only approved transfers clear. One immutable clearing ID owns exactly two equal-and-opposite entries, consumes the reservation and marks the transfer cleared. Reusing the exact command ID returns the original receipt; a different clearance ID receives a durable `already-cleared` denial. Booked totals remain constant and signed entry totals remain zero.

## API reference

```bash
app=$(./labs/run clearing urls --json | jq -er '.app')
curl --fail-with-body "$app/api/state" | jq
```

All mutation bodies must contain exactly the fields below. IDs are 1–80 ASCII letters, digits, underscores or hyphens; `fixture-v1` is reserved. IDs are globally unique across transfers, reviews and clearings. An exact retry must preserve every original field, including `decisionAt`.

| Route | Body or result |
| --- | --- |
| `GET /health` | Readiness after full-prefix replay. |
| `GET /api/state` | Accounts, policy, transfers, entries, operations, totals and offsets. |
| `GET /api/operations/ID` | First consumed command, outcome, exact record and original offset. |
| `POST /api/transfers` | `{id, from, to, amountCents, decisionAt}` |
| `POST /api/reviews` | `{id, transferId, decision, reviewer, note, decisionAt}`; `decision` is `approve` or `reject`. `note` must be nonempty after trimming and at most 240 input characters; the stored note is trimmed. |
| `POST /api/clearings` | `{id, transferId, decisionAt}` |
| `GET /metrics` | Booked/reserved cents, net entry cents, cleared count and broker duplicate count. |

`amountCents` is a safe integer from 1–1000000000; debit and credit accounts must differ. `decisionAt` is an integer epoch millisecond from 0–8640000000000000 and cannot precede the last consumed decision. The UI chooses current wall time or the next logged millisecond. The API deliberately accepts a fixture clock: it is **not trusted event time**, and moving it changes velocity screening.

Malformed input, unsupported fields, unknown accounts, backward time and conflicting IDs fail before publication. Screened rejections and denied review/clearance commands are instead recorded domain outcomes. Approved/held receipts return 200, screened rejection 422, and denied review/clearance 404 or 409. Receipt lookup returns 200 even when the recorded outcome was rejected.

For automation, read `lastDecisionAt` first, use unique IDs, and save each exact request body before sending it. A changed timestamp or payload is not a retry.

## Replay and unknown completion

`clearing.events.v1` must have exactly one partition and its complete prefix. The first `fixtures` record contains balances and risk policy. Each `execution` record contains a complete canonical command and calculated outcome. Only consumption changes accounts, reservations, transfer state or entries. The consumer recomputes each outcome and checks equality before applying it. Invalid records, conflicting identities or unsupported fixture/policy changes stop replay rather than silently rescreening history.

The shared KafkaJS client uses an idempotent producer, one in-flight request, `acks=-1` and a fresh replay group per startup. Readiness waits for the captured high watermark. A nonzero low watermark or extra partition prevents safe reconstruction. There is no alternative authoritative balance store. The ordinary runner enforces full-history retention; [topic policy](../reference/tuning.md#topic-policy) explains its disk and recovery limits. Development-mode acknowledgments do not prove stable storage.

If append or projection completion becomes unknown:

1. Preserve the **exact command ID and payload**. The server fences new writes, including queued commands.
2. Inspect `/api/operations/ID` or **Inspect preserved ID**. Absence from the current projection is not proof of nonpublication.
3. Restart the app to replay before resuming writes. Inspect the receipt again; only then consider resubmitting the exact preserved command. Never replace its ID.

The browser keeps uncertain payloads in optional local storage, with an in-memory fallback if storage is denied. Export the payload before closing such a page. Shutdown rejects new admission and drains admitted commands; the shared log settles outstanding sends before disconnect. A forced exit is a separate uncertainty boundary.

## Configuration and ownership

`KAFKA_BROKERS` is the only app connection option: Compose supplies `redpanda:9092`. Topic, fixtures, policy, internal HTTP port 3000, 30-second append/projection deadlines and 16384-byte JSON limit are fixed. There are no bank credentials or provider environment variables. The image uses the shared pinned Node/KafkaJS builder and offline theme assets, without runtime npm installation.

The app runs nonroot with a read-only root, 16 MiB tmpfs, dropped capabilities and no-new-privileges. HTTP rejects cross-origin mutations and non-JSON bodies but has no user authentication or reviewer-role enforcement. Browser confirmations are not authorization.

Run **one application writer**. Its process-local queue and ephemeral replay group do not elect or fence a leader. A partition provides order, not protection from a competing writer or arbitrary producer. Manual publication is limited to the exact known duplicate used by the scenario below; see the [codec contract](../reference/commands.md#compression).

`just down clearing` disposes of only this lab's runtime and broker volumes. It erases the local ledger; it does not roll back a financial transaction or settle an external obligation.

## Accounting scenario

For a fresh, disposable lab, `just test clearing` owns startup, the real-container scenario and disposal. **It deletes existing clearing history.**

Alternatively, with a running clearing lab and **no transfer receipts**, run:

```bash
bash labs/clearing/e2e.sh
```

The direct script does not reset or dispose of the lab. Its source checks amount/velocity/watchlist boundaries, approval/rejection, released holds, insufficient funds, concurrent reservations and clearance races. Its independent accounting oracle compares each balance with opening cents plus signed entries, checks reservation ownership, injects a real Kafka duplicate and compares exact state after app restart. Invalid input, timestamps, media types and origins must leave offsets unchanged.

It saves initial, before-restart and after-restart state, results and request transcript outside the checkout. Set `CLEARING_E2E_ARTIFACT_DIR` to retain them at a chosen destination; otherwise it prints a temporary directory. These are the scenario's checks, not a claim that a particular release has passed them.

## Beyond local clearing

The [Northbridge blueprint](../blueprints/clearing.md) is a proposal, not deployed infrastructure. Real operation would require authenticated account permissions, distinct review roles, verified operator evidence, a durable writer fence, trusted/versioned risk policy, supported replicated storage, audited reconciliation and restore procedures.

A separately authorized bank/network adapter would also need persistent external idempotency keys, unknown-outcome reconciliation, finality rules, statement matching and controlled settlement. Qualified owners must determine licensing, sanctions, privacy, retention and regulatory obligations. No local result establishes compliance, external exactly-once effects or legal finality. See [production and recovery](../explanation/production.md).
