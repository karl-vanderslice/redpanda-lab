---
id: RPLAB-25
title: 'Tighten repository, Bash checks and patch ownership'
status: Done
assignee: []
created_date: '2026-10-14 02:41'
updated_date: '2026-10-14 17:24'
labels: []
dependencies: []
ordinal: 25000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Authorized extended Redpanda release. Original fictional companies, real local workflows, deep tuning research, production blueprints, self-contained Nix ownership and verified publication.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 All shell sources use reviewed Bash behavior, pass ShellCheck and have one Nix-owned validation/formatting/hook path reused by CI and docs.
- [x] #2 Audit every existing patch and packaging exception; remove superseded paths only with upstream/runtime evidence, retain justified fixes with provenance.
- [x] #3 Remove dead weight and duplicated configuration without touching unrelated data; preserve self-contained execution and external caches.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing contracts and relevant specialist guidance; implement within isolated ownership; integrate through the parent; run public workflows and browser checks; retain evidence; commit and publish only verified checkpoints.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
scripts/check remains the single Nix-owned gate used by Just, hooks and CI. Full gates and required hook passed, latest 23.98 seconds. Packaging/patch audit retained in the prior release research/packaging; native coordinator lifetime patch and tiny early-storage theme hook preserved with provenance. Separate Routed Gothic package and all old consumers removed in signed 15cbf5b; matching bundled-font notice and offline exports verified. External caches retained; no unrelated data cleanup.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed source/style/package/documentation gate ownership and evidence-backed patch review. Removed superseded font packaging while retaining required native lifetime and theme/storage compatibility boundaries.
<!-- SECTION:FINAL_SUMMARY:END -->
