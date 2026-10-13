#!/usr/bin/env bash
set -euo pipefail
here=$(realpath "$(dirname "${BASH_SOURCE[0]}")")
node --check "$here/server.mjs"
node --check "$here/fixtures.mjs"
node --check "$here/public/app.js"
shellcheck "$here/e2e.sh" "$here/lint.sh"
