---
description: Explore event streaming with hands-on Redpanda labs, from your first event to application replay and recovery.
hide:
  - toc
---

<div class="showcase-hero" markdown>
<div markdown>

<p class="showcase-eyebrow">EVENT STREAMING / LOCAL SYSTEMS LAB</p>

# Redpanda Lab

<p class="showcase-lead">Run a workflow. Follow its log. Break it, then rebuild it.</p>

Follow an event from a button in your browser to a record in Redpanda. Explore orders, sensor readings, agent handoffs or regional data, and see how an application recovers from its retained history.

These experiments run on your Linux workstation with real brokers, fictional organizations and synthetic data. You'll need Nix flakes and a host configured for rootless Podman, including user namespaces, subordinate UID/GID mappings and cgroup delegation. Nix supplies the tools. Allow several GiB of free RAM and time for dependency downloads on first startup.

<div class="showcase-actions" markdown>

[Your first event :lucide-arrow-right:](tutorials/first-event.md){ .md-button .md-button--primary }
[Explore all 16 labs](labs/index.md){ .md-button }

</div>
</div>
<div class="showcase-start" markdown>

## Run the explorer

From the checkout root, enter the locked development shell:

```bash title="01 / Enter the development shell"
nix develop --no-update-lock-file
```

At the new shell prompt, start the explorer and print its URLs:

```bash title="02 / Start the stream workbench"
just up
just urls
```

Open **Stream app**. Publish an event, inspect it in Console, then build and drain a consumer backlog. The [first-event tutorial](tutorials/first-event.md) walks you through it.

</div>
</div>

!!! warning "Disposable, unauthenticated lab"

    `just down` erases this lab's records and telemetry volumes. Leave it running to keep exploring. Use synthetic data: the loopback endpoints have no authentication.

## Choose a route

<div class="grid cards" markdown>

-   :lucide-radio: **See the stream**

    Publish one event, find its partition and offset, and watch consumer lag grow and drain.

    [Publish your first event :lucide-arrow-right:](tutorials/first-event.md)

-   :lucide-history: **Rebuild a decision**

    Create a work item, inspect its immutable receipt, and reconstruct the same view from the broker.

    [Follow a command through replay :lucide-arrow-right:](tutorials/command-and-replay.md)

-   :lucide-workflow: **Try an application**

    Cross a trading order, reserve stock, triage an incident or schedule a real local-model prompt.

    [Choose an application lab :lucide-arrow-right:](labs/index.md)

-   :lucide-network: **Explore a system design**

    Follow data, authority and recovery through proposed production systems for the fictional organizations.

    [Open the blueprint gallery :lucide-arrow-right:](blueprints/index.md)

</div>

## Explore the architecture

Start with the proposed Signal Harbor Works system. Zoom in to read the labels, drag to follow a connection, or expand the canvas. The running explorer puts its three development brokers on one host; this blueprint shows how responsibilities could be separated in a production deployment.

![Proposed Signal Harbor Works system topology](assets/blueprints/explorer.svg)

[Read this blueprint](blueprints/explorer.md){ .md-button }
[How the local explorer works](explanation/architecture.md){ .md-button }

Already running a lab? Use [commands and ports](reference/commands.md) for the exact interface, [troubleshooting](how-to/troubleshooting.md) for a failure, and [tuning and operating limits](reference/tuning.md) before changing resources or retention. [Supply-chain notes](reference/supply-chain.md) describe artifact identity and licenses.

## Read and explore this site

Use **Search** or ++ctrl+k++ to find a command, topic or lab. Search runs locally in your browser; selecting a result highlights the matching terms. On a narrow screen, open the navigation drawer to switch sections. Breadcrumbs show where a nested page belongs, and **On this page** links jump to its headings.

Terminal-style command blocks keep Zensical's syntax highlighting and **Copy to clipboard** controls. Titles and terminal decorations are not copied. Diagram controls offer **Zoom in**, **Zoom out**, **Fit**, **Read labels** and **Expand**. Drag with a mouse or use the pan buttons; ++ctrl++ or ++cmd++ with the wheel zooms at the pointer. With the canvas focused, arrow keys pan, ++plus++ and ++minus++ zoom, and ++0++ fits. Escape closes an expanded diagram and returns focus. **Open SVG** and **PNG** keep the original exports available.

The light/dark control starts from your system preference and remembers an explicit choice when browser storage is available. If storage is denied, the controls still work on the current page, but a new page cannot remember the choice. Fonts, search, the original stream-node project mark and diagram assets are local; there are no analytics or automatic repository-statistics requests. **Source on GitHub** opens the repository only when selected.

`just docs` builds this site outside the checkout. `just docs-serve` prints a local preview URL. See [documentation commands and authoring](reference/commands.md#documentation) to edit or preview a guide.
