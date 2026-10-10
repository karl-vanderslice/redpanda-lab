---
id: RPLAB-2
title: Migrate maintained lab clients and reproducible container dependencies
status: Done
assignee:
  - '@MaintainedLabClients'
created_date: '2026-10-10 19:51'
updated_date: '2026-10-10 21:17'
labels: []
dependencies: []
references:
  - >-
    https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/MIGRATION.md
  - 'https://github.com/prometheus/client_js/blob/v0.16.1/CHANGELOG.md'
  - 'https://github.com/confluentinc/librdkafka/pull/5397'
modified_files:
  - app/server.js
  - app/package.json
  - app/package-lock.json
  - app/Containerfile
  - app/patches/librdkafka-coordinator-lifetime.patch
  - lab
  - tests/e2e.sh
  - README.md
ordinal: 2000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
Disposable-lab review exposed aged client dependencies, npm registry precedence, native container requirements, and cleanup sequencing risks. Preserve the HTTP and telemetry contract while using the maintained client APIs.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Real container workflow preserves idempotent all-replica production, six RF3 partitions, same-key routing, independent committed lag, pause/resume and broker failover
- [x] #2 Exact maintained client versions and public registry lock contain no obsolete client dependencies; native install stays inside the pinned container
- [x] #3 Down disposes project containers, volumes, network and port state even if optional app-image removal fails, reporting that failure without global prune
- [x] #4 README and E2E retain the original oracle and cover consumer-visible migration semantics
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Confirm public npm metadata and official migration APIs; migrate client lifecycle/config and native container install; provide explicit public-registry lock command; fix cleanup sequencing; extend existing E2E and document changes. Parent performs all build/runtime verification.
<!-- SECTION:PLAN:END -->

## Implementation Notes

<!-- SECTION:NOTES:BEGIN -->
Implementation handed to parent for verification. Public npm metadata through the pinned Nix shell selected @confluentinc/kafka-javascript 1.11.0 (2026-10-07) and @prometheus-io/client 0.16.1 (2026-08-27); neither metadata response had a deprecated field. Official migration, admin/consumer/producer sources and Prometheus changelog consulted. ./lab lock initially exposed npm refusing to load /dev/null twice as user/global config; resolved with a project-owned empty user config, and final package-lock-only resolution succeeded using npm 10.9.9. Lock inventory contains only the new clients, with integrity and public registry URLs. No host dependency install, build, test, lint, formatter or live-lab run performed. Container source-builds bundled librdkafka in a digest-pinned Node 22.23.3 Bookworm multi-stage image; apt package versions remain distribution-selected. New E2E coverage preserves the original healthy-cluster equality oracle and adds same-key routing, real paused broker failover, resumed committed lag, recovered health and disposal checks. Run bash tests/e2e.sh at the project root; this builds/runs/disposes the lab and produces the existing external report, now with source hashes. Leave task In Progress and criteria unchecked until parent exercises the full contract.

Parent verification: full real Podman E2E passed, report /home/karl/.cache/redpanda-lab/e2e/20261010T160431-1392892/report.md. Native source build uses CKJS_LINKING=dynamic and Debian libraries. Broker failover reproduced librdkafka coordinator use-after-free; local worker-ownership/destroyed-operation patch based on unmerged upstream PR 5397 fixes it without suppressing assertions. Original healthy consumed==produced oracle retained. Real image-in-use disposal scenario verified down succeeds, removes runtime and saved ports, warns about the optional image, then proof objects were cleaned. Actual frontend produced and consumed a record with correct broker discovery and no page errors. ./lab lock ignored deliberately hostile npm registry/auth overrides without changing lock SHA-256 or creating host node_modules. Syntax checks passed. User selected commit without workstation activation; lab registration delivery, ledger and durable artifacts remain pending activation.
<!-- SECTION:NOTES:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Maintained exact clients, public-only container dependency resolution, verified native failover fix, complete startup health and robust scoped disposal. Runtime, frontend, telemetry, fault and cleanup checks passed. Lab left down.
<!-- SECTION:FINAL_SUMMARY:END -->
