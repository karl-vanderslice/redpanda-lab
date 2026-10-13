---
id: RPLAB-7
title: Add scheduled web agent chat lab
status: Done
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 22:24'
labels: []
dependencies: []
ordinal: 7000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Web chat uses local inference and Redpanda message history
- [x] #2 Redpanda-backed scheduling supports execution and cancellation across restart
- [x] #3 Pinned containers, browser workflows and public checks are documented
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement isolated domain lab around an authoritative Redpanda log, pinned Nix container package and explicit replay/effect states. Integrate through shared Bash/Just lifecycle. Verify public workflows and browser surface, then sign and publish.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Real local model chat, future due-time execution, pending cancellation and restart replay passed public E2E at .cache/redpanda-lab/e2e/agent-chat/20261013T181506-1981038. Browser immediate/scheduled conversation and cancellation with zero cancelled attempts verified; keyboard themes, narrow/enlarged text and storage-unavailable controls checked. No cloud provider, retries of interrupted running inference or host model installation.
<!-- SECTION:FINAL_SUMMARY:END -->
