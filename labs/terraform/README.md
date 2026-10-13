# Terraform Cluster

An independent lab in which HashiCorp Terraform manages a three-broker Redpanda cluster, three data volumes, a network, and optional Console. The Docker provider talks to a local rootless Podman API. There is no Compose deployment, cloud account, remote backend, or CI/CD pipeline in this lab.

The purpose is to inspect infrastructure ownership: what a saved plan proposes, what state identifies, how the provider observes drift, and what destroy removes. Terraform state is not a backup of the broker log.

## Run a reviewed plan

From the repository root:

```bash
nix develop --no-update-lock-file
just up terraform
just status terraform
just urls terraform
```

`up` displays the plan and requires you to type the exact project name before applying it. It does not use silent automatic approval. To separate plan and apply:

```bash
just tf plan
just tf show
read -r -p 'SHA256 of the plan you reviewed: ' REVIEWED_SHA256
just tf apply --reviewed "$REVIEWED_SHA256"
just rpk terraform cluster health
```

Apply consumes that exact saved artifact. The wrapper checks its bytes and a fingerprint of configuration, inputs, tool image, and engine context. A changed or stale plan requires a new review. An apply failure may leave partial infrastructure; the wrapper consumes the artifact and does not retry blindly.

The tool is containerized Terraform 1.16.4 with Docker provider 4.6.0. Nix builds the tool image and offline provider mirror; `.terraform.lock.hcl` pins the mirror packages. No host Terraform or provider-registry fallback is used. The wrapper starts its own private Podman API service and stops only that process on exit. It does not require or enable a systemd socket.

Rootless host support and cgroup-v2 memory delegation must work. Allow at least 4 GiB of free RAM plus tool overhead and broker disk space. All thirteen published endpoints bind to loopback. Set the initial `LAB_TF_PORT_BASE` (49152–65520) and `LAB_TF_CONSOLE_ENABLED` before the first plan. Inspection and validation do not freeze these choices. Planning persists them; a successful reviewed destroy releases them only after state and owned resources are empty.

## Observe and repair drift

```bash
just tf drift
just tf plan
just tf show
read -r -p 'SHA256 of the drift plan you reviewed: ' REVIEWED_DRIFT_SHA256
just tf apply --reviewed "$REVIEWED_DRIFT_SHA256"
```

`drift` stops only this project's Console. The provider should observe that it is stopped and plan a `must_run` update, not broker replacement. A later plan should converge to no changes. Terraform reconciles when invoked; it is not an always-running health controller.

## Check and destroy

```bash
just check terraform
just down terraform
just test terraform
```

`check` validates formatting, Terraform configuration, and Bash without creating a cluster. `test` requires empty owned state, provisions a reviewed fixture, writes and reads an RF3 record, checks broker restart persistence, repairs real Console drift, and verifies a reviewed destroy. A failed test retains resources for diagnosis.

`down` displays a destroy plan and requires the project name. **It deletes all three data volumes, including records created outside Terraform.** Shared immutable images and private state/evidence remain; no global pruning occurs.

The Podman socket has the host user's authority. A read-only socket mount does not make API calls read-only. Only the reviewed transient tool receives it; brokers and Console do not. Do not expose it over TCP or point existing state at another engine to bypass an ownership check.

The [full guide](../../docs/labs/terraform.md) covers state paths and overrides, saved-plan verification, partial failure, exact pins, and production state, broker-lifecycle, multi-region, and recovery requirements.
