# Supply-chain pins and reproducibility

A version tag is a useful human label, not an immutable artifact identity. Treat the layers separately and do not confuse a repeatable setup with a byte-for-byte reproducible image.

| Layer | Current control | Limit |
| --- | --- | --- |
| Nix tools | Committed `flake.lock` selects one Nixpkgs revision and source hash. | Updating the lock changes tools together; host kernel and rootless permissions remain external. |
| App runtime | Node 22.23.3 Bookworm slim multi-architecture digest in `app/Containerfile`. | Architecture-specific layers differ. |
| App dependencies | Exact versions and npm integrity hashes in `app/package-lock.json`; scripts disabled before the deliberate native build. | Upstream source trust still matters. |
| Native Kafka code | Bundled librdkafka 2.16.0, built locally with a fail-closed patch. | Carrying a patch creates maintenance responsibility. |
| Broker and telemetry | Explicit registry, exact version labels, and verified multi-architecture manifest digests in Compose. | Artifact identity is not a security audit; supported platforms still require runtime checks. |
| Debian build/runtime libraries | Installed by apt in the pinned base. | Apt package versions/repository snapshots are not separately locked, so rebuilds can change. |

The original app uses Confluent 1.11.0 and `@prometheus-io/client` 0.16.1. Broker-failure testing found a coordinator error-path use-after-free in librdkafka 2.16.0. `app/patches/librdkafka-coordinator-lifetime.patch` carries the worker-ownership and destroyed-operation fixes from [upstream PR 5397](https://github.com/confluentinc/librdkafka/pull/5397). It deliberately omits the proposed generic null-opaque guard. Patch application uses no fuzz and fails closed. Remove the patch only when the selected upstream version fixes both lifetimes and the broker-failure E2E passes without it.

## Application and infrastructure lab pins

The five new application images use `dockerTools.buildLayeredImage`, not an
unlocked `apt` or runtime registry install. Their language runtime, native
libraries and image construction come from the same locked Nixpkgs input.
They contain no host home, npm configuration, API key or ambient model connection.

| Component | Version/identity owner | Update boundary |
| --- | --- | --- |
| Rust exchange | `labs/trading/Cargo.lock` and the locked Rust toolchain | Review crate/source changes, then matching, cancellation and replay E2E. |
| Node applications | Nixpkgs `nodejs_22`; KafkaJS **2.2.4** in `labs/common/package-lock.json` | The Nix fetch uses npm's committed integrity hash and disables runtime installation. |
| Sports media | Locked Nixpkgs FFmpeg; procedural filter graphs in `labs/sports/default.nix` | Rebuild original clips and verify decoding/range requests plus actual browser playback. No remote media asset. |
| Bitcoin market data | Attributed Coinbase hourly candle capture in `labs/bitcoin/candles.json`; SHA256 in each ledger record | Historical, not a live service. Review source/data rights; change data or execution policy only with a fresh account. |
| Coding harness | Genuine `vercel-labs/fx` **0.0.13**, architecture-specific release hashes in `labs/agent-messaging/fx.nix` | Stock Nixpkgs `fx` is an unrelated JSON viewer. Review the real harness adapter, permissions and licenses before changing pins. |
| Local inference | Locked Nixpkgs llama.cpp **0.6.0** | CPU inference, two threads, one slot; no GPU driver or cloud fallback. |
| Model file | SmolLM2 **135M Instruct Q8_0**, repository revision `09816acd5d99df7be770d85ea30822623dab342c` | `labs/common/model.nix` fixes both the immutable URL and SHA256. Review the model card and answer-quality limits. |
| Terraform | HashiCorp **1.16.4**, Docker provider **4.6.0** | Nix-built offline provider mirror plus `.terraform.lock.hcl`; no `init -upgrade` or direct registry fallback. |
| Broker and Console | Shared digest-qualified **26.2.4** / **3.12.0** references | Keep `labs/common/compose.yml`, `labs/terraform/images.env` and the explorer Compose pins consistent. |

The model is 144,811,360 bytes. Its SHA256 is
`5a1395716f7913741cc51d98581b9b1228d80987a9f7d3664106742eb06bba83`.
The [original model card](https://huggingface.co/HuggingFaceTB/SmolLM2-135M-Instruct)
and [pinned quantized repository](https://huggingface.co/bartowski/SmolLM2-135M-Instruct-GGUF/tree/09816acd5d99df7be770d85ea30822623dab342c)
explain provenance. A small model is a resource choice, not a quality or safety guarantee.
`fx` uses a deny-all, text-only connection to that contained server.

Both Linux x86_64 and aarch64 are declared. Runtime evidence from this task is
x86_64 only; a declared package or hash is not an ARM smoke test. Nix inputs and
OCI digests identify artifacts, but do not prove all rebuilds are byte-identical,
free of vulnerabilities, or suitable under every license. Host kernels, rootless
mappings, browser codecs and container storage still affect behavior.
An uncached first run needs source/image downloads. Once cached, applications
do not need an external provider, media service, npm install or API credential.

The first-party code uses the repository's MIT license. Application containers include that notice; the model image includes the hash-pinned Apache-2.0 license and the unmodified model card from the pinned quantized repository. The fx package preserves its upstream license and third-party notices. These files do not relicense upstream distributions or grant film or sports asset rights.

Zensical uses a plain navigation link to GitHub rather than `repo_url`. Its [repository integration](https://zensical.org/docs/setup/repository/) otherwise fetches release and repository statistics in the reader's browser. Documentation fonts, search assets and application UI assets are served locally.

## Update deliberately

Change exact app versions in `app/package.json`, then run:

```bash
just lock
just check
just test
```

`lock` selects `https://registry.npmjs.org/`, clears inherited npm/auth environment, and uses empty user/global configuration. It only updates the lockfile, not host `node_modules`. Container installs also select the public registry. Do not resolve a public lockfile against a private mirror or copy personal `.npmrc` files into images.

Review licenses, source changes, lockfile integrity, image digests, and runtime behavior together. A digest pin gives identity, not vulnerability assessment. There is no CI/CD or automatic update service here.

Relevant upstream references: [Confluent 1.11.0 migration](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/MIGRATION.md), [native build configuration](https://github.com/confluentinc/confluent-kafka-javascript/blob/v1.11.0/binding.gyp), and [Prometheus client changes](https://github.com/prometheus/client_js/blob/v0.16.1/CHANGELOG.md).
