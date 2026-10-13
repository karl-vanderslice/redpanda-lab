---
id: RPLAB-9
title: Add Terraform-managed Redpanda lab
status: Done
assignee: []
created_date: '2026-10-13 19:53'
updated_date: '2026-10-13 22:24'
labels: []
dependencies: []
ordinal: 9000
---

## Description

<!-- SECTION:DESCRIPTION:BEGIN -->
The user additionally requests a separate lab that provisions and manages the Redpanda cluster through Terraform, with pinned Nix tooling and rootless Podman delivery.
<!-- SECTION:DESCRIPTION:END -->

## Acceptance Criteria
<!-- AC:BEGIN -->
- [x] #1 Terraform provisions a real isolated Redpanda cluster through rootless Podman
- [x] #2 Plan, apply, drift inspection and destroy are documented and exercised
- [x] #3 Terraform and providers are pinned and no ambient installer or credentials are required
<!-- AC:END -->

## Implementation Plan

<!-- SECTION:PLAN:BEGIN -->
Use pinned HashiCorp Terraform and Docker provider in a Nix-built container over rootless Podman socket. Store state/plans outside checkout, review saved plans, apply health/drift/reconcile/destroy and retain evidence.
<!-- SECTION:PLAN:END -->

## Final Summary

<!-- SECTION:FINAL_SUMMARY:BEGIN -->
Pinned Terraform 1.16.4 and Docker provider 4.6.0 with offline mirror provision real Podman resources. Full reviewed plan/apply, RF3 persistence, convergent drift, Console-only drift/reconcile and reviewed destroy passed at .cache/redpanda-lab/e2e/terraform/20261013T165221-1779443. Actual Console showed 3/3 healthy brokers. State/resources empty after disposal; private owned API service replaces ambient daemon. Final image configuration validation passed.
<!-- SECTION:FINAL_SUMMARY:END -->
