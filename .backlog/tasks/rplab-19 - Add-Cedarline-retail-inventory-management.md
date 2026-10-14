---
id: RPLAB-19
title: Add Cedarline retail inventory management
status: In Progress
assignee: []
created_date: '2026-10-14 02:41'
updated_date: '2026-10-14 05:23'
labels: []
dependencies: []
ordinal: 19000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authorized extended Redpanda release. Original fictional companies, real local workflows, deep tuning research, production blueprints, self-contained Nix ownership and verified publication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Receipts, reservations, release/fulfillment and transfers update exact integer inventory through an authoritative Redpanda ledger.
- [x] #2 Overselling, duplicate/conflicting IDs, concurrent reservations, invalid transitions, conservation and replay have real-container evidence.
- [ ] #3 Original warehouse UI, fictional products, sparse guide, tuning research and production blueprint.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing contracts and relevant specialist guidance; implement within isolated ownership; integrate through the parent; run public workflows and browser checks; retain evidence; commit and publish only verified checkpoints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real receive/reserve/release/fulfill/transfer/oversell/conflict/concurrency/conservation/replay E2E passed. Browser received five field-tote units, reserved two and fulfilled the reservation; north stock moved 12 to 17 to 15 with reservations released and global stock 23. Exact E2E request/report/log evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-13/213154-e6691ad6-6412-4133-b985-318d972e2b3e/expanded-workflows/inventory. Byte-identical copies verified. Criterion 3, final book-brand/docs/blueprint/browser integration and regression gates remain open.
<!-- SECTION:NOTES:END -->
