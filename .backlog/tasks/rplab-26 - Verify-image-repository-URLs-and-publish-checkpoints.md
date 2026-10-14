---
id: RPLAB-26
title: Verify image repository URLs and publish checkpoints
status: Done
assignee: []
created_date: '2026-10-14 02:41'
updated_date: '2026-10-14 17:34'
labels: []
dependencies: []
ordinal: 26000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authorized extended Redpanda release. Original fictional companies, real local workflows, deep tuning research, production blueprints, self-contained Nix ownership and verified publication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Verify canonical vendor image repository URLs and immutable manifest identities, preserving tested versions unless an update is justified.
- [x] #2 Document and verify any first-party image publication; do not present unpublished or untested image URLs as usable.
- [x] #3 Create signed, validated, scoped commits and push verified checkpoints as requested; preserve branch ownership and signatures.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing contracts and relevant specialist guidance; implement within isolated ownership; integrate through the parent; run public workflows and browser checks; retain evidence; commit and publish only verified checkpoints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Canonical registry/digest research and tested AMD64 image identities are retained in the prior release broker-linux and packaging reports. First-party images are documented and observed only as localhost Nix images, not invented public image URLs. Signed 15cbf5b and 5944419 were verified with git verify-commit and pushed to origin/master under the original release authority. Blueprint hosted run 38603615595 succeeded. No ARM runtime or vulnerability audit is claimed.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Verified pinned vendor image identities and local-only first-party image distribution, preserved tested versions and created signed, validated published checkpoints without altering credentials or branch ownership.
<!-- SECTION:FINAL_SUMMARY:END -->
