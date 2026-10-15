---
hide:
  - toc
---

# Signal Harbor Works

![Proposed Signal Harbor Works system topology](../assets/blueprints/explorer.svg)

In this proposal, events enter through authenticated admission and a native Kafka producer. Redpanda's six ordered partitions feed a consumer and bounded recent-event view. Alongside that event path, Prometheus collects app and broker metrics for Grafana to query.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab combines producer and consumer in one Node process, uses a fixed group and keeps only 100 recent events. The proposal adds authenticated admission and separate read/operator boundaries; additional consumer replicas require a new assignment/readiness contract.

## Authority and effects

The application owner controls native-client lifetime, partition readiness and event identities. Observability owns metric definitions and dashboards; creation-to-consumption delay includes backlog. The recent-event view helps you inspect delivery. Its synthetic payment labels are sample events with no commerce effects.

After an interruption, the consumer resumes from committed group offsets and may redeliver records. An app restart clears its bounded view and process counters. Rebuilding an event projection requires an explicit offset and retained-range contract: the explorer's six-hour event window can expire records that a rebuild would need.

[Explorer guide](../tutorials/first-event.md) · [D2 source](sources/explorer.d2) · [PNG export](../assets/blueprints/explorer.png)
