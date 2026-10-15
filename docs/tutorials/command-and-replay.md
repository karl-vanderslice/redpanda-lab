---
description: Create a work item, inspect its command receipt, reject a stale revision, and rebuild the same application view from Redpanda.
---

# Follow a command through replay

A broker acknowledgment says that a record was accepted by the broker. It does not, by itself, say that an application has applied the record. In this tutorial, you will use Folio Harbor Archives to follow a command through both steps, then rebuild the application's view from its actual log.

You will create one archival work item, assign an archivist, record a rejected change, and verify an exact rebuild. No files are uploaded and no external archive is connected.

## Start the work ledger

Use Linux with the [host prerequisites](../reference/commands.md) met. Run from the checkout root. If you already have an explorer running, this lab uses separate containers and data; starting it does not stop the explorer.

=== "With Just"

    ```bash title="Start the work ledger in the locked shell"
    nix develop --no-update-lock-file
    just up event-log
    just urls event-log
    ```

=== "Direct wrapper"

    The wrapper provides the locked tools for its own command. It does not change your terminal shell.

    ```bash title="Start the work ledger without entering a shell first"
    ./labs/run event-log up
    ./labs/run event-log urls
    ```

Open the printed **event-log app** URL. Wait for **Ready · full startup prefix consumed**. The page has a work-item index, a command form, a replay inspector and an execution ledger.

!!! note "Keep existing work"

    `up` preserves the log. These examples use the item `harbor-notes` and command IDs beginning with `reader-`. If you have used them before, choose an unused item ID and new command IDs throughout this tutorial. Do not erase a lab just to obtain the example's starting offsets.

## Create an item and read its receipt

Select **New work item**. Fill in:

| Field | Value |
| --- | --- |
| Action | Create item |
| Item identifier | `harbor-notes` |
| Work title | `Index the harbor correspondence` |
| Command identifier | `reader-create-001` |

Select **Append command** once. The status reports `Accepted: created` and gives the consumed command ID and offset. The index now contains an open item at revision 1.

The command ID identifies this request. The item ID identifies the object being changed. They are different identities: future changes to the same item need new command IDs.

In **Replay and receipts**, inspect the displayed receipt. Its `command` preserves your input; `result.before` is null and `result.after` contains the new item. The receipt's decimal-string `offset` locates the record in `event-log.events.v1`. On a fresh log the first offset is `0`; an existing log will use a later offset.

The visible item is a **projection**, an in-memory view derived from consumed records. The receipt establishes that this application consumed the record and applied its recorded decision, not just that a producer sent bytes.

## Assign an archivist, then reject a stale change

1. Select `harbor-notes` in **Work items**. The form selects **Assign archivist** and fills in expected revision `1`.
2. Enter archivist `Mira` and command identifier `reader-assign-001`.
3. Select **Append command**. The receipt reports `assigned`; the item becomes revision 2.
4. Leave **Expected revision** at `1`. Enter archivist `Rowan` and the new command identifier `reader-stale-001`.
5. Select **Append command** again.

The second assignment is rejected with `revision-conflict`. The item remains assigned to Mira at revision 2, but the execution ledger gains a rejection record. The expected revision prevents a command based on an older view from silently replacing a later change.

The form deliberately keeps the revision you entered. Select the item again to load its current revision before preparing a genuinely new change.

!!! warning "A rejected command is still an outcome"

    A valid command rejected by the domain has an immutable receipt. Reusing `reader-stale-001` returns that original rejection even if the item later changes. A new decision needs a new command ID; a retry of the same decision keeps its exact ID and input.

## Retrieve and repeat the original command

You can inspect the same receipt outside the browser. If you used the direct wrapper, enter `nix develop --no-update-lock-file` now so `jq`, `curl` and `just` are available. Then resolve this checkout's actual URL:

```bash title="Read the consumed creation receipt"
app=$(./labs/run event-log urls --json | jq -er .app) # (1)!
curl -fsS "$app/api/commands/reader-create-001" | jq '{id,offset,result}'
```

1. `jq -r` emits the URL without JSON quotes; `-e` makes a missing or null app value fail rather than become a URL. Port selection belongs to this checkout's wrapper, not the example.

Because you already have its consumed receipt, repeating the original creation is safe:

```bash title="Repeat the exact command, without a new record"
curl --fail-with-body -sS "$app/api/commands" \
  -H 'content-type: application/json' \
  --data '{"id":"reader-create-001","kind":"create","itemId":"harbor-notes","title":"Index the harbor correspondence"}' |
  jq '{id,offset,result}'
```

The response has the original creation offset and revision-1 outcome, even though the current item is at revision 2. **Unique commands / physical records** does not increase. Deduplication returns the first decision; it does not evaluate the old request against today's state.

Changing the input under that ID would return HTTP 409 without appending another record. This differs from the stale-revision rejection, which was a new valid command and therefore did append a decision.

## Rebuild the view from the broker

In the browser, select **Rebuild from the log**. The owner closes its current producer and consumer, clears projection memory, opens a new consumer from offset zero and waits through the captured startup boundary.

Wait for **Exact projection equality verified after full replay**. Open **Exact replay evidence** and compare `beforeDigest` with `afterDigest`; they should match when no other writer has appended in the meantime. `equal` should be true. The item, accepted and rejected receipts, offsets and physical ledger survive. Rebuild itself adds no record.

Repeat the rebuild. The result should still be equal. You are not recovering state from the browser: the running application reconstructs it from Redpanda.

!!! warning "Rebuild is not a backup or writer fence"

    Keep one application owner. The full log must remain available; there is no snapshot fallback. An uncertain send consumed while the old owner closes can make the rebuilt view legitimately differ from its earlier snapshot. If equality is false, inspect the evidence and [recovery contract](../labs/event-log.md#unknown-completion-and-retention) instead of assuming lost data or retrying with a new ID.

## Check what you learned

- The item revision changes only after an accepted item transition.
- A valid rejected command still has a permanent receipt and offset.
- Repeating an observed ID and exact input returns its original decision without another append.
- Rebuild restores the complete projection, including rejections and deduplication state.

A timeout proves none of these outcomes by itself. Preserve the exact command, look up its receipt, and follow the [unknown-completion procedure](../labs/event-log.md#unknown-completion-and-retention) before retrying an absent result.

## Keep the log or dispose of it

Leave the lab running to retain the workbench. An app-only restart preserves broker data:

```bash title="Restart the application without deleting its log"
just restart event-log app
```

!!! danger "Disposal deletes the history"

    When you no longer need this lab, `just down event-log` deletes its containers, network and broker volume. That removes both the accepted work and rejected command evidence. Other labs and reusable image/Nix caches remain.

Continue with the [complete work-ledger contract](../labs/event-log.md), choose an [inventory or clearing workflow](../labs/index.md), or compare this local owner with the [proposed production design](../blueprints/event-log.md).
