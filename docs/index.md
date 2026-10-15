---
description: Run a local Redpanda application, inspect its records, and learn what acknowledgment, replay, and recovery do and do not guarantee.
---

# Redpanda Lab

Run an application, inspect the records behind its decisions, then interrupt it and see what the log can reconstruct. These experiments use real Redpanda brokers on your Linux workstation, with fictional organizations and synthetic data.

Start with the explorer if partitions and consumer lag are new to you. Then follow one application command through a receipt and a rebuild. The production blueprints show responsibilities that the local experiments deliberately do not implement.

## Run the explorer

You need Linux, Nix flakes and host support for rootless Podman. Nix supplies the tools, not user-namespace policy, subordinate UID/GID mappings or cgroup delegation. Allow several GiB of free RAM; the first startup downloads dependencies.

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

    Choose telemetry, inventory, trading, media, agents or regional federation. Each guide explains its own decision and recovery boundaries.

    [Choose an application lab](labs/index.md)

-   **Plan beyond one host**

    Compare the running lab with the identity, storage, ownership and recovery work a production system would require.

    [Read the production blueprints](blueprints/index.md)

</div>

Already running a lab? Use [commands and ports](reference/commands.md) for the exact interface, [troubleshooting](how-to/troubleshooting.md) for a failure, and [tuning and operating limits](reference/tuning.md) before changing resources or retention. [Supply-chain notes](reference/supply-chain.md) describe artifact identity and licenses.

## Read and explore this site

Use **Search** or ++ctrl+k++ to find a command, topic or lab. Search runs locally in your browser; selecting a result highlights the matching terms. On a narrow screen, open the navigation drawer to switch sections. Breadcrumbs show where a nested page belongs, and **On this page** links jump to its headings.

Code blocks have a **Copy to clipboard** button; their titles are not copied. On blueprint pages, **Read labels** enlarges the drawing inside a scrollable region; **Fit width**, **Open SVG** and **PNG** offer other views. **Source on GitHub** opens the repository only when selected.

The light/dark control starts from your system preference and remembers an explicit choice when browser storage is available. If storage is denied, the controls still work on the current page, but a new page cannot remember the choice. Fonts, search and diagram assets are local; there are no analytics or automatic repository-statistics requests.

`just docs` builds this site outside the checkout. `just docs-serve` prints a local preview URL. See [documentation commands and authoring](reference/commands.md#documentation) to edit or preview a guide.
