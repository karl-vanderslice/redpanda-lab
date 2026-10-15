---
hide:
  - toc
---

# Meridian Ledger Alliance

![Proposed Meridian Ledger Alliance system topology](../assets/blueprints/jurisdictions.svg)

Tenant admission routes private writes only to the operator-assigned home. Resident Redpanda consumers export approved cumulative summaries to a separate global cluster. Global views replace only increasing source-offset snapshots; raw records and backup vaults remain resident.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

Compare resident and global flows locally using EU, US, APAC and global as four single-broker containers on one host. The proposal adds resident keys, storage, recovery vaults and RF3 across three local zones for each cluster. Legal compliance needs its own assessment of that deployment, beyond the geography labels used in the exercise.

## Authority and effects

Regional owners control home mapping, tenant partitions and local restore; federation owns offsets and export audit. Privacy/legal reviews export fields, minimization and cohorts because aggregate counts can still identify people. Keep recovery within those boundaries: do not reroute private writes to another home on failure, mirror raw logs globally, or treat summaries as raw-data backups.

[Lab guide](../labs/jurisdictions.md) · [D2 source](sources/jurisdictions.d2) · [PNG export](../assets/blueprints/jurisdictions.png)
