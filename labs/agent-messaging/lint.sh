#!/usr/bin/env bash
set -euo pipefail
lab=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
for source in "$lab"/*.mjs "$lab"/public/*.js; do
  node --check "$source"
done
shellcheck "$lab/e2e.sh" "$lab/lint.sh"
