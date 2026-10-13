---
id: RPLAB-3
title: Polish and publish the initial lab
status: In Progress
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 20:03'
labels: []
dependencies: []
ordinal: 3000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 README gives a runnable Nix quick start and disposable lifecycle
- [x] #2 Zensical explains architecture, options, telemetry and recovery
- [ ] #3 Existing E2E passes and signed initial publication reaches origin/master
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect existing implementation and pins. Add just and Zensical via Nix. Preserve technical facts in structured docs. Run existing E2E and docs/browser smoke, sign and push the initial polished setup.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Initial source/docs checks and full E2E passed, including broker failover and disposal. Browser inspected light/dark, navigation, clipboard, narrow layout and 200% text. Registry manifest digests verified. Preparing signed initial GitHub publication.
<!-- SECTION:NOTES:END -->
