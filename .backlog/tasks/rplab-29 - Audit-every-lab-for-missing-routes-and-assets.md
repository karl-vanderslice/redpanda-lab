---
id: RPLAB-29
title: Audit every lab for missing routes and assets
status: In Progress
assignee: []
created_date: '2026-10-14 10:44'
updated_date: '2026-10-14 11:07'
labels: []
dependencies: []
ordinal: 29000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
User requested an explicit all-lab audit of unintended 404s and similar page, static asset, navigation and API failures, plus regular verified signed push checkpoints.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [ ] #1 Exercise every real lab surface, declared navigation, loaded assets and representative read API paths; distinguish intentional missing-route/unknown-ID 404s from broken supported routes.
- [ ] #2 Check actual response status, content type, browser/network errors and supported media/range/download paths, retaining replayable evidence for all sixteen labs and the docs site.
- [ ] #3 Fix supported-path failures, rerun the affected real path and publish verified checkpoints without suppressing errors or resetting unrelated data.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inventory implemented routes and app entrypoints, start isolated source-matched runtimes, crawl supported pages/assets/read APIs, check expected negative paths separately, repair consumer-visible failures and retain/publish real proof.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real source-matched HTTP baseline retained in http-route-baseline.json: explorer Registry and HTTP Proxy roots return 404 while /subjects and /topics return 200; IoT static file-as-directory, decoded NUL and overlong path return 500; malformed receipt escapes in event-log and SIEM and malformed explorer path return 500. Supported asset/HEAD parity and browser-request auditing remain in progress.
<!-- SECTION:NOTES:END -->
