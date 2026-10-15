---
description: Explore event streaming with hands-on Redpanda labs, from your first event to application replay and recovery.
---

# Redpanda Lab

Follow an event from a button in your browser to a record in Redpanda. Then try an application workflow, interrupt it, and see how the log helps it recover. These experiments run on your Linux workstation with real brokers, fictional organizations and synthetic data.

If you're new to partitions and consumer lag, start with the explorer. If you're more interested in application state, follow a command through a receipt and a rebuild. When you're ready to look beyond the local setup, the production blueprints outline larger systems and the operational work they would need.

## Run the explorer

You'll need Linux, Nix flakes and a host configured for rootless Podman, including user namespaces, subordinate UID/GID mappings and cgroup delegation. Nix supplies the tools. Allow several GiB of free RAM and time for dependency downloads on the first startup.

From the checkout root:

```bash title="Start the explorer from the checkout root"
nix develop --no-update-lock-file
just up
just urls
```

Open **Stream app**. The [first-event tutorial](tutorials/first-event.md) takes you from a published record to a drained consumer backlog.

!!! warning "Disposable, unauthenticated lab"

    `just down` erases this lab's records and telemetry volumes. Leave it running to keep exploring. Use synthetic data: the loopback endpoints have no authentication.

## Choose a route

<div class="grid cards" markdown>

-   **Learn the event-streaming basics**

    Publish one event, find its partition and offset, and build a consumer backlog.

    [Publish your first event](tutorials/first-event.md)

-   **Follow an application decision**

    Create a work item, inspect its immutable receipt, and reconstruct the same view from the broker.

    [Follow a command through replay](tutorials/command-and-replay.md)

-   **Explore a domain**

    Choose telemetry, inventory, trading, media, agents or regional federation. Each guide walks you through a decision and shows how to inspect and recover it.

    [Choose an application lab](labs/index.md)

-   **Plan beyond one host**

    Use the local workflow as a starting point for thinking about identity, storage, ownership and recovery in a production system.

    [Read the production blueprints](blueprints/index.md)

</div>

Already running a lab? Use [commands and ports](reference/commands.md) for the exact interface, [troubleshooting](how-to/troubleshooting.md) for a failure, and [tuning and operating limits](reference/tuning.md) before changing resources or retention. [Supply-chain notes](reference/supply-chain.md) describe artifact identity and licenses.

## Read and explore this site

Use **Search** or ++ctrl+k++ to find a command, topic or lab. Search runs locally in your browser; selecting a result highlights the matching terms. On a narrow screen, open the navigation drawer to switch sections. Breadcrumbs show where a nested page belongs, and **On this page** links jump to its headings.

Code blocks have a **Copy to clipboard** button; their titles are not copied. On blueprint pages, **Read labels** enlarges the drawing inside a scrollable region; **Fit width**, **Open SVG** and **PNG** offer other views. **Source on GitHub** opens the repository only when selected.

The light/dark control starts from your system preference and remembers an explicit choice when browser storage is available. If storage is denied, the controls still work on the current page, but a new page cannot remember the choice. Fonts, search and diagram assets are local; there are no analytics or automatic repository-statistics requests.

`just docs` builds this site outside the checkout. `just docs-serve` prints a local preview URL. See [documentation commands and authoring](reference/commands.md#documentation) to edit or preview a guide.
