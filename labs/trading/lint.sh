#!/usr/bin/env bash
set -euo pipefail
# Invoked by root checks in the pinned project Nix environment, never host Rust.
shellcheck labs/trading/e2e.sh labs/trading/lint.sh
node --check labs/trading/public/app.js
export CARGO_TARGET_DIR="${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/trading-target"
export CARGO_HOME="${XDG_CACHE_HOME:-$HOME/.cache}/redpanda-lab/trading-cargo"
cargo fmt --check --manifest-path labs/trading/Cargo.toml
cargo clippy --locked --manifest-path labs/trading/Cargo.toml -- -D warnings
