---
hide:
  - toc
---

# Commonfield Dispatch

![Proposed Commonfield Dispatch system topology](../assets/blueprints/activity.svg)

An authenticated command owner records public feed outcomes in Redpanda and serves a bounded projection. Explicit article opens take a separate consent-aware clickstream path into analytics. A privacy owner controls identifiers and downstream expiry.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab stores feed commands and explicit read receipts together in `activity.events.v1`, using public profile IDs that anyone with lab access can select. The proposal adds authentication and separates `activity.clicks.v1` for consent-aware analytics. Splitting reads requires an API/event migration that preserves or explicitly redefines existing receipts and counts.

## Authority and effects

The feed owner preserves exact, unsampled outcomes and keeps publishing public-only. Identity/privacy manages consent, actor scope and deletion across linked stores and backups, while analytics defines deduplication and late-data handling. Read IDs identify recorded interactions; measuring unique people or attention requires additional evidence. Selective erasure also needs its own design, since broker retention removes segments.

Rebuild the feed from its complete ordered outcomes through a captured offset frontier. Restore must preserve original interaction IDs and receipts without publishing new article-open events. Splitting clickstream storage requires a separate checkpoint and privacy-retention policy; deleting the lab's prefix breaks reconstruction.

[Lab guide](../labs/activity.md) · [D2 source](sources/activity.d2) · [PNG export](../assets/blueprints/activity.png)
