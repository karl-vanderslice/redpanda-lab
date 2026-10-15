# Data sovereignty: Meridian Ledger Alliance

A fictional data sovereignty desk. Three resident EU/US/APAC raw logs feed a fourth allowlisted summary log. Explore how home-region authority, approved exports and local recovery fit together. Four RF1 brokers run on one host; region labels do not establish geographic isolation, compliance, tenant authorization or disaster recovery. Use synthetic records only.

From the repository root, use the [common prerequisites](../../docs/reference/commands.md):

```bash
./labs/run sovereignty up
./labs/run sovereignty urls
./labs/run sovereignty outage eu
./labs/run sovereignty recover eu
```

The [scenario guide](../../docs/labs/sovereignty.md) describes fixture residency, fixed tenant hashing, exact raw/export fields, synthetic units, receipts, global outages, replay, tuning and the proposed production blueprint. Home-region outage never reroutes private writes. Summaries cannot recover lost resident raw data. The operator gateway can inspect private fixtures and is not tenant access control.

```bash
just check sovereignty
just test sovereignty
./labs/run sovereignty down
```

`test` deletes existing history before its fresh workflow; `down` deletes all four broker volumes. The [specialized topic policy](../../docs/reference/tuning.md#topic-policy) retains replay history until disposal but does not reconcile existing-topic settings. After acknowledgment uncertainty, keep the original ID/input and inspect its home operation before retrying. Copy unresolved IDs before reloading the browser.

The command is `sovereignty`; stored `jurisdictions.*.v1` topics and the `rp-jurisdictions-*` resource namespace retain their original identifiers. The renamed wrapper uses the same checkout-derived identity and port state, so retained records remain available without a reset.

Node, KafkaJS and Redpanda retain their upstream licensing. No privacy or compliance certification is claimed.
