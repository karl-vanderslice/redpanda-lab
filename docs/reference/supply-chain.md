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
