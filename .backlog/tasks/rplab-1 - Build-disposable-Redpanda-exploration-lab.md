---
id: RPLAB-1
title: Build disposable Redpanda exploration lab
status: Done
assignee: []
created_date: '2026-10-10 19:18'
updated_date: '2026-10-10 19:41'
labels: []
dependencies: []
ordinal: 1000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
A local container lab for learning real Kafka production, consumption, lag and broker telemetry without persistent infrastructure.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 One entrypoint starts the Podman stack and tears down its containers, network and data.
- [x] #2 A browser can produce records, observe consumed records, generate traffic and pause consumption.
- [x] #3 Redpanda Console and provisioned Grafana show real broker and application telemetry.
- [x] #4 Pinned Nix tools and documented E2E checks exercise startup, messaging and disposal.
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use three rootless Redpanda brokers, six-partition replicated lab.events topic, KafkaJS backend with bounded load generation and pause/resume consumer, a static browser frontend, Redpanda Console, Prometheus and provisioned Grafana. Pin tools with a flake and dependencies with npm lock. Publish loopback high ports through one ./lab lifecycle entrypoint; delete only project-owned volumes on down. Verify browser workflows, lag recovery, metrics and teardown against real containers.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Verified: tests/e2e.sh 26/26 PASS (report ~/.cache/redpanda-lab/e2e/20261010T154040-1216406). Browser pass: invalid JSON blocked with no POST, produce/consume, pause+generator lag 199 then drain to 0, 320px no overflow, Grafana clean. Broker loss: graceful stop 24/24 produce 201; podman kill 30/30 201 (one ~5s failover), consumer at-least-once redelivery observed. Fixed: lifecycle lock leaked to conmon, KafkaJS retry budget shorter than failover, Grafana preinstalled plugin error. Images pinned to explicit registries because host docker.io mirror 404s; app/.npmrc pins public npm.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Disposable rootless Podman Redpanda lab: 3 brokers, KafkaJS web app (produce, generator, shared consumer pause/resume, committed lag), Console, Prometheus with 3 alerts, provisioned Grafana. ./lab up/down entrypoint via pinned flake shell; tests/e2e.sh covers lifecycle, messaging, telemetry and leftover-free teardown. Risk: KafkaJS is unmaintained and prom-client is deprecated upstream; anonymous Docker Hub pulls are rate-limited.
<!-- SECTION:FINAL_SUMMARY:END -->
