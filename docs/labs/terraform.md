# Foundry Harbor Infrastructure

Foundry Harbor Infrastructure is a fictional infrastructure review desk. HashiCorp Terraform manages three Redpanda brokers, three named data volumes, a network, immutable image references and optional Console through the current user's rootless Podman Docker-compatible Unix API. There is no Compose owner, cloud account, remote backend, `local-exec`, OpenTofu or CI/CD deployment in this lab. A saved plan authorizes resource changes; state is not a broker-log backup.

## Plan, review and apply

Use the [common prerequisites and command reference](../reference/commands.md), including the Nix environment. Rootless Podman needs working memory delegation, normally cgroup v2, bridge DNS and named volumes. Allow at least 4 GiB free RAM plus tool overhead and broker disk; this is a lab allowance, not a capacity result.

From the repository root, create and inspect a plan before supplying the hash of the artifact you reviewed:

```bash
./labs/terraform/lab plan
./labs/terraform/lab show
read -r -p 'Paste the SHA256 of the plan you reviewed: ' REVIEWED_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_SHA256"
./labs/terraform/lab status
./labs/terraform/lab urls
./labs/terraform/lab rpk cluster info
./labs/terraform/lab rpk cluster health
```

The default fresh plan has ten resources: three brokers, three volumes, one network, two image references and Console. Review names, labels, addresses/ports, mounts, image digests and all replacement/deletion actions. Cached image layers do not replace state-owned image identity. Interactive `up` also displays a plan and requires the exact project name; automation uses saved `plan` and `apply --reviewed`, not silent approval.

The wrapper verifies the saved plan's SHA256 and fingerprints HCL, provider lock, Nix tool definition, image pins, effective inputs, loaded tool image ID and engine context. Missing/wrong hash, changed plan bytes, changed configuration/target and stale Terraform state are rejected. Apply uses that saved binary file, never a new plan generated after approval. Typed hashes/names do not authenticate an enterprise reviewer or stop external drift.

`plan --json` emits artifact metadata with `changed:true` or `false`; diagnostics go to stderr and errors exit nonzero. `show --json` reveals plan values that can be sensitive. Keep plans, state and JSON evidence private, outside Git, logs and chat.

## Actual topology

