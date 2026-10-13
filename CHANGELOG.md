# Changelog

## Unreleased

- Add separate Rust commodity-exchange, multi-sport streaming, fx agent messaging, scheduled agent chat, and Terraform infrastructure labs.
- Provide a shared `just up LAB` / `just down LAB` interface, per-lab validation and public-workflow E2E checks. Terraform mutations require review of the exact saved plan.
- Package application and model containers with locked Nix inputs. Pin KafkaJS, Rust dependencies, genuine fx releases, the 135M local model, broker images, and the Terraform provider mirror.
- Rewrite all seven READMEs around startup, mechanisms, state ownership, failure handling and limits. Expand the Zensical tree with lab guides, researched fixture boundaries and production recovery considerations.
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

## Initial polish

- Add a Nix-provided Just interface and optional local pre-commit validation.
- Replace the long maintenance-oriented README with a first-event quick start.
- Add a Zensical guide covering experiments, architecture, delivery, telemetry, commands, supply-chain limits, and production recovery.

## Initial explorer

- Add the disposable three-broker Redpanda explorer, Console, Prometheus, Grafana, and real broker-failure E2E coverage.
