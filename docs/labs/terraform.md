# Terraform: make the infrastructure the lesson

This lab is intentionally separate from the application labs. Those labs demonstrate event-driven applications; this one teaches **who owns infrastructure, how a saved plan becomes an authorized change, and why infrastructure state is not a backup of a streaming log**.

Terraform provisions and manages a real three-broker Redpanda cluster through rootless Podman's Docker-compatible Unix API. The configuration owns broker containers, persistent volumes, a bridge network, image references and an optional Console container. No Compose runner creates these resources. There are no `local-exec` provisioners pretending that shell commands are declarative resources, no OpenTofu, no cloud credentials and no CI/CD pipeline.

## Shape of the system

```text
Nix-pinned Terraform tool (transient, no network)
  /workspace: checked-in HCL + provider lock, read-only
  /state: private external backend, init data, saved plans, evidence
  /run/podman.sock: current user's Unix API, no TCP exposure
          |
          | kreuzwerker/docker: inspect/create/update/delete
          v
rootless Podman store for this user
  rplab-tf-<checkout-hash>-network
    broker-0 <---- internal RPC :33145 ----> broker-1 / broker-2
       |                  |                    |
    data volume        data volume          data volume
       ^
       | Kafka :9092 / Admin :9644 / Schema :8081
     Console :8080 (stateless, optional)

host clients -> 127.0.0.1 high ports -> external listeners
```

Each broker gets a stable Terraform map key, a named data volume, one Seastar core and a 1 GiB container memory limit (768 MiB Redpanda allocation). The three brokers are on one machine: this demonstrates quorum and replica placement, **not three independent failure domains**. Console has a 256 MiB limit. Terraform's transient tool has a 768 MiB limit. Have at least 4 GiB free RAM plus tool overhead and adequate local disk.

The default path-derived port base is 49152–64739. Thirteen ports are reserved: Kafka base +0…2, Admin +3…5, HTTP Proxy +6…8, Schema Registry +9…11, Console +12. Everything is published on `127.0.0.1`, never all host interfaces. Kafka and Proxy external advertisements use the same host loopback endpoints; internal clients receive the `broker-N` aliases. Internal RPC is not published.

## 1. Select the runtime and understand its authority

Enter the repository's pinned environment:

```bash
nix develop
./labs/terraform/lab urls
```

The host's rootless Podman supplies the engine because subordinate ID helpers and cgroup delegation are host responsibilities. The lab uses actual HashiCorp Terraform **inside the Nix-built tool image**, not an arbitrary host installation. Rootless Podman must support memory limits (normally cgroup v2 with user delegation), DNS on bridge networks and named volumes.

The wrapper starts a private project-owned API service with Nix's Podman, waits for its Unix socket, and stops only that process at command exit. It does not need or enable `podman.socket`, systemd or a host-installed Terraform. `LAB_PODMAN_SOCKET` may select an existing current-user socket; that externally owned service is never stopped by the lab. No global configuration, sudo or engine prune is used.

**Socket authority is broad.** Podman's API permits arbitrary code execution as the user running the service and management of that user's entire inventory. Resource names and labels help ownership and teardown; they are not authorization. A read-only bind of a Unix socket does not make API requests read-only. Run only the reviewed tool/provider/configuration. The tool receives no host home, registry credentials or additional sockets, runs with a read-only root filesystem, dropped capabilities, no-new-privileges and no container network. SELinux labeling is disabled for this tool alone as Podman's socket-in-container guidance requires; the socket is never passed to brokers or Console.

The wrapper rejects root, remote connection environment overrides, a socket owned by another user and a socket whose graphRoot differs from local rootless Podman. It persists a socket/store fingerprint to prevent applying existing state against a different engine. Never work around that guard with a rootful socket or by deleting the fingerprint without establishing resource ownership.

## 2. Plan first; a plan is not a deployment

```bash
./labs/terraform/lab plan
```

