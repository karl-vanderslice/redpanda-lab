---
hide:
  - toc
---

# Clockwork Correspondence

![Proposed Clockwork Correspondence system topology](../assets/blueprints/agent-chat.svg)

Authenticated schedules and cancellations enter Redpanda. A time/lease owner governs a fenced executor that records exact input before inference. Consumed replies form conversation views; independent recovery retains the scheduling frontier without rerunning unfinished attempts.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab selects due work by instant then ID in one process and resolves eligibility by consumed start/cancel order. The proposal adds authenticated conversation scope, UTC clock policy, lease epochs and durable projections; unlimited lab retention is not independent recovery.

## Authority and effects

Scheduling owns due ordering, cancellation and takeover. The reducer retains only complete successful exchanges in model history; inference owns context/output limits. Privacy owns conversation access and retention. A consumed start is not a delivered reply, and an unknown model attempt must not be automatically retried.

[Lab guide](../labs/agent-chat.md) · [D2 source](sources/agent-chat.d2) · [PNG export](../assets/blueprints/agent-chat.png)
