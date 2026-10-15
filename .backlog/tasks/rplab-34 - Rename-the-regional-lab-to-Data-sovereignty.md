---
id: RPLAB-34
title: Rename the regional lab to Data sovereignty
status: In Progress
assignee:
  - '@omp'
created_date: '2026-10-15 16:37'
updated_date: '2026-10-15 16:55'
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
- [ ] #3 The renamed real regional/federation workflow, public HTTP checks, both-theme/narrow/enlarged browser surface and full project gates pass; signed changes are pushed and the checked Pages deployment is verified.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inspect all current naming consumers and persisted identities. Rename public/source paths and callers in one cutover while keeping stored identifiers stable. Prove retained-instance continuity in an isolated checkout, run the renamed E2E and project gates, inspect UI/docs/blueprints, then publish and verify.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Renamed all public/source/docs/image callers to sovereignty, preserving stored jurisdictions.* topics, rp-jurisdictions resource identity, port state and browser preference keys. An isolated pre-rename record survived up through the new command on the same port with the original partition 1/offset 0 receipt and identical-ID retry. The browser published a second consumed record. Renamed E2E passed in 74.68s; Prek and full just check passed in 40.10s. Both UI themes, 320px/40px root text, pause/resume and denied storage were exercised; initial duplicate desktop-theme captures were superseded by explicit effective-theme assertions. All 44 docs pages passed 176 browser audits, and the final two guides passed eight more after the last title correction. Two read-only reviewers found only restored executable bits and the corrected code-block title. Fixture disposed. Signed publication and hosted verification remain pending.
<!-- SECTION:NOTES:END -->
