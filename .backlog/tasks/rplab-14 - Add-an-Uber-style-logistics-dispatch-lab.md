---
id: RPLAB-14
title: Add a synthetic logistics dispatch lab
status: Done
assignee:
  - '@omp'
created_date: '2026-10-14 01:27'
updated_date: '2026-10-14 03:05'
labels: []
dependencies: []
ordinal: 14000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Explore driver availability, nearest-driver dispatch, location events and delivery transitions on Redpanda.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Operator web page requests trips, updates synthetic driver locations and progresses dispatch through pickup and completion.
- [x] #2 Real-container E2E proves assignment exclusivity, invalid-transition rejection, cancellation, duplicate handling and replay.
- [x] #3 Walkthrough explains routing rules, synthetic geography and absence of external transport services.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse one ordered event log for driver positions and trip state; dispatch to the nearest available driver with deterministic tie-breaking and enforce state transitions.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real-container E2E passed 20261013T225304-2805232. Browser completed explicit location-gated pickup/dropoff; themes, keyboard, 320px/doubled text, polling focus and denied storage checked. Evidence retained with IoT/POS checkpoint.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented nearest-driver dispatch with deterministic ties, exclusive assignment and immutable logged outcomes. Real HTTP/Kafka/restart and browser checks passed. Geography and drivers are synthetic.
<!-- SECTION:FINAL_SUMMARY:END -->
