---
id: RPLAB-10
title: Add an isolated Bitcoin paper-trading lab
status: Done
assignee: []
created_date: '2026-10-13 21:49'
updated_date: '2026-10-13 23:03'
labels: []
dependencies: []
ordinal: 10000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a separate bitcoin lab to the existing Just lifecycle and Nix-generated app images. Replay an attributed, checked-in Coinbase BTC/USD hourly candle capture, not a runtime external quote service. Use one authoritative Redpanda partition and one command owner. A 3/8-close regime fills at the next close, with 25% cash sizing, 10 bps fees, integer-cent/satoshi accounting and stable command receipts. No wallets, credentials, real orders, margin or short positions.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 A Nix-built Podman app replays attributed historical BTC/USD candles through Redpanda without exchange credentials or live-market dependencies.
- [x] #2 The web UI watches prices and exposes automatic paper entries/exits, cash, Bitcoin positions, fees and realized/unrealized P&L.
- [x] #3 Public workflow checks prove paper accounting, idempotency, deterministic restart replay and project-scoped disposal; human docs explain strategy, data age and simulation limits.
<!-- AC:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implemented price replay, manual and automatic paper transitions, queued timer ownership, full-outcome replay verification, source SHA compatibility checks, SSE UI, data provenance and public workflow checks. Runtime and browser validation pending.

Verification complete. Final E2E report: /home/karl/.cache/redpanda-lab/e2e/bitcoin/20261013T184006-2080243/report.md. Browser proved original-ID recovery before publication and after a committed buy, manual exit, automatic buy at quote 8 / exit at 22, finite feed, narrow/2x text and blocked-storage theme fallback.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered historical Coinbase BTC/USD paper trading in its own Nix-built Podman/Redpanda lab. Actual E2E independently verified cent/satoshi accounting, fees, manual/automatic positions, real pacing, reserved timer IDs, deduplication and restart. Browser proved offline original-command recovery across reload, dropped response after one committed buy without a duplicate fill, keyboard trading, light/dark, narrow and 2x text, and storage-unavailable theme fallback.
<!-- SECTION:FINAL_SUMMARY:END -->
