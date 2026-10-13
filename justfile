set shell := ["bash", "-euo", "pipefail", "-c"]

# List available commands.
default:
    @just --list

# Start one lab and print its loopback URLs (default: explorer).
[positional-arguments]
up name='explorer':
    bash scripts/dispatch up "$@"

# Delete one lab's containers and data.
[positional-arguments]
down name='explorer':
    bash scripts/dispatch down "$@"

# Show one lab's state.
[positional-arguments]
status name='explorer':
    bash scripts/dispatch status "$@"

# Print one lab's URLs.
[positional-arguments]
urls name='explorer':
    bash scripts/dispatch urls "$@"

# Read logs: just logs LAB [SERVICE].
[positional-arguments]
logs name='explorer' *args:
    bash scripts/dispatch logs "$@"

# Run broker CLI: just rpk LAB ARGS...
[positional-arguments]
rpk name +args:
    bash scripts/dispatch rpk "$@"

# Run a real lab E2E and delete its data (default: explorer).
[positional-arguments]
test name='explorer':
    bash scripts/e2e "$@"

# Run source/packaging gates for one lab or all labs, plus docs.
[positional-arguments]
check name='all':
    bash scripts/check "$@"

# Execute a command inside a lab service: just exec LAB SERVICE COMMAND...
[positional-arguments]
exec name +args:
    bash scripts/dispatch exec "$@"

# Restart exactly one lab service.
[positional-arguments]
restart name service:
    bash scripts/dispatch restart "$@"

# Manage saved Terraform plans: just tf plan, just tf apply --reviewed HASH.
[positional-arguments]
tf +args:
    bash labs/terraform/lab "$@"

# Build Zensical outside the checkout.
docs:
    bash scripts/docs build

# Serve documentation on a free loopback port.
docs-serve:
    bash scripts/docs serve

# Refresh the app lockfile against public npm only.
lock:
    ./lab lock
