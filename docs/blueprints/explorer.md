---
hide:
  - toc
---

# Signal Harbor Works

![Proposed Signal Harbor Works system topology](../assets/blueprints/explorer.svg)

Authenticated admission feeds a native Kafka producer. Redpanda carries six ordered partitions to a consumer and bounded recent-event view. App and broker metrics reach Prometheus; Grafana queries that metric store, not Kafka.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab combines producer and consumer in one Node process, uses a fixed group and keeps only 100 recent events. The proposal adds authenticated admission and separate read/operator boundaries; additional consumer replicas require a new assignment/readiness contract.

## Authority and effects

The application owner controls native-client lifetime, partition readiness and event identities. Observability owns metric definitions and dashboards; creation-to-consumption delay includes backlog. The view is not a business ledger, and synthetic payment labels produce no commerce effects.

The consumer resumes from committed group offsets and can redeliver records after interruption. Restarting the app resets its bounded view and process counters; it does not reconstruct a business ledger. Rebuilding a projection requires an explicit offset and retained-range contract because the explorer topic expires records after six hours.

[Explorer guide](../tutorials/first-event.md) · [D2 source](sources/explorer.d2) · [PNG export](../assets/blueprints/explorer.png)
