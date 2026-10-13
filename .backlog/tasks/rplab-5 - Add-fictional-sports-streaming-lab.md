---
id: RPLAB-5
title: Add fictional sports streaming lab
status: Done
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 22:24'
labels: []
dependencies: []
ordinal: 5000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Multi-sport web portal plays original local synthetic video
- [x] #2 Scores, subscriptions and viewer telemetry flow through isolated Redpanda
- [x] #3 Fixture research, rights limits, pins and public-workflow checks are documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement isolated domain lab around an authoritative Redpanda log, pinned Nix container package and explicit replay/effect states. Integrate through shared Bash/Just lifecycle. Verify public workflows and browser surface, then sign and publish.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Four sports and five fictional matches use original local decoded MP4s, captions, range requests, consumed score/preference/playback events and replay. Public E2E passed at .cache/redpanda-lab/e2e/sports/20261013T181436-1977491. Native browser playback, navigation/pause telemetry fix, themes, narrow/enlarged-text layout and storage-unavailable theme controls verified. Primary fixture research and rights limits documented.
<!-- SECTION:FINAL_SUMMARY:END -->
