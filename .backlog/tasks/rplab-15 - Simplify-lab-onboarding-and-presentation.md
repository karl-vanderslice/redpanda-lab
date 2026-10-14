---
id: RPLAB-15
title: Simplify lab onboarding and presentation
status: Done
assignee:
  - '@omp'
created_date: '2026-10-14 01:27'
updated_date: '2026-10-14 03:05'
labels: []
dependencies: []
ordinal: 15000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The growing lab collection needs a shorter README and cleaner layouts so users can choose and run an experiment quickly.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README leads with quick start and a concise lab chooser, preserving disposal and production warnings.
- [x] #2 All three labs work through existing lifecycle/check commands and appear in Zensical navigation.
- [x] #3 New pages and documentation are checked in light/dark modes, narrow layout, keyboard and enlarged text.
- [x] #4 Existing documentation uses sparse, direct technical prose, preserving commands, state rules, safety and recovery facts without repeated narration.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Own shared new-lab browser assets and root integration; reduce README repetition and move domain detail into walkthroughs. Verify real services and browser surfaces, retain replayable evidence.

User priority update: compress existing domain and core guides into sparse direct technical prose; preserve exact API/recovery/safety facts and update affected anchors. Parent applies reviewed prose replacements without touching old task worktrees.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Three new labs run through common lifecycle/test discovery. Root check and strict docs passed; browser checked real pages and docs in light/dark, native keyboard, search, section links, narrow and doubled-root-text layouts. Fixed observed grid overflow and removed remote Mermaid dependency. Evidence index retained.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Shortened onboarding and existing guides while preserving state/recovery/safety contracts. Shared accessible theme and form layout serve the three added labs. Further comprehensive rebranding, research and Pages are separately tracked in RPLAB21-27.
<!-- SECTION:FINAL_SUMMARY:END -->
