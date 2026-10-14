# Commonfield Dispatch

A fictional public reading room. Redpanda retains original articles, profiles, follow/like sets, feed preferences and article opens. The logged fixture installs two profiles/articles without interactions.

From the repository root, use the [shared setup](../../README.md), then:

```bash
./labs/run activity up
./labs/run activity urls --json
```

Select/create a public profile, follow an author, choose a feed, publish and open an article. Retrying a read ID does not add an open; a new ID does. Counts describe opens/public profile IDs, not attention or verified people.

[Guide: commands, public identity, receipts, privacy and recovery](../../docs/labs/activity.md). Anyone with access can act as any profile or inspect all events. No authentication, private publishing, deletion or private messaging exists. Use synthetic data. Preserve uncertain ID/payload, inspect the receipt, restart to replay and only then retry exactly. Copy a pending payload before closing if storage is denied.

```bash
./labs/run activity restart app
./labs/run activity logs app
```

`bash labs/activity/e2e.sh` checks public HTTP, broker duplicates and restart replay against a running disposable stack; it does not start or build services. `./labs/run activity down` deletes broker history, not browser state or caches. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) leaves opens and receipts unbounded until disposal.