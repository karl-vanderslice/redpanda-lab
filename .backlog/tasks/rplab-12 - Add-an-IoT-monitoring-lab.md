---
id: RPLAB-12
title: Add an IoT monitoring lab
status: Done
assignee:
  - '@omp'
created_date: '2026-10-14 01:27'
updated_date: '2026-10-14 03:05'
labels: []
dependencies: []
ordinal: 12000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Add a disposable sensor workflow to explore Redpanda ingestion, latest readings and alerts.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 HTTP readings drive durable device telemetry, threshold alerts and device state in the web page.
- [x] #2 Real-container E2E covers stale/duplicate readings, alert changes, replay and disposal.
- [x] #3 README and walkthrough explain commands, boundaries and fixture data.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Reuse the single-broker lifecycle, KafkaJS event log and Nix image builder; use device sequence numbers and a reducer-owned telemetry projection.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Real-container E2E passed 20261013T225239-2801221. Browser exercised alert open/clear, themes, keyboard, 320px/doubled text, polling focus and denied storage. Evidence: /home/karl/Projects/artifacts/redpanda-lab/2026-10-13/213154-e6691ad6-6412-4133-b985-318d972e2b3e/index.md
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Implemented consumer-owned telemetry and inclusive alert transitions with immutable receipts and sequence handling. Real HTTP/Kafka/restart and browser checks passed. No physical-device connector is claimed.
<!-- SECTION:FINAL_SUMMARY:END -->