On a fresh project, expect **ten managed resources**: three brokers, three data volumes, one network, two image references and one Console. Image references can reuse immutable layers already in the user's store. Terraform must still record their identity in this state. Read the plan, especially the full object names, published IPs/ports, mount targets, image digests and deletion/replacement actions.

`init` uses only the Nix-built provider filesystem mirror and a read-only lockfile. There is no direct-registry installation fallback and no provider upgrade. Nix/source-cache access is needed to build the tool; the host engine needs registry access for the immutable broker/Console image pulls unless already cached. **Offline provider installation is not a claim that an uncached cluster can deploy without downloading images.**

The wrapper saves an exact binary plan, prints its SHA256 and stores a fingerprint of configuration, inputs, tool image and engine context. The plan, backend, `.terraform` init data and evidence all live outside the checkout in:

```text
${XDG_STATE_HOME:-$HOME/.local/state}/redpanda-lab/terraform/<checkout-hash>/
  settings.json                persisted ports, Console setting and project identity
  inputs.tfvars.json           effective pinned image/input values
  terraform.tfstate            local backend; Terraform also retains backups
  data/                        TF_DATA_DIR and provider links to the image mirror
  apply.tfplan / destroy.tfplan exact saved artifacts awaiting explicit review
  *-plan.json                  artifact digest + contextual fingerprint
  *.last.tfplan                consumed artifact, retained for diagnosis
  evidence/                    private E2E plan JSON (never a Git artifact)
```

The directory is mode 0700 and new files use umask 077. `LAB_TF_STATE_DIR` selects another external path; paths inside the checkout are rejected. `LAB_TF_PORT_BASE=59000` (49152–65520) and `LAB_TF_CONSOLE_ENABLED=false` are initial settings, not silent changes on each invocation. Inspection and validation show proposed defaults without persisting them; the first plan persists the selected values. Persisted endpoints bind saved-plan review to the same target. A successful reviewed destroy clears settings only after both Terraform state and owned containers, volumes and networks are empty, so the next plan may choose new values. State backups and evidence remain. A collision fails rather than reallocating ports or repeating apply. Only running owned containers may retain their own bound ports; a stopped container cannot waive a collision.

## 3. Apply the reviewed artifact, then establish health

Copy the **actual printed hash** into an environment variable after inspection:

```bash
read -r -p 'Paste the SHA256 of the plan you reviewed: ' REVIEWED_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_SHA256"
./labs/terraform/lab status
./labs/terraform/lab urls
./labs/terraform/lab rpk cluster info
./labs/terraform/lab rpk cluster health
```

Never approve a plan you did not inspect. The wrapper rejects a missing/wrong hash, modified plan bytes, changed inputs/HCL/tool/socket and (through Terraform) stale state. It applies the saved file, not an implicit newly generated plan. `up` is an interactive shortcut that displays the plan and asks you to type the exact project name; it is not silent `-auto-approve`.

Container creation success is not enough. After apply, the wrapper performs a bounded health check against **all three** Admin APIs: each must report three registered nodes, no down nodes, no leaderless/under-replicated partitions and `is_healthy=true`. Console's startup endpoint must also succeed if enabled. Terraform configures resource dependencies, but it is not a continuously running broker health controller.

An apply error consumes the artifact; partial state/resources remain. A health timeout can mean apply succeeded but the cluster is not ready. Inspect `status`, the selected containers' logs and private state before making a new plan. There is no automatic apply retry, state reset, port reallocation or global cleanup. `status` also shows the last Terraform operation's exit status, which is intentionally distinct from subsequent service readiness.

For a machine-readable workflow:

```bash
./labs/terraform/lab plan --json
./labs/terraform/lab show                 # Human review of exactly that saved file.
./labs/terraform/lab show --json          # Sensitive; keep private, do not paste in tickets.
./labs/terraform/lab apply --reviewed "$REVIEWED_SHA256"
```