All brokers run on one host, so three replicas do not provide independent host/rack/zone failure domains. Each stable `broker-N` map key owns a named volume at `/var/lib/redpanda/data`. Brokers have one Seastar core, a 1024 provider-memory setting, 2048 memory-plus-swap setting and `--memory 768M`. Console uses 256/512; the transient Terraform tool uses `--memory 768m`, a 64 MiB temporary filesystem and PID limit 256. Provider memory units are documented in its [4.6.0 schema](https://raw.githubusercontent.com/kreuzwerker/terraform-provider-docker/v4.6.0/docs/resources/container.md); effective rootless limits require runtime inspection.

The path-derived default port base spans 49152–64739. Thirteen fixed loopback ports are reserved: Kafka at +0–2, Admin +3–5, HTTP Proxy +6–8, Schema Registry +9–11, and optional Console +12. Internal clients use `broker-N`; external advertisements use the reviewed loopback ports. Broker RPC on 33145 is internal only. Use `urls --json` rather than hardcoding endpoints.

Brokers have `restart="no"`, 30-second stop/destroy grace and explicit named volumes. Console has 10-second grace and depends on broker resources. Terraform dependencies order creation, not continuous health supervision. Console config is uploaded through the provider API, not bound from a writable host file.

## Socket and owner authority

The wrapper starts a project-owned Unix API service with Nix Podman and stops only the process it started on exit. It does not enable systemd/`podman.socket`, use sudo, alter global configuration or prune. `LAB_PODMAN_SOCKET` can select an existing current-user service; the wrapper does not stop that service.

The socket permits arbitrary execution as its host user and access to that user's entire container inventory. Read-only bind mounting is not a read-only API or an ACL. Names and labels help identify ownership but do not restrict authority. Run only reviewed HCL, tool images and provider code. The tool has no network, host home, registry credentials or extra sockets, a read-only root, dropped capabilities and no-new-privileges. SELinux labels are disabled for this tool alone to allow socket access. Brokers and Console never receive the socket.

Rootful operation, remote connection overrides, foreign-user sockets and mismatched rootless graph roots are rejected. A persisted fingerprint includes user, socket path, graphRoot and runRoot; state cannot silently move to another engine. Do not erase it or use another engine to suppress ownership errors.

## State and supported settings

Private state defaults to:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/redpanda-lab/terraform/<checkout-hash>/
  settings.json                  project, ports and Console selection
  inputs.tfvars.json             effective pinned inputs
  host-fingerprint               rootless store/socket identity
  terraform.tfstate              local backend and backups
  data/                          TF_DATA_DIR and provider mirror links
  apply.tfplan / destroy.tfplan   exact review artifacts
  *-plan.json                     digest and context fingerprint
  *.last.tfplan                   consumed diagnostic artifacts
  last-operation.json            last Terraform exit and observation time
  evidence/                      private E2E plan JSON
```

Directory mode is 0700 with umask 077. `LAB_TF_STATE_DIR` must be outside the checkout. Moving/cloning the checkout changes the project namespace. Restore the original path/engine or deliberately inventory, back up and research import/migration; never erase state and overlay a second cluster on existing volumes.

| Actual wrapper setting | Default and boundary |
| --- | --- |
| `LAB_TF_STATE_DIR` | External path above; same project identity required |
| `LAB_TF_PORT_BASE` | Path-derived base; explicit integer 49152–65520 |
| `LAB_TF_CONSOLE_ENABLED` | `true`; only `true` or `false` |
| `LAB_TF_HEALTH_TIMEOUT` | 120 seconds of wrapper patience |
| `LAB_PODMAN_SOCKET` | Project-private Unix socket unless explicitly supplied |
| `LAB_TERRAFORM_IMAGE` | Normally Nix-built `localhost/redpanda-lab-terraform:tf-1.16.4-docker-4.6.0`; explicit image override's resolved ID binds review |
| `XDG_STATE_HOME`, `XDG_RUNTIME_DIR`, `TMPDIR` | State/runtime path inputs; runtime falls back through `TMPDIR` to `/tmp` |

Port and Console selections persist at first planning, not inspection/validation. Overrides cannot change a live selection. Port collisions fail without reallocation or retry; only running owned containers can retain their bound ports, not stopped ones. A successful reviewed destroy releases settings only after state and owned container/volume/network inventory are empty. Backups and evidence remain.

One wrapper holds host `flock` for up to a 5-second acquisition wait. Terraform also locks its local backend, with `-lock-timeout=5s`; plan/apply use source-fixed `-parallelism=3`. These are not a multi-machine lock service. Tool-owned `TF_DATA_DIR=/state/data`, `TF_IN_AUTOMATION=1`, `TF_INPUT=0`, filesystem-mirror `TF_CLI_CONFIG_FILE` and checkpoint disabling are packaging controls, not broker settings. Do not use `-lock=false` or force-unlock another writer. The [Terraform 1.16-series locking guidance](https://developer.hashicorp.com/terraform/language/state/locking) requires checking backend lock support and owner identity.

## Failure and drift

After apply, bounded checks query all three Admin APIs for three registered nodes, no down nodes, no leaderless/under-replicated partitions and `is_healthy=true`. Enabled Console must pass its startup endpoint. Each Admin request is bounded to 3 seconds and the loop waits 2 seconds between attempts. Increasing `LAB_TF_HEALTH_TIMEOUT` changes patience, not broker durability or supervision.

An apply error consumes the reviewed artifact and leaves partial state/resources. A readiness timeout can occur after successful apply. Inspect `status`, selected container logs and private state, then create and review a fresh plan. There is no blind retry, reset, port reallocation or global cleanup. `status` separates the last Terraform exit from current resource observations.

```bash
./labs/terraform/lab drift
./labs/terraform/lab plan
./labs/terraform/lab show
read -r -p 'Paste the reviewed drift plan SHA256: ' REVIEWED_DRIFT_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_DRIFT_SHA256"
./labs/terraform/lab plan
```

`drift` checks ownership/role labels and stops only Console. Provider refresh observes stopped runtime state; a reviewed plan can restore desired `must_run=true`. `restart="no"` keeps this drift visible. The E2E expects Console-only repair with stable broker IDs, then no-change convergence. Terraform reconciles only when invoked. Image, command or label changes can require replacement; inspect the plan rather than assuming a rolling update. Deleting a broker map key is not safe scaling.

## Application data and durability limits

The Docker provider has no Kafka topic resource. Topic configuration and record operations below are separate application data, not Terraform provisioners or state-managed topics:

```bash
./labs/terraform/lab rpk topic create terraform.lifecycle.v1 \
  --partitions 1 --replicas 3
printf '%s\n' '{"event":"infrastructure-reviewed","version":1}' | \
  ./labs/terraform/lab rpk topic produce terraform.lifecycle.v1 \
  --acks=-1 --delivery-timeout 15s --format '%v\n'
./labs/terraform/lab rpk topic consume terraform.lifecycle.v1 \
  --offset start --num 1 --format '%v\n'
```

RF3 requests placement across the three brokers; one partition orders records. The example does not use `min.insync.replicas`: a local 26.2.4 RF1 probe accepted an all-acknowledgments write even when that compatibility setting requested two. Redpanda's Raft quorum and storage mode determine its guarantees, not an assumed Kafka-style minimum-ISR guard. See [delivery and stable storage](../reference/tuning.md#delivery-is-not-stable-storage).

All brokers use `--mode dev-container`; see [delivery and stable storage](../reference/tuning.md#delivery-is-not-stable-storage). Terraform neither plans topic retention nor restores records. A dedicated topic provider needs separate schema, authentication, import/deletion and pinning review.

## Destroy

Destroy permanently deletes all three named data volumes, including topics and records created outside Terraform. State backups, saved plans and Git revert cannot recover that data. Back up valuable broker data separately before approving destruction.

```bash
./labs/terraform/lab plan --destroy
./labs/terraform/lab show --destroy
read -r -p 'Paste the reviewed destroy plan SHA256: ' REVIEWED_DESTROY_SHA256
./labs/terraform/lab apply --destroy --reviewed "$REVIEWED_DESTROY_SHA256"
```

Interactive `down` also displays the destroy plan and requires the project name. The wrapper verifies empty state and project-labelled inventory. Owned resource/image references are removed; `keep_locally=true` retains shared immutable images. No foreign deletion or global prune runs. Private state, backups and evidence remain for diagnosis; remove them under an appropriate retention policy only when recovery is no longer needed.

## Workload tuning and pins

Measure plan refresh, provider API work and wrapper health waits separately from Kafka ingress. The source-fixed three-way Terraform parallelism is not a Redpanda shard setting. Raising container limits or changing broker membership requires a new reviewed plan and a data-preserving lifecycle, not volume deletion to force convergence. Shared-host memory, swap enforcement, disk pressure and development mode make this a topology experiment; see [broker and Linux tuning](../reference/tuning.md).

| Component | Pin |
| --- | --- |
| HashiCorp Terraform | 1.16.4; locked Nix package, narrow unfree allowance |
| Docker provider | 4.6.0; Nix source/vendor hashes and `.terraform.lock.hcl` |
| Offline provider mirror | `registry.terraform.io/kreuzwerker/docker/4.6.0/linux_{amd64,arm64}` |
| Redpanda | `registry-1.docker.io/redpandadata/redpanda:v26.2.4@sha256:c98c2f04a751e6646012cc701bac5183252cee44c88ba1dfa412e4c7124f2e89` |
| Console | `registry-1.docker.io/redpandadata/console:v3.12.0@sha256:9dc0cd55db172c6be9c2ff8a51f33a14395f7675fa7fbc002c277f3b96115c27` |

`init` uses the Nix filesystem mirror and read-only lock with no provider registry fallback or upgrade. Nix tool builds may need cache/network access, and uncached broker/Console image pulls need registry access. Offline providers do not make initial deployment offline. Lock `h1:` hashes identify Nix-built unpacked x86_64/aarch64 packages, not upstream ZIPs, at nixpkgs `e7439b6b14ad3cc35d05608ebca9bce01a25f5f8`. Updates must align assertions, HCL constraints and both mirror hashes; do not mix upstream hashes or `init -upgrade` with this mirror.

OCI pins identify multi-architecture manifests. HashiCorp Terraform, the provider and image vendors retain their licensing. Redpanda includes an Enterprise trial, but this lab requires no paid/enterprise feature or account. Review current license terms and support before adoption; the license text, not this guide, controls use.

## Proposed production blueprint

[Production blueprint](../blueprints/terraform.md).

Only the local backend, same-user saved-plan review and broad rootless engine socket run here. The proposed plan/review/apply owners approve both artifact and target, while a separately protected encrypted, versioned, locking state backend owns infrastructure identity. Broker operators and backup/recovery owners preserve streaming data and execute replica-aware maintenance; state owners cannot recover a log by restoring Terraform state.

Production needs least-privilege automation, audited approvals, independent failure domains, TLS/auth and controlled Admin access. Replace unsafe development storage settings, review version compatibility and drain/replica health before rolling changes, and research import/migration/moved blocks before changing identity. `sensitive=true` masks display, not state/plan values; inject least-privilege secrets and verify exact support before using ephemeral/write-only fields. Preserve lineage/serial, stop competing writers and prove dead lock ownership before authorized force-unlock.

Exercise broker backup/cross-cluster recovery for topics, ACLs/users, schemas, offsets and replay semantics separately from encrypted state restore. Define RPO/RTO, access and consistency; one-host restart is not regional recovery. See [production and disaster recovery](../explanation/production.md).

## Available checks

`./labs/terraform/lab check` performs pinned Terraform formatting/validation and ShellCheck without deploying. `./labs/terraform/lab test` requires empty owned state and resources with Console enabled; do not start the cluster first. It checks reviewed ten-resource plans, loopback bindings, resource settings, RF3 produce/consume, broker restart/volume survival, Console-only drift repair, no-change convergence and reviewed full destroy with closed Admin endpoints. Failure retains resources and private evidence; cleanup requires a fresh reviewed destroy plan. They do not establish rolling-upgrade safety, regional recovery, storage durability, capacity or compatibility with every Podman version.
