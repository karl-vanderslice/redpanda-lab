---
hide:
  - toc
---

# Northbridge Ledgerworks

![Proposed Northbridge Ledgerworks system topology](../assets/blueprints/clearing.svg)

Authenticated transfer and human review reach a fenced obligation authority using versioned risk/time policy. Consumed Redpanda outcomes reserve funds and apply internal paired entries. A clearing worker authorizes a bank instruction only after its own consumed outcome; external settlement evidence remains separate.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab screens fixture rules using client-supplied monotonic decisionAt and records conserved exact-cent internal clearing. Reviewer text is not authenticated identity; there is no bank adapter. The proposal adds approved identity/time policy and external observations, requiring an explicit schema migration.

## Authority and effects

The domain owner serializes screening, review and clearing against consumed reservations. Risk/identity owns policy versions and reviewer permissions. Banking owns stable effect IDs, original-identity lookup and uncertainty before an adapter is introduced. Internal cleared is not externally settled; Kafka and a bank do not share an atomic transaction, and replay must not resend instructions.

[Lab guide](../labs/clearing.md) · [D2 source](sources/clearing.d2) · [PNG export](../assets/blueprints/clearing.png)
