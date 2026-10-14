---
hide:
  - toc
---

# Commonfield Dispatch

![Proposed Commonfield Dispatch system topology](../assets/blueprints/activity.svg)

An authenticated command owner records public feed outcomes in Redpanda and serves a bounded projection. Explicit article opens take a separate consent-aware clickstream path into analytics. A privacy owner controls identifiers and downstream expiry.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab stores feed commands and explicit read receipts together in activity.events.v1; profile IDs are not authentication. The proposal separates activity.clicks.v1 and consent-aware analytics. Splitting reads requires an API/event migration that preserves or explicitly redefines existing receipts and counts.

## Authority and effects

The feed owner keeps exact unsampled outcomes and public-only publishing. Identity/privacy owns consent, actor scope and deletion across linked stores and backups. Analytics owns dedupe and late-data definitions; new read IDs do not prove unique people or attention. Broker segment retention is not selective record erasure.

[Lab guide](../labs/activity.md) · [D2 source](sources/activity.d2) · [PNG export](../assets/blueprints/activity.png)
