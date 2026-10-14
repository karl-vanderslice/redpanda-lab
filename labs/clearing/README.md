# Northbridge Ledgerworks

A fictional transfer desk: screening, reserved funds, deliberate review and balanced integer-cent local clearing. No bank connector, external watchlist or real settlement rail is present.

From the checkout root, with the [host prerequisites](../../docs/reference/commands.md) met:

```bash
nix develop --no-update-lock-file
just up clearing
just urls clearing
```

Open the app URL. Follow the [complete walkthrough and API reference](../../docs/labs/clearing.md) for exact balances, screening rules and uncertain-command recovery.

## Try the ledger

On a fresh lab, with no other writer:

1. Screen **10000 cents** from `operating` to `treasury`. It is approved and reserved; booked balances do not change yet. Clear the approved obligation to record one negative debit and one equal positive credit.
2. Screen **100000 cents** between the same accounts. It is held at the inclusive amount threshold. Enter a reviewer ID and rationale, deliberately approve it, then clear it separately. Approval retains the reservation until clearance.
3. Screen **1000 cents** from `operating` to `review`. Reject the resulting fixture-watchlist hold. The reservation is released without changing booked balances.
4. Check total booked cents: **2210000**. Signed entries must sum to **zero**. Available cents are booked balance minus reservations, not an extra pool of funds.
5. Run `just restart clearing app` and refresh. Accounts, reservations, decisions, receipts and entries rebuild from the retained log. Restart does not replenish funds.

Keep each command's ID and exact payload if completion is uncertain. Inspect its receipt and restart to replay before resuming; absence from a live projection does not prove the append failed. Do not replace an uncertain command's ID.

## Run the accounting scenario

**`just test clearing` deletes existing clearing history**, runs the real-container workflow and disposes of it.

For an already running lab with no transfer receipts, the direct scenario is:

```bash
bash labs/clearing/e2e.sh
```

It checks screening boundaries, manual reviews, reservations, competing clearances, immutable receipts, exact-cent conservation, real Kafka duplicates and restart replay. It does not reset or dispose of the running lab. Evidence is external; `CLEARING_E2E_ARTIFACT_DIR` selects a retained directory, otherwise the script prints a temporary destination. These describe source checks, not a release pass claim.

## Ownership and disposal

Run one application writer. A process-local queue and one partition do not fence independent writers. Reviewer labels and browser confirmations are not authentication. The API's monotonic fixture clock is not a trusted fraud clock. Use synthetic data and keep the service on loopback.

**`just down clearing` deletes the local history and fictional balances.** It does not perform financial rollback or external settlement. See the [proposed production blueprint](../../docs/blueprints/clearing.md) and [recovery boundaries](../../docs/explanation/production.md) before considering a real system.
