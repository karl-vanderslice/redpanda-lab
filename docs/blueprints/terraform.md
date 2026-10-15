---
hide:
  - toc
---

# Foundry Harbor Infrastructure

![Proposed Foundry Harbor Infrastructure system topology](../assets/blueprints/terraform.svg)

A reviewed plan authorizes one apply controller with locked resource state and a pinned provider. Native Redpanda configuration has separate ownership from provisioning. Clients, telemetry and independent broker-data recovery surround a proposed three-zone data plane.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab uses pinned Terraform and Docker provider versions through a selected rootless Podman API, with local external state and exact-plan/configuration gates. Its three development brokers share one host. The proposal adds a real locking/versioned remote state backend and independently placed production brokers.

## Authority and effects

Infrastructure owns plan identity, provider lifecycle and API scope. Treat the mounted Podman socket as broad host-user authority even when it is mounted read-only. Redpanda operations owns topics, security and data-preserving rolling changes. Broker-log backups need their own recovery path alongside replicated infrastructure state, with verified retained data and restore frontiers.

[Lab guide](../labs/terraform.md) · [D2 source](sources/terraform.d2) · [PNG export](../assets/blueprints/terraform.png)