`plan --json` prints only safe artifact metadata to stdout, while Terraform diagnostics go to stderr. A no-change plan reports `changed:false`; a changes plan reports `changed:true`. A planning error is a nonzero command exit, not a plausible metadata result.

## 4. Use the provisioned cluster without confusing ownership

```bash
./labs/terraform/lab rpk topic create terraform.lifecycle.v1 \
  --partitions 1 --replicas 3 --topic-config min.insync.replicas=2
printf '%s\n' '{"event":"infrastructure-reviewed","version":1}' | \
  ./labs/terraform/lab rpk topic produce terraform.lifecycle.v1 \
  --acks=-1 --delivery-timeout 15s --format '%v\n'
./labs/terraform/lab rpk topic consume terraform.lifecycle.v1 \
  --offset start --num 1 --format '%v\n'
```

Open the printed Console URL, inspect the three brokers and topic, and read the record. One partition gives a single partition order; RF3 means its replicas live on all three brokers. `acks=all` plus minimum ISR 2 avoids acknowledging a write with just one in-sync replica, but this development cluster's unsafe fsync/write-cache settings still do not establish production durability.

The Docker provider has **no Kafka topic resource**. These tutorial/E2E topic operations are intentionally separate `rpk` application-data operations, not Terraform provisioners and not represented as managed topics in state. Terraform does not plan topic configuration changes or restore record contents. If you add a dedicated Kafka/Redpanda provider in a real deployment, pin and research its schema, authentication, import and deletion semantics separately; do not pretend that generic container lifecycle covers it.

## 5. Introduce actual drift, then reconcile it

```bash
./labs/terraform/lab plan                 # Should show no changes after healthy apply.
./labs/terraform/lab drift                # Out-of-band stop of this project's Console.
./labs/terraform/lab status
./labs/terraform/lab plan                 # must_run false -> true for Console.
./labs/terraform/lab show
read -r -p 'Paste the reviewed drift plan SHA256: ' REVIEWED_DRIFT_SHA256
./labs/terraform/lab apply --reviewed "$REVIEWED_DRIFT_SHA256"
./labs/terraform/lab plan                 # Should converge back to no changes.
```

`drift` verifies the selected container's project/role labels and stops only Console. Brokers and volumes are untouched. The pinned provider's read implementation observes a stopped container and records `must_run=false`; its update implementation starts it when the reviewed desired state is `true`. The E2E checks that the drift plan changes only the Console resource and that broker IDs stay unchanged. This is a real API-observed drift exercise, not a source-file edit masquerading as drift.

Changing container image/command/labels can require replacement; inspect the provider's `ForceNew` behavior and the saved plan before applying such changes. Terraform only reconciles when invoked. Setting a restart policy or using a service supervisor is a different concern; this lab deliberately uses `restart="no"` so stopped-container drift remains observable.

## 6. Destroy through another reviewed saved plan

```bash
./labs/terraform/lab plan --destroy
./labs/terraform/lab show --destroy
read -r -p 'Paste the reviewed destroy plan SHA256: ' REVIEWED_DESTROY_SHA256
./labs/terraform/lab apply --destroy --reviewed "$REVIEWED_DESTROY_SHA256"
```

Or use interactive `down`, which generates/displays the destroy plan and asks for the project name. The plan must delete **all owned containers, all three data volumes, the network and state-owned image references**. Shared immutable images are retained via `keep_locally=true`. The wrapper checks that Terraform state is empty and no project-labeled containers, volumes or networks remain. It never runs a global prune or deletes another project's objects.

**Destroy permanently removes these broker log volumes**, including topics and records you created outside Terraform. The retained Terraform state backup and saved plan cannot bring deleted logs back. Back up valuable data before deletion. Retained plans/state/evidence remain private outside the checkout for diagnosis and should be cleaned according to your data retention policy only after deciding recovery is unnecessary.

## Verification you can run

