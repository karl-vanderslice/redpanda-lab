set shell := ["bash", "-euo", "pipefail", "-c"]

# List available commands.
default:
    @just --list

# Start the explorer and print its loopback URLs.
up:
    ./lab up

# Delete the explorer's containers, volumes, network, and records.
down:
    ./lab down

# Show container state.
status:
    ./lab status

# Print the running explorer's URLs.
urls:
    ./lab urls

# Read recent logs, optionally for one service.
[positional-arguments]
logs *args:
    ./lab logs "$@"

# Run rpk inside the explorer broker.
[positional-arguments]
rpk +args:
    ./lab rpk "$@"

# Run the real explorer E2E, including failure and disposal.
test:
    bash tests/e2e.sh

# Check Bash and JavaScript syntax and build documentation.
check:
    bash scripts/check

# Build Zensical outside the checkout.
docs:
    bash scripts/docs build

# Serve documentation on a free loopback port.
docs-serve:
    bash scripts/docs serve

# Refresh the app lockfile against public npm only.
lock:
    ./lab lock
