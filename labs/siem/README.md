# Vesper Lantern Networks

A fictional security desk for synthetic authentication and network observations. Redpanda retains telemetry, incident evidence and review receipts; no capture agent, customer traffic or external alert runs.

From the repository root, use the [shared setup](../../README.md), then:

```bash
./labs/run siem up
./labs/run siem urls --json
```

Select **Ingest fixture sequence**, inspect its eight event receipts and two correlation rules, then acknowledge or resolve an incident. The generated timestamps can stay behind wall time after idle to respect the logged advance bound; this is never current telemetry. New evidence reopens resolved incidents.

[Guide: schema, fixed UTC windows, watermark, review API and recovery](../../docs/labs/siem.md). Keep an unresolved command's exact ID/payload, look up its receipt and restart for replay before exact retry. A missing receipt does not prove failed publication. Use synthetic data and run one owner only.

`bash labs/siem/e2e.sh` requires a fresh, empty running stack; it checks receipts and restart replay without building or starting services. `./labs/run siem down` deletes the incident/evidence history. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) retains it until disposal, with unbounded candidate state.