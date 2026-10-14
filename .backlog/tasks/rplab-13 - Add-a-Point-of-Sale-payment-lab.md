---
id: RPLAB-13
title: Add a Point of Sale payment lab
status: In Progress
assignee:
  - '@omp'
created_date: '2026-10-14 01:27'
updated_date: '2026-10-14 17:06'
labels: []
dependencies: []
ordinal: 13000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Explore checkout, receipts and payment-provider outcomes through durable Redpanda events without live money.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Cash checkout and refunds produce durable receipts and a consistent sales ledger.
- [ ] #2 Real Stripe and Square sandbox integrations are optional, reject live mode and distinguish uncertain provider outcomes from success.
- [x] #3 Real-container E2E verifies cash totals, duplicate/conflicting operations, refunds and replay; docs identify unverified provider paths.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use integer-cent catalog prices and ordered checkout events, with local cash by default and explicit sandbox credential configuration. Provider outcomes must be reconciled with stable idempotency keys; no fake provider.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Cash E2E passed 20261013T225207-2794742 and native browser checkout/refund passed. Actual owner clock4/4 and graceful-drain2/2 scenarios pass. Endive parameter updated to allowed_payment_method_types[] from version-matched primary changelog. AC2 external sandbox runtime remains unverified without real test credentials; no live funds or fake success. Evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-13/213154-e6691ad6-6412-4133-b985-318d972e2b3e/index.md

Resumed verification confirms required server-side sandbox variables are absent (presence checked only, no secrets printed). Cash and replay proof remains retained. Criterion 2 stays unverified until real STRIPE_TEST_SECRET_KEY, SQUARE_SANDBOX_ACCESS_TOKEN and SQUARE_SANDBOX_LOCATION_ID are supplied through the documented private runtime configuration with explicit sandbox opt-in. No external call, live funds, fake provider success or acceptance-criterion waiver.
<!-- SECTION:NOTES:END -->
