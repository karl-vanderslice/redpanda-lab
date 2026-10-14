---
hide:
  - toc
---

# Meridian Ledger Alliance

![Proposed Meridian Ledger Alliance system topology](../assets/blueprints/jurisdictions.svg)

Tenant admission routes private writes only to the operator-assigned home. Resident Redpanda consumers export approved cumulative summaries to a separate global cluster. Global views replace only increasing source-offset snapshots; raw records and backup vaults remain resident.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab runs EU, US, APAC and global as four single-broker containers on one host. The proposal adds resident keys, storage, recovery vaults and RF3 across three local zones for each cluster. Geography labels are not proof of legal compliance.

## Authority and effects

Regional owners control home mapping, tenant partitions and local restore. Privacy/legal owns export fields, minimization and cohort review; aggregate counts are not necessarily anonymous. Federation owns offsets and export audit. Do not reroute private writes to another home on failure, mirror raw logs globally, or treat summaries as raw-data backups.

[Lab guide](../labs/jurisdictions.md) · [D2 source](sources/jurisdictions.d2) · [PNG export](../assets/blueprints/jurisdictions.png)
