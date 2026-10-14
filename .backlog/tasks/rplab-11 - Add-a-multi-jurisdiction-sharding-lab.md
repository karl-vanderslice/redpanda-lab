---
id: RPLAB-11
title: Add a multi-jurisdiction sharding lab
status: Done
assignee:
  - '@omp'
created_date: '2026-10-14 00:48'
updated_date: '2026-10-14 01:07'
labels: []
dependencies: []
ordinal: 11000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Demonstrate how jurisdiction boundaries differ from Kafka partitions, and how a global view can operate without copying regional raw records. Keep the experiment disposable and local.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 The existing lifecycle starts and disposes separate EU, US, APAC and global clusters with region-local three-partition topics and deterministic tenant placement.
- [x] #2 Real workflows verify home-region enforcement, shard ordering, summary-only federation, duplicate handling, replay and a regional outage without cross-region failover.
- [x] #3 README and Zensical explain the runnable lab, architecture choices, options and limits; source and browser checks pass.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use the existing Nix Node image builder and KafkaJS lock. Add a dedicated multi-region Compose lifecycle, regional log projections, explicit allowlisted aggregate snapshots to a global cluster, an operator web page, and a real E2E through the existing runner. Fixed synthetic tenant residency is server-owned. Local regional writes do not depend on global federation.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified final-source real-container E2E (exit 0, 14 records, 2520 units): deterministic home placement and three-partition logs, broker raw-record checks, duplicate/conflicting/concurrent IDs, wrong-region/origin rejection, summary-only global records, regional outage isolation, global export outage/catch-up, regional/global replay and scoped disposal. All-lab just check passed, including Terraform validation and strict docs. Browser verified EU/APAC publication, disclosure/focus preservation across refresh, light/dark persistence, keyboard controls, denied storage, narrow layout and 200% font reflow; docs diagram, search and anchors rendered. Retained source, failure/success reports and screenshots: /home/karl/Projects/artifacts/redpanda-lab/2026-10-13/210409-e3ee350d-7400-4119-8f96-3559182924ed/index.md.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Added a disposable jurisdictions lab through the existing Nix/Just lifecycle, with separate EU/US/APAC raw clusters and a global aggregate cluster, fixed synthetic tenant residency, deterministic partitioning, asynchronous allowlisted snapshots, an operator page, E2E scenarios and integrated README/Zensical guidance. Verified real routing, isolation, export boundaries, concurrency, outages and replay, plus all source/docs checks and browser interactions. Same-host simulation only, not compliance, geographic resilience or DR. Task-owned services disposed; no commit or push.
<!-- SECTION:FINAL_SUMMARY:END -->