```bash
./labs/terraform/lab check
./labs/terraform/lab test
```

`check` performs actual Terraform formatting/validation in the pinned image and shellcheck for the Bash scripts. It does not create a cluster.

`test` is destructive **only to the fresh project it provisions** and refuses nonempty preexisting state or owned resources. Do not start the cluster before this command. It reviews the initial plan's exact ten-resource/loopback contract, applies that artifact, asserts actual running brokers/memory/bindings, produces and consumes an RF3 record, restarts one broker and checks its named volume plus record survive, introduces and repairs stopped-Console drift through another reviewed saved plan, requires a subsequent no-change plan, then verifies full reviewed destroy, empty state/inventory and stopped Admin endpoints. Plan JSON evidence is written privately outside Git. If a scenario fails, resources remain available for diagnosis and **a fresh reviewed destroy plan is required** for cleanup.

These checks demonstrate the local engine/provider combination; they do not prove rolling upgrades, disaster recovery, rack-aware availability, throughput capacity, production storage durability or provider compatibility with every Podman version.

## Pins, provenance and reproducibility

| Component | Pin and ownership |
| --- | --- |
| HashiCorp Terraform | 1.16.4, `pkgs.terraform` in the repository's locked nixpkgs; only Terraform gets the narrow unfree-package allowance. |
| Docker provider | 4.6.0, `pkgs.terraform-providers.kreuzwerker_docker`; Nix source/vendor hashes plus committed `.terraform.lock.hcl`. |
| Provider mirror | Unpacked `registry.terraform.io/kreuzwerker/docker/4.6.0/linux_{amd64,arm64}` directories in the Nix store, no direct fallback. |
| Redpanda | `registry-1.docker.io/redpandadata/redpanda:v26.2.4@sha256:c98c2f04a751e6646012cc701bac5183252cee44c88ba1dfa412e4c7124f2e89`. |
| Console | `registry-1.docker.io/redpandadata/console:v3.12.0@sha256:9dc0cd55db172c6be9c2ff8a51f33a14395f7675fa7fbc002c277f3b96115c27`. |
| Tool image | `default.nix`, root `terraform-image`; selected by actual loaded image ID before review. |

The provider lock's `h1:` entries are hashes of the **Nix-built unpacked packages** for x86_64-linux and aarch64-linux, not hashes of upstream release ZIPs. They were derived from the pinned nixpkgs packages substituted from cache.nixos.org. The package provenance is nixpkgs commit `e7439b6b14ad3cc35d05608ebca9bce01a25f5f8`. A Nixpkgs/provider update requires deliberately updating both assertions, HCL constraints and mirror-package hashes for both systems, then reviewing actual refresh/apply/destroy behavior. Do not run `init -upgrade` or replace the lock with upstream ZIP hashes while keeping a differently built mirror.

The OCI broker/Console pins identify multi-architecture manifests. Container runtime binaries and image licensing remain their vendors' responsibility. Redpanda's current distribution includes an Enterprise trial; this lab needs no enterprise features, paid license or external account. Review upstream license terms and support policy before adopting the packages outside a personal disposable lab.

## What production requires instead

