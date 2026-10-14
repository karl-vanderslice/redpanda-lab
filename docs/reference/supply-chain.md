# Supply-chain pins and reproducibility

Pins identify inputs. They do not establish a security audit, license entitlement or byte-for-byte reproducible output. Review each layer separately.

## Explorer

| Layer | Control | Limit |
| --- | --- | --- |
| Tools | `flake.lock` selects the Nixpkgs revision and source hash. | The host kernel, permissions and rootless container configuration remain external. |
| Local engine adapter | Nix `writeShellApplication` supplies the absolute executable passed to Compose. | [Compose 1.6.0](https://github.com/containers/podman-compose/blob/v1.6.0/podman_compose.py) puts `--podman-args` after the subcommand; Podman rejects `--remote` there. Supported `--podman-path` selection needs no Compose patch. |
| Runtime | `app/Containerfile` pins Node 24.21.0 Bookworm slim by multi-architecture digest. Startup activates the built image ID, not its mutable local tag. | Architecture-specific layers differ. |
| Dependencies | Exact versions and integrity hashes in `app/package-lock.json`; npm scripts disabled before the deliberate native rebuild. | Source trust and native-build review still matter. |
| Native Kafka client | Bundled librdkafka 2.16.0 with a fail-closed ownership patch. | The patch has an explicit maintenance boundary below. |
| Broker and telemetry | Explicit registries, exact versions and manifest digests in `compose.yml`. | Identity is not vulnerability assessment or platform runtime proof. |
| Debian libraries | Apt installs into the pinned base. | Package versions and repository snapshots are not separately locked; rebuilds can change. |

The explorer declares `@confluentinc/kafka-javascript` 1.11.0 and `@prometheus-io/client` 0.16.1. Its native build uses the integrity-locked npm source rather than an unpinned prebuilt download.

Prometheus 3.13.4 follows its [LTS release policy](https://prometheus.io/docs/introduction/release-cycle/); Grafana 12.4.13 replaces the retired 11.6 line under its [support policy](https://grafana.com/docs/grafana/latest/upgrade-guide/when-to-upgrade/). The registry manifests include AMD64 and ARM64, but only AMD64 runtime is verified here. Existing telemetry needs a [quiescent backup before upgrade](../how-to/failure-and-recovery.md#upgrade-retained-telemetry).

### Native lifetime patch

`app/patches/librdkafka-coordinator-lifetime.patch` carries worker-ownership and destroyed-operation fixes from [upstream PR 5397](https://github.com/confluentinc/librdkafka/pull/5397), following a coordinator error-path use-after-free observed during broker-failure work with librdkafka 2.16.0. It omits the proposed generic null-opaque guard. Patch application permits no fuzz and fails closed.

Do not remove it as cleanup. First select an upstream version that fixes both lifetimes, then pass the real broker-failure scenario without the patch. A source check alone cannot establish that the native lifetime problem is resolved.

## Application and infrastructure labs

Nix-built application images use `dockerTools.buildLayeredImage`; they do not install from npm or a package registry at container startup. Their runtime and native libraries come from locked Nixpkgs. Credentials remain runtime inputs, never image or Nix-store contents.

| Component | Identity owner | Review when updating |
| --- | --- | --- |
| Rust exchange | `labs/trading/Cargo.lock` and the locked toolchain | Crate sources, matching, cancellation and replay. |
| Shared Node applications | Nixpkgs `nodejs_22`; KafkaJS 2.2.4 in `labs/common/package-lock.json` | npm integrity, packaged sources and domain reconstruction. |
| Sports media | Locked FFmpeg; procedural filter graphs in `labs/sports/default.nix` | Clip generation, decoding, range requests and browser playback. Clips are original synthetic loops, not remote sports footage. |
| Bitcoin data | Attributed Coinbase historical candles in `labs/bitcoin/candles.json`; data hash recorded in the ledger | Provenance, data rights and execution policy. Use a fresh account when changing source data or policy. |
| Coding harness | Genuine `vercel-labs/fx` 0.0.13, architecture-specific hashes in `labs/agent-messaging/fx.nix` | Adapter, permissions, upstream license and third-party notices. Nixpkgs' unrelated JSON viewer named `fx` is not a substitute. |
| Inference engine | Locked Nixpkgs llama.cpp | CPU execution, two threads, one slot and no cloud fallback. |
| Model | SmolLM2 135M Instruct Q8_0; immutable revision and hash in `labs/common/model.nix` | Model card, license, answer quality and resource limits. |
| Terraform | HashiCorp Terraform 1.16.4, Docker provider 4.6.0 | Nix-built offline provider mirror and `.terraform.lock.hcl`; no registry fallback or `init -upgrade`. |
| Broker and Console | Digest-qualified 26.2.4 / 3.12.0 references | Keep explorer Compose, common Compose and `labs/terraform/images.env` consistent. |

The model revision is `09816acd5d99df7be770d85ea30822623dab342c`; SHA256 is `5a1395716f7913741cc51d98581b9b1228d80987a9f7d3664106742eb06bba83`. See the [original model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct) and [pinned quantized repository](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/tree/09816acd5d99df7be770d85ea30822623dab342c). The small model is a resource choice, not a quality or safety guarantee. `fx` uses a deny-all, text-only connection to the contained server.

Both `x86_64-linux` and `aarch64-linux` are declared. The reported runtime evidence is x86_64 only; a declared package or hash is not an ARM smoke test. Host kernels, storage, rootless mappings and browser codecs remain part of the runtime boundary.

An uncached first run needs downloads. Cached local workflows do not require an external model provider, media service or API credential. Optional POS Stripe/Square sandbox flows need network access and server-side test credentials; their credential-dependent runtime remains unverified.

## Licenses and local assets

First-party code uses the repository's MIT license. Application images include its notice. The model image includes the hash-pinned Apache-2.0 license text and unmodified model card; `fx` preserves its upstream license and third-party notices. These notices do not relicense dependencies or grant rights to third-party film or sports assets.

Documentation fonts, search and UI assets are local. Zensical uses a plain GitHub navigation link rather than `repo_url`, whose [repository integration](https://zensical.org/docs/setup/repository/) fetches statistics in the reader's browser. The small early storage hook keeps current-page preferences usable when browser storage is denied; do not remove it without checking the selected Zensical version's initialization behavior.

Blueprint exports embed the Nix-owned Routed Gothic font and include its OFL notice and attribution. See [blueprint generation](../blueprints/index.md#sources-and-regeneration) for the source and export boundary.

## Update deliberately

For explorer dependency changes, edit exact versions in `app/package.json`, then:

```bash
just lock
just check
just test
```

**`just test` deletes explorer data.** Use a disposable runtime. `lock` resolves against `https://registry.npmjs.org/` with inherited npm/auth environment cleared and empty user/global configuration. It updates the lockfile, not host `node_modules`. Container installs also select the public registry. Do not copy personal `.npmrc` files into images or resolve public locks against a private mirror.

Review sources, licenses, lock integrity, image digests and runtime behavior together. A documentation build or publication workflow does not establish application runtime behavior.

Upstream references: [Confluent 1.11.0 migration](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/MIGRATION.md), [native build configuration](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/binding.gyp), [Prometheus client changes](https://github.com/prometheus/client_js/blob/v0.16.1/CHANGELOG.md).
