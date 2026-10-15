# Redpanda lab

Read [README.md](./README.md), the affected lab guide in `docs/labs/`, and its implementation before changing a workflow. Track implementation in the existing `.backlog/` with prefix `RPLAB`.

## Commands

Use the locked Nix environment. It supplies tools, not the host's rootless Podman configuration.

```bash
nix develop --no-update-lock-file
just check
just up LAB
just urls LAB
just test LAB
just down LAB
just docs
just docs-serve
```

`LAB` defaults to `explorer` where documented. `just check` defaults to all source, packaging and documentation gates. `just test LAB` and `just down LAB` delete the selected lab's data. Run destructive tests from an isolated checkout path, not against an existing user's volumes. Resource namespaces depend on the physical checkout path.

## Source owners

| Area | Owner |
| --- | --- |
| Explorer and telemetry | `app/`, `compose.yml`, `lab` |
| Domain lifecycle and shared log | `labs/run`, `labs/common/`, each lab's model/server/public files |
| Regional federation | `labs/sovereignty/lab` and its application |
| Reviewed infrastructure changes | `labs/terraform/lab` and its HCL/provider lock |
| Tools and images | `flake.nix`, `nix/`, per-lab Nix definitions and dependency locks |
| Checks | `scripts/check`, called by Just, `.pre-commit-config.yaml` and CI |
| Documentation | `docs/`, `zensical.toml`, `scripts/docs`, the Nix documentation package |
| Blueprint generation | `docs/blueprints/sources/`, `docs/blueprints/profiles/`, `scripts/diagrams` |
| Pages publication | `.github/workflows/pages.yml` |

Extend these owners rather than adding competing checkers or wrappers. Bash must pass the existing style-level ShellCheck gate, including sourced helpers. Do not replace pinned tools with registry installers. Review the [supply-chain boundaries](docs/reference/supply-chain.md) before changing image pins or removing the native lifetime patch.

## State and effects

- Use local rootless Podman through the existing lifecycle wrappers. No rootful fallback, remote engine, global prune or host tuning.
- Preserve each lab's ordering, full-prefix replay and uncertain-outcome contract. A timeout or missing receipt does not prove a write failed. Keep the original command ID and payload.
- Preserve browser preference and pending-operation keys. Styling must not change command data or recovery semantics.
- Terraform applies only the exact saved, reviewed plan. Its state, socket and plans stay private and outside Git. Never bypass its ownership or fingerprint checks.
- POS provider calls are sandbox-only. Cash workflows are not evidence that credential-dependent provider paths work. Keep credentials out of images, Nix expressions, logs and artifacts.
- Keep disposable outputs outside the checkout. Back up retained telemetry before an upgrade; `down` is disposal, not rollback.

## Documentation and verification

Use fictional companies for first-party labs. Keep actual technology, integration and license identifiers accurate. Write short, direct documentation about behavior and limits, not the task or editing process. Production blueprints are proposals, not deployed infrastructure. Generate their exports; do not hand-edit SVG/PNG output.

Keep `docs-theme/main.html` and the local UI adapters scoped to the pinned Zensical compatibility needs. Recheck theme initialization, search and keyboard behavior before removing them. Documentation previews use staged snapshots; restart the preview after source changes.

Before a checkpoint, run `just check` and exercise the changed public workflow. Common runtime changes need all affected lab E2Es. For web changes, inspect the real page in both themes, with keyboard controls, denied storage, narrow layout and enlarged text. Verify pause, stale observations and uncertain-command recovery when affected. Tests or package evaluation alone are not runtime evidence.

Retain replayable evidence outside Git and record actual checks and material limits. Keep source, guide, blueprint and Backlog changes together. Use signed Conventional Commits; push or activate only with the task's explicit authority. Pages must deploy the checked Nix-built documentation artifact, not an unverified local preview.
