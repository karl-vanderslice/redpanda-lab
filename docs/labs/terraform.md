# Terraform infrastructure lifecycle

HashiCorp Terraform manages a real three-broker cluster through rootless Podman's Docker-compatible Unix API: containers, data volumes, network, image references and optional Console. No Compose ownership, `local-exec`, OpenTofu, cloud credentials or CI/CD. A saved plan authorizes infrastructure changes; Terraform state is **not a streaming-log backup**.

## Topology

```text
Nix-pinned transient Terraform tool (no network)
  /workspace: HCL + provider lock, read-only
  /state: external backend, init data, plans, evidence
  /run/podman.sock: current user's API
             │ kreuzwerker/docker
             ▼
rootless Podman store
  rplab-tf-<checkout-hash>-network
    broker-0 ←── RPC :33145 ──→ broker-1 / broker-2
       │                         │          │
    data volume               volume     volume
       ↑ Kafka :9092 / Admin :9644 / Schema :8081
     Console :8080 (optional, stateless)

host → 127.0.0.1 high ports → external listeners
```

Each broker has a stable map key, named volume, one Seastar core and 1 GiB memory limit (768 MiB Redpanda). Console: 256 MiB; tool: 768 MiB. Allow at least 4 GiB free RAM plus tool overhead and disk. Three brokers on one host demonstrate quorum/placement, not independent failure domains.

Default path-derived base: 49152–64739. Thirteen loopback ports: Kafka +0…2, Admin +3…5, Proxy +6…8, Schema Registry +9…11, Console +12. External Kafka/Proxy advertisements use these loopback addresses; internal clients get `broker-N`. RPC is not published.

## Runtime authority

See [common prerequisites](../reference/commands.md). Rootless Podman needs delegated memory limits (normally cgroup v2), bridge DNS and named volumes. Terraform runs in the pinned image, not host Terraform.

The wrapper starts a project-owned Unix API using Nix Podman and stops only that process on exit. No systemd/`podman.socket`, sudo, global config or prune. `LAB_PODMAN_SOCKET` may select an existing current-user service; the wrapper never stops it.

**The API permits arbitrary execution as its user and access to that user's entire inventory.** Names/labels are ownership aids, not authorization; a read-only socket bind still allows mutating requests. Run only reviewed tool/provider/HCL. Tool has no home/registry credentials/extra sockets/network, read-only root, dropped capabilities and no-new-privileges. SELinux labels are disabled for this tool alone to permit socket access; brokers/Console never receive the socket.

Root, remote-connection overrides, foreign-user sockets and mismatched graphRoot are rejected. A persisted socket/store fingerprint prevents applying state to another engine. Never bypass it with rootful Podman or erase it without establishing ownership.

## Plan

```bash
./labs/terraform/lab plan
./labs/terraform/lab show
```

Fresh default plan: **ten resources** (three brokers, three volumes, network, two image references, Console). Cached layers do not replace state-owned image identity. Review names, IPs/ports, mounts, digests and replacement/deletion actions.

`init` uses only the Nix filesystem mirror/read-only provider lock, with no registry fallback or upgrade. Tool build needs Nix/cache access; uncached immutable broker/Console pulls need registry access. Offline providers do not imply offline cluster deployment.

The wrapper saves binary plan, prints SHA256 and fingerprints HCL, inputs, tool image and engine context. Private state location:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/redpanda-lab/terraform/<checkout-hash>/
  settings.json                 ports, Console setting, identity
  inputs.tfvars.json            effective pinned inputs
  terraform.tfstate             local backend + backups
  data/                         TF_DATA_DIR + mirror links
  apply.tfplan / destroy.tfplan exact review artifacts
  *-plan.json                   digest + context fingerprint
  *.last.tfplan                 consumed diagnostic artifact
  evidence/                     private E2E plan JSON
