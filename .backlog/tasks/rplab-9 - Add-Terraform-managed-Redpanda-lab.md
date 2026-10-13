---
id: RPLAB-9
title: Add Terraform-managed Redpanda lab
status: To Do
assignee: []
created_date: '2026-10-13 19:53'
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
- [ ] #1 Terraform provisions a real isolated Redpanda cluster through rootless Podman
- [ ] #2 Plan, apply, drift inspection and destroy are documented and exercised
- [ ] #3 Terraform and providers are pinned and no ambient installer or credentials are required
<!-- AC:END -->
