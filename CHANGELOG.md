# Changelog

## Unreleased

- Add separate Rust commodity-exchange, multi-sport streaming, fx agent messaging, scheduled agent chat, and Terraform infrastructure labs.
- Provide a shared `just up LAB` / `just down LAB` interface, per-lab validation and public-workflow E2E checks. Terraform mutations require review of the exact saved plan.
- Package application and model containers with locked Nix inputs. Pin KafkaJS, Rust dependencies, genuine fx releases, the 135M local model, broker images, and the Terraform provider mirror.
- Rewrite the README and lab guides around startup, state ownership, failure handling and operating limits.
- Keep runtime state, generated media, builds, documentation previews and replayable evidence outside the checkout. Verify project-scoped disposal without pruning shared images.
- Resolve immutable application image identities before Compose startup, so source updates replace containers instead of reusing an old mutable tag.
- Preserve sports pause telemetry across media navigation and reconnect streams after page return. Keep large agent snapshots connected under SSE backpressure.
- Bound fx model generation with a native 220-character ASCII grammar; retain harness errors and truncation as visible failures rather than publishing partial output.
- Match Podman's network and memory defaults in Terraform to produce a convergent plan. Supply a private, task-owned Podman API service rather than requiring an ambient daemon.
- Add the user-selected MIT source license and container notices, preserving hash-pinned model attribution and upstream licenses.
- Use a plain GitHub documentation link without browser-side repository-statistics requests.
- Add an isolated Bitcoin paper trader with attributed historical candles, next-close automatic entries/exits, manual positions, exact satoshi/cent accounting, fees, P&L and broker-validated replay.
- Reset application E2Es to a fresh selected lab before their fixture workflows; keep Terraform's empty-state review boundary.
- Separate unpublished Bitcoin errors from uncertain outcomes, retain original-command recovery and reserve internal quote IDs.
- Persist Terraform port/Console choices at planning, not inspection; release them only after a reviewed, verified empty destroy.
- Keep Zensical theme/search usable when browser storage is denied, with page-local preference state and no storage-policy bypass.
- Add a multi-jurisdiction lab with separate EU, US, APAC and global clusters, deterministic tenant sharding, three-partition regional logs, summary-only federation, an operator web page and real regional/global outage and replay checks.
- Add IoT sensor alerts, POS cash receipts/full refunds with optional Stripe and Square sandbox adapters, and synthetic logistics dispatch.
- Give each first-party app a fictional company and distinct visual identity, with local themes, keyboard controls and enlarged-text reflow.
- Shorten onboarding and lab guides; retain command contracts, replay rules, provider uncertainty and disposal boundaries.
- Add append-only rebuild, SIEM correlation, activity feeds, retail inventory and internal fraud/clearing workflows.
- Publish version-aware tuning guidance and sixteen proposed production blueprints with Redpanda and ancillary infrastructure.
- Build strict Zensical documentation as a self-contained Nix package and add a checked GitHub Actions Pages workflow.
- Activate the explorer's immutable built image ID; pin Node 24.21.0, Prometheus 3.13.4 LTS and Grafana 12.4.13.
- Preserve admitted POS IDs and paused sensor sequence hints. Disable new writes on unavailable observations without discarding the consumed view.
- Keep dispatch map labels readable in a named keyboard-scrollable region rather than shrinking them on narrow screens.
- Settle pending log sends before disconnect. Use the Nix-owned local rootless Podman adapter without a Compose patch.

## Initial polish

- Add a Nix-provided Just interface and optional local pre-commit validation.
- Replace the long maintenance-oriented README with a first-event quick start.
- Add a Zensical guide covering experiments, architecture, delivery, telemetry, commands, supply-chain limits, and production recovery.

## Initial explorer

- Add the disposable three-broker Redpanda explorer, Console, Prometheus, Grafana, and real broker-failure E2E coverage.
