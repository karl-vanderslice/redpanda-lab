---
id: RPLAB-8
title: Integrate and publish all application labs
status: Done
assignee: []
created_date: '2026-10-13 19:51'
updated_date: '2026-10-13 23:21'
labels: []
dependencies: []
ordinal: 8000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Requested expansion and GitHub publication of a self-contained educational Redpanda repository. Keep separate labs and real local model inference. CI/CD is out of scope.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 just, Nix and Bash own reproducible tooling and per-lab gates
- [x] #2 Documentation covers supply-chain pins, multi-region ownership and disaster recovery
- [x] #3 All labs and docs pass runtime and browser checks, then signed commits reach origin/master
- [x] #4 Every public-facing README uses direct, technical, understated prose with clear mechanisms, concrete examples, explicit trade-offs, and no slogans or hype.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Implement isolated domain lab around an authoritative Redpanda log, pinned Nix container package and explicit replay/effect states. Integrate through shared Bash/Just lifecycle. Verify public workflows and browser surface, then sign and publish.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
User clarified the desired communication traits, not copied wording. Rewrote all six repository READMEs around behavior, operation, state ownership, and limits.

All seven public-facing READMEs are rewritten, including Bitcoin. Final just check passed all six lab gates and strict Zensical build. Real application E2Es, original explorer failover/telemetry, and Terraform reviewed lifecycle passed. Browser checks found and fixed optional Zensical cache reads that aborted theme/search under denied storage. Artifact retention and signed full publication remain.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Signed feature commit 357f7390395e8b1ebefc92de598a039be13a6814 reached the requested GitHub origin/master after the initial polished a1a6d92 publication. Delivered six separate labs plus the existing explorer, seven human READMEs, full Zensical guides, MIT first-party licensing, immutable input/version pins, and explicit production/recovery limits. Final Nix/Just/Bash gates, prek, all seven real-container workflows and focused browser/recovery checks passed. Retained and hash-verified evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-13/190856-3ea0836a-ec9c-4007-88e6-0b8d03d5a2bd/index.md. All task-owned lab resources were disposed; reusable caches and private Terraform evidence remain outside source.
<!-- SECTION:FINAL_SUMMARY:END -->
