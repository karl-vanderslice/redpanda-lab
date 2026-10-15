---
id: RPLAB-34
title: Rename the regional lab to Data sovereignty
status: Done
assignee:
  - '@omp'
created_date: '2026-10-15 16:37'
updated_date: '2026-10-15 17:05'
labels: []
dependencies: []
type: enhancement
ordinal: 34000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Rename the jurisdictions lab to Data sovereignty so the name describes resident raw-data authority, approved summary exports and region-local recovery. Update the public command to sovereignty, source and documentation paths, navigation, UI and checks together. Preserve existing stored topic names, physical resource identity and browser preferences so the naming change does not discard or strand retained data.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The sovereignty command, Nix image attribute, source paths, README, docs navigation, blueprint exports and live UI use consistent Data sovereignty naming; obsolete public command and document paths are removed.
- [x] #2 Existing topic, volume/network/state and browser preference identities are preserved and documented; the renamed command can inspect and recover a pre-rename retained instance without data loss.
- [x] #3 The renamed real regional/federation workflow, public HTTP checks, both-theme/narrow/enlarged browser surface and full project gates pass; signed changes are pushed and the checked Pages deployment is verified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect all current naming consumers and persisted identities. Rename public/source paths and callers in one cutover while keeping stored identifiers stable. Prove retained-instance continuity in an isolated checkout, run the renamed E2E and project gates, inspect UI/docs/blueprints, then publish and verify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renamed all public/source/docs/image callers to sovereignty, preserving stored jurisdictions.* topics, rp-jurisdictions resource identity, port state and browser preference keys. An isolated pre-rename record survived up through the new command on the same port with the original partition 1/offset 0 receipt and identical-ID retry. The browser published a second consumed record. Renamed E2E passed in 74.68s; Prek and full just check passed in 40.10s. Both UI themes, 320px/40px root text, pause/resume and denied storage were exercised; initial duplicate desktop-theme captures were superseded by explicit effective-theme assertions. All 44 docs pages passed 176 browser audits, and the final two guides passed eight more after the last title correction. Two read-only reviewers found only restored executable bits and the corrected code-block title. Fixture disposed. Signed publication and hosted verification remain pending.

Signed implementation 6ad7159934be144d2bcaebbc453febd3d648fdd7 is pushed and remote master matched. Exact-SHA Checks and Pages run 38773056846 passed (check/build 7m30s, publication 32s). The actual hosted renamed guide and blueprint passed eight both-theme/layout audits with zero axe violations; command/title/nav links were correct, SVG/PNG/D2 sources returned 200, and natural-scale modal expansion with settled focus restoration worked. Evidence is retained under registered artifacts 2026-10-15/123847-0b07e008-e617-4e0c-a431-fed4b61b2091. No geography, authorization, compliance or full accessibility claim.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Renamed the public command, Nix image attribute, source/doc paths, navigation, UI and generated blueprint exports to Data sovereignty. Preserved stored topics, physical resource/port identity and browser preference keys; proved retained receipt and exact retry across a same-path upgrade. Renamed regional/federation E2E, public HTTP boundaries, actual browser publication, theme/enlarged-text/storage checks, full gates, signed push and checked hosted deployment passed.
<!-- SECTION:FINAL_SUMMARY:END -->
