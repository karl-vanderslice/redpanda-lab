---
id: RPLAB-6
title: Add fx agent messaging lab
status: Done
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 22:54'
labels: []
dependencies: []
ordinal: 6000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Project pins and provides upstream fx with a small local model
- [x] #2 Two separate container agents coordinate through isolated Redpanda
- [x] #3 Real inference, replay, failure states and browser transcript are verified
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement isolated domain lab around an authoritative Redpanda log, pinned Nix container package and explicit replay/effect states. Integrate through shared Bash/Just lifecycle. Verify public workflows and browser surface, then sign and publish.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Delivered genuine vercel-labs/fx 0.0.13 with pinned SmolLM2-135M local inference, separate planner/reviewer container instances, consumed proposal/critique/synthesis, interruption and replay semantics. Final actual E2E and browser observed native three-step completion, distinct instance IDs and stable-result recovery. Tiny-model response quality remains explicitly limited; no fallback text or regeneration on replay.
<!-- SECTION:FINAL_SUMMARY:END -->
