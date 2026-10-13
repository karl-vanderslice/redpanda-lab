---
id: RPLAB-4
title: Add commodity trading lab
status: Done
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 22:24'
labels: []
dependencies: []
ordinal: 4000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Rust or Java CLI and web order entry use isolated Redpanda
- [x] #2 Matching, partial fills and replay are exercised through public workflows
- [x] #3 Pinned container delivery, lint gates and human documentation exist
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement isolated domain lab around an authoritative Redpanda log, pinned Nix container package and explicit replay/effect states. Integrate through shared Bash/Just lifecycle. Verify public workflows and browser surface, then sign and publish.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Rust CLI and web orders verified through real Redpanda: both-side price/time priority, partial and multi-maker fills, cancellation, stable IDs, durable rejections and exact restart replay. Current packaging E2E passed at .cache/redpanda-lab/e2e/trading/20261013T181404-1971718; browser keyboard order/cancellation, light/dark, narrow and enlarged-text checks passed. Nix/Just gate passed.
<!-- SECTION:FINAL_SUMMARY:END -->