```

Directory mode 0700; umask 077. `LAB_TF_STATE_DIR` must be external to checkout. `LAB_TF_PORT_BASE=59000` (49152–65520) and `LAB_TF_CONSOLE_ENABLED=false` set **initial** settings. Inspection/validation does not persist defaults; first plan does. Endpoints remain bound to the reviewed target. Port collision fails, never reallocates/retries; only running owned containers may retain their bound ports, not stopped ones. Reviewed destroy clears settings only after state and owned container/volume/network inventory are empty. Backups/evidence remain.

`plan --json` emits safe artifact metadata only; diagnostics go to stderr. `changed:false` means no change, `true` means changes; planning errors exit nonzero. `show --json` reveals sensitive plan content. Keep it private.

## Apply

**Inspect the plan before approving its actual printed hash.**

```bash
read -r -p 'Paste the SHA256 of the plan you reviewed: ' REVIEWED_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_SHA256"
./labs/terraform/lab status
./labs/terraform/lab urls
./labs/terraform/lab rpk cluster info
./labs/terraform/lab rpk cluster health
```

Missing/wrong hash, modified plan, changed inputs/HCL/tool/socket and stale Terraform state are rejected. Apply uses the **saved file**, never a newly generated plan. Interactive `up` displays the plan and requires exact project name, not silent `-auto-approve`.

After apply, bounded checks query all three Admin APIs: three registered nodes, no down nodes, no leaderless/under-replicated partitions, `is_healthy=true`; enabled Console startup must succeed. Terraform dependencies are not continuous health supervision.

Apply error consumes the artifact and retains partial state/resources. Health timeout may follow successful apply. Inspect status, selected logs/private state, then create a fresh plan; no automatic retry, reset, reallocation or global cleanup. Status separates last Terraform exit from current readiness.

## Cluster data

```bash
./labs/terraform/lab rpk topic create terraform.lifecycle.v1 \
  --partitions 1 --replicas 3 --topic-config min.insync.replicas=2
printf '%s\n' '{"event":"infrastructure-reviewed","version":1}' | \
  ./labs/terraform/lab rpk topic produce terraform.lifecycle.v1 \
  --acks=-1 --delivery-timeout 15s --format '%v\n'
./labs/terraform/lab rpk topic consume terraform.lifecycle.v1 \
  --offset start --num 1 --format '%v\n'
