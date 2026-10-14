---
id: RPLAB-29
title: Audit every lab for missing routes and assets
status: Done
assignee: []
created_date: '2026-10-14 10:44'
updated_date: '2026-10-14 17:34'
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
- [x] #1 Exercise every real lab surface, declared navigation, loaded assets and representative read API paths; distinguish intentional missing-route/unknown-ID 404s from broken supported routes.
- [x] #2 Check actual response status, content type, browser/network errors and supported media/range/download paths, retaining replayable evidence for all sixteen labs and the docs site.
- [x] #3 Fix supported-path failures, rerun the affected real path and publish verified checkpoints without suppressing errors or resetting unrelated data.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Inventory implemented routes and app entrypoints, start isolated source-matched runtimes, crawl supported pages/assets/read APIs, check expected negative paths separately, repair consumer-visible failures and retain/publish real proof.

Resumed source-matched browser review found stale sports refresh errors after successful snapshot/SSE recovery. Tag snapshot-read errors with their owner and clear only that owner on a valid snapshot, preserving unknown-operation, media and route errors. Verify the observed failed-before case and operation-error preservation on a fresh immutable fixture.

Source-matched clearing browser review found a stale read-failure notice after recovery and enabled transfer submission during initial loading. Tag read notices by owner, clear only recovered read failures, initialize the existing control gate before the first request and enforce readiness at mutation admission. Preserve pending-command messages and IDs; prove loading, failed-read, recovery and uncertain-command boundaries on a separate fixed fixture.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real source-matched HTTP baseline retained in http-route-baseline.json: explorer Registry and HTTP Proxy roots return 404 while /subjects and /topics return 200; IoT static file-as-directory, decoded NUL and overlong path return 500; malformed receipt escapes in event-log and SIEM and malformed explorer path return 500. Supported asset/HEAD parity and browser-request auditing remain in progress.

The reusable public-workflow HTTP check passed on all fifteen first-party web apps after real failed-before cases. Supported root/static GET and HEAD requests, CSS dependencies, sports deep links, JSON read APIs and expected missing/malformed path responses passed. The deployed Pages crawl passed 102 resources across 43 HTML documents and 939 fragment references at commit 52416cc. Media/range and complete per-app browser coverage remain open. The chat browser reproduced a separate bug: cancelling a real manual refresh by pausing falsely disabled writes as an outage; the owner-invalidation fix is awaiting actual after proof.

The source-matched chat cancellation after case preserved Display paused, aria-pressed=true and enabled conversation creation. Before and after browser artifacts retain the exact real-request delay and pause actions. Full just check passed in 25.39 seconds after the HTTP, cancellation and command-reference changes. Terraform live Console and lifecycle validation is now running in the task-owned empty-state fixture.

Terraform created the reviewed healthy cluster, but the new checker incorrectly required HEAD support from the pinned upstream Console: its root returned 405 rather than 200. This is an unsupported-method boundary, not a broken supported GET page. Owned app HEAD assertions remain strict; the Console branch audits its supported GET page and declared assets. The failed task-owned deployment is retained while its exact saved destroy plan is reviewed before a fresh full lifecycle run.

All sixteen real public workflows passed: thirteen source-8b9 child scenarios, corrected reviewed Terraform lifecycle (80.98s), explorer broker/consumer/Prometheus/Grafana failover (69.68s), and jurisdiction residency/outage/five-field export/replay (64.26s). Exact reports, logs and hashes retained in the registered run. Final native network audit passed on all fifteen first-party apps with no failed supported browser requests or page errors. Native storage-denied keyboard/reload/read APIs passed all fifteen after correcting two harness assumptions, not changing valid APIs or tri-state theme semantics. Independent image review found unreadable SIEM letter-column buttons; fixed the existing flex basis and proved every label word stays whole at 320px/root32. Trading duplicated unit prose fixed and all market selections exercised. All 43 actual docs pages passed 320px/root40 article reflow. Latest full just check passed 24.27s. Production SVG detail review identified six edge labels crossing dashed boundaries; that final legibility correction remains open.

Failing-before sports-browser.json and sports-request-error/recovery.png retain actual failed GET /api/state followed by successful real refresh/SSE with the old error still displayed. No response success was mocked. LSP has no server for this file; inspected local error and render callers. Domain and remaining current browser reviews continue independently.

All fifteen current-source native app loading/empty/error/recovery, keyboard, assets and read APIs verified against retained immutable snapshots. Fixed sports read-error ownership: paused refresh and SSE clear recovered snapshot errors, while an actual aborted watchlist command keeps its exact unconfirmed ID/error after real reads. Fixed clearing first-paint and observed-readiness gates, recovered read-notice ownership and pending-command preservation; delayed app script/state and aborted actual transfer prove the boundaries. Corrected malformed POS synthetic-storage harness evidence is superseded, not an application defect. Sports full/ranged HEAD, standard/suffix/open-ended ranges and malformed/unsatisfiable 416 passed for all four clips. Evidence root /home/karl/Projects/artifacts/redpanda-lab/2026-10-14/164304-ddf0ba84-3a03-41a0-980d-7f9170076b5c. Final full gate through prek passed in 23.98 seconds; UI publication and final public documentation delta remain pending.

Signed 5944419 publishes the verified sports/clearing observation-recovery fixes and guides. Required full hook/gate passed; source-matched failed-before/passing-after browser evidence preserves unknown-command semantics. Changed UIs also passed both themes, keyboard refresh, denied-storage getters and 320px/root32 reflow with current loaded script hashes. Sports expected stream cancellation is retained as requestfailed ERR_ABORTED, not an uncaught page error. Actual published blueprint crawl passed 102 resources, 43 pages and 939 fragments. Docs final publication remains tracked separately by RPLAB-24.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Completed supported route/asset/API/media/download audit and published verified corrections. Retained intentional missing-path and Console unsupported-HEAD boundaries, real media ranges, native browser transitions and source hashes. No prior user data reset or errors suppressed.
<!-- SECTION:FINAL_SUMMARY:END -->