- **State backend and concurrency:** this local backend supplies local Terraform file locking; the wrapper adds a same-project host `flock`. Neither coordinates multiple machines. Choose an actual remote backend with verified locking support, encryption, versioning, access control, auditability and restore procedures. Different backends provide different guarantees. Stop competing writers and preserve lineage/serial during migrations; never `force-unlock` until the lock owner is proven dead and recovery is authorized.
- **Secrets:** `sensitive=true` redacts display but does not remove values from state or saved plans. Keep state/plan JSON out of Git, normal logs and chat. Do not bake cloud/registry/SASL credentials into this image or HCL. Use a secret manager/runtime injection and least-privilege access. Use ephemeral/write-only mechanisms only if the exact Terraform/provider version supports the field and workflow.
- **Change control:** separate plan/review/apply authority, bind approval to the artifact digest and target context, retain an auditable approval record and refuse stale plans. Review replacements/deletion order, broker membership changes and volume loss explicitly. This lab's typed project-name/hash review is local operator intent, not an enterprise approval system or cryptographic human identity proof. Saved artifacts do not stop external runtime drift between review and apply.
- **Broker lifecycle:** rolling replacements require safe membership, maintenance/drain, replica health and upgrade compatibility, not simultaneous container recreation. Never scale a real cluster by merely deleting a `for_each` broker key and accepting volume destruction. Introduce migration/import/moved blocks with stable identity rather than recreating existing infrastructure accidentally.
- **Durability and failure domains:** replace `dev-container` mode, which bundles overprovisioning, unsafe fsync bypass and write caching. Use supported persistent storage and production resource tuning; distribute replicas across independent hosts/racks/zones; monitor disk pressure, lag, ISR, leaderless partitions and recovery. Loopback/no-auth/plaintext is a local teaching choice, not a production security architecture. Production needs TLS, authentication/authorization, controlled Admin access and isolated automation credentials.
- **Disaster recovery:** versioned encrypted state backups restore infrastructure identity, not Kafka records. Design and exercise Redpanda-supported data backup/restore or cross-cluster recovery, including topic configs, ACLs/users, schema registry, offsets and the application's replay semantics. Define RPO/RTO, backup access and restore consistency, test recovery onto a genuinely separate environment, and distinguish restoring a volume from replaying a durable external log. A Git revert cannot recover deleted data volumes.

Moving or cloning this checkout changes the path-derived resource namespace. An old state override with a mismatching project is rejected. To recover an existing deployment, first restore the same checkout path and engine context or deliberately inventory/import/migrate its resource identity with a verified state backup. Do not create a second cluster over the same volumes or erase state to silence an ownership error.

## Primary references

- [Redpanda three-broker quickstart](https://docs.redpanda.com/streaming/current/get-started/quick-start/): listener/RPC/seed topology; the example is development-only.
- [Redpanda dev-container mode](https://docs.redpanda.com/streaming/current/reference/rpk/rpk-redpanda/rpk-redpanda-start/): exact unsafe development flags and defaults.
- [Admin cluster health schema](https://docs.redpanda.com/api/doc/admin/operation/operation-get_cluster_health_overview): registered/down nodes and partition-health conditions.
- [Console configuration](https://docs.redpanda.com/streaming/current/console/config/configure-console/) and [v3.12.0 routes](https://github.com/redpanda-data/console/blob/v3.12.0/backend/pkg/api/routes.go): connections and startup/liveness endpoints.
- [Docker provider v4.6.0 container schema](https://github.com/kreuzwerker/terraform-provider-docker/blob/v4.6.0/docs/resources/container.md) and [read/update implementation](https://github.com/kreuzwerker/terraform-provider-docker/blob/v4.6.0/internal/provider/resource_docker_container_funcs.go): memory units, `must_run`, ports, uploads and real drift handling.
- [Podman API service/security](https://docs.podman.io/en/latest/markdown/podman-system-service.1.html): Docker compatibility, rootless socket and broad authority.
- [Terraform filesystem mirrors](https://developer.hashicorp.com/terraform/cli/config/config-file#filesystem_mirror), [saved-plan apply](https://developer.hashicorp.com/terraform/cli/commands/apply), [state locking](https://developer.hashicorp.com/terraform/language/state/locking) and [sensitive data in state](https://developer.hashicorp.com/terraform/language/state/sensitive-data): installation and consequential-state contracts.
- [Pinned nixpkgs provider definitions](https://github.com/NixOS/nixpkgs/blob/e7439b6b14ad3cc35d05608ebca9bce01a25f5f8/pkgs/applications/networking/cluster/terraform-providers/providers.json): selected provider version and source/vendor provenance.