```

RF3 places replicas on all brokers; one partition orders records. All-acks/minimum ISR 2 avoids single-replica acknowledgment, but unsafe development fsync/write-cache settings prevent production durability claims.

Docker provider has **no Kafka topic resource**. `rpk` operations are separate application data, not provisioners/state-managed topics. Terraform neither plans topic config nor restores records. A dedicated provider requires separate schema/auth/import/deletion research and pinning.

## Drift

```bash
./labs/terraform/lab plan
./labs/terraform/lab drift
./labs/terraform/lab plan
./labs/terraform/lab show
read -r -p 'Paste the reviewed drift plan SHA256: ' REVIEWED_DRIFT_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_DRIFT_SHA256"
./labs/terraform/lab plan
```

`drift` verifies project/role labels and stops only Console. Provider refresh observes `must_run=false`; reviewed desired `true` starts it. The E2E requires Console-only change and stable broker IDs, then no-change convergence. `restart="no"` keeps stopped-container drift visible. Terraform reconciles only when invoked. Image/command/label changes may be `ForceNew`; inspect replacement plans, not just desired HCL.

## Destroy

**Destroy permanently deletes all three log volumes, including out-of-Terraform topics/records. State backups/plans cannot recover them. Back up valuable data first.**

```bash
./labs/terraform/lab plan --destroy
./labs/terraform/lab show --destroy
read -r -p 'Paste the reviewed destroy plan SHA256: ' REVIEWED_DESTROY_SHA256
./labs/terraform/lab apply --destroy --reviewed "$REVIEWED_DESTROY_SHA256"
```

Interactive `down` also displays a destroy plan and requires project name. Destroy removes owned containers/volumes/network/state image references; `keep_locally=true` retains shared images. Wrapper verifies empty state and project-labelled inventory; no global prune/foreign deletion. Private state/plans/evidence remain for diagnosis; remove per retention policy only after recovery is unnecessary.

## Verification

`./labs/terraform/lab check` runs pinned Terraform formatting/validation and ShellCheck without deployment.

`./labs/terraform/lab test` refuses preexisting nonempty state/owned resources. **Do not start the cluster first.** It reviews ten resources/loopback, applies the exact artifact, checks runtime memory/bindings, RF3 produce/consume, broker restart with volume/record survival, reviewed Console drift repair, no-change convergence, reviewed full destroy, empty inventory/state and closed Admin endpoints. Evidence remains private outside Git. On failure resources stay for diagnosis; cleanup requires a **fresh reviewed destroy plan**.

These checks cover this engine/provider, not rolling upgrades, regional recovery, independent failure domains, capacity, durable storage or all Podman versions.

## Pins

| Component | Pin |
| --- | --- |
| HashiCorp Terraform | 1.16.4, locked `pkgs.terraform`; sole narrow unfree allowance |
| Docker provider | 4.6.0, `pkgs.terraform-providers.kreuzwerker_docker`, Nix source/vendor hashes + `.terraform.lock.hcl` |
| Mirror | `registry.terraform.io/kreuzwerker/docker/4.6.0/linux_{amd64,arm64}`, unpacked Nix store, no fallback |
| Redpanda | `registry-1.docker.io/redpandadata/redpanda:v26.2.4@sha256:c98c2f04a751e6646012cc701bac5183252cee44c88ba1dfa412e4c7124f2e89` |
| Console | `registry-1.docker.io/redpandadata/console:v3.12.0@sha256:9dc0cd55db172c6be9c2ff8a51f33a14395f7675fa7fbc002c277f3b96115c27` |
| Tool | `default.nix`, root `terraform-image`; actual loaded image ID binds review |

Lock `h1:` hashes identify Nix-built **unpacked** x86_64/aarch64 packages, not upstream ZIPs. Derived from cache.nixos.org packages at nixpkgs `e7439b6b14ad3cc35d05608ebca9bce01a25f5f8`. Updates must change both assertions, HCL constraints and both mirror hashes, then review refresh/apply/destroy. Do not mix `init -upgrade`/upstream hashes with this mirror.

OCI pins are multi-architecture manifests. Vendors retain image licensing; Redpanda includes an Enterprise trial, but the lab requires no paid/enterprise feature/account. Review licensing/support before adoption.

## Production boundary

Local Terraform locking plus project host `flock` does not coordinate machines. Remote backends need verified locks, encryption/versioning/access/audit/restore. Stop competing writers and preserve lineage/serial on migration; `force-unlock` requires proven-dead ownership and authorized recovery.

`sensitive=true` hides display, not state/plan values. Keep JSON out of Git/logs/chat; inject least-privilege secrets, not baked credentials. Ephemeral/write-only fields require exact version/workflow support.

Separate plan/review/apply authority; approve digest **and target**, audit intent and reject stale plans. Typed name/hash is not enterprise approval or identity proof, and does not prevent external drift. Review broker membership, replacement/deletion order and volume loss. Rolling changes need maintenance/drain, replica health and version compatibility; deleting a broker map key is not safe scaling. Preserve identity with researched import/migration/moved blocks.

Replace unsafe `dev-container` overprovisioning/fsync bypass/write caching; use supported storage/resources, independent hosts/racks/zones and disk/lag/ISR/recovery monitoring. Loopback/no-auth/plaintext is not production security; require TLS/auth, controlled Admin and isolated automation credentials.

Encrypted state backups restore **infrastructure identity**, not Kafka data. Exercise supported backup/cross-cluster recovery for topics, ACLs/users, schemas, offsets and replay semantics in another environment; define RPO/RTO/access/consistency. Git revert cannot restore volumes.

Moving/cloning checkout changes namespace. Mismatched state override is rejected. Restore same path/engine or deliberately inventory/import/migrate with verified backup; never erase state to suppress ownership errors or overlay a second cluster on existing volumes.

## Primary references

- [Three-broker quickstart](https://docs.redpanda.com/streaming/current/get-started/quick-start/) and [development mode](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-start/).
- [Admin health schema](https://docs.redpanda.com/api/doc/admin/operation/operation-get_cluster_health_overview).
- [Console configuration](https://docs.redpanda.com/streaming/current/console/config/configure-console/), [v3.12.0 routes](https://github.com/redpanda-data/console/blob/v3.12.0/backend/pkg/api/routes.go).
- [Provider container schema](https://github.com/kreuzwerker/terraform-provider-docker/blob/v4.6.0/docs/resources/container.md), [read/update code](https://github.com/kreuzwerker/terraform-provider-docker/blob/v4.6.0/internal/provider/resource_docker_container_funcs.go).
- [Podman API authority](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html).
- Terraform [mirrors](https://developer.hashicorp.com/terraform/cli/config/config-file#filesystem_mirror), [saved apply](https://developer.hashicorp.com/terraform/cli/commands/apply), [locking](https://developer.hashicorp.com/terraform/language/state/locking), [sensitive state](https://developer.hashicorp.com/terraform/language/state/sensitive-data).
- [Pinned provider definitions](https://github.com/NixOS/nixpkgs/blob/e7439b6b14ad3cc35d05608ebca9bce01a25f5f8/pkgs/applications/networking/cluster/terraform-providers/providers.json).
