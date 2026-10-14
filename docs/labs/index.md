# Choose an application lab

Start with the explorer if you want to learn partitions and consumer lag. Choose a domain lab when you want to see why an application needs the event log, not just how to connect a producer.

| Lab | Authoritative records | What you operate | Important limit |
| --- | --- | --- | --- |
| [Trading](trading.md) | Atomic command and matching outcomes | Rust CLI and web orders | One matcher; no balances, settlement or real money. |
| [Sports](sports.md) | Scores, preferences and playback events | Multi-sport portal and score control room | Original synthetic clips, not licensed broadcasts. |
| [Agent messaging](agent-messaging.md) | Tasks and ordered agent step transitions | Planner and reviewer, each invoking actual `fx` | Singleton per role; interrupted inference is not silently retried. |
| [Scheduled agent chat](agent-chat.md) | Conversations, messages and job transitions | Web chat, future jobs and cancellation | One scheduler; model completion can become unknown after interruption. |
| [Bitcoin paper trading](bitcoin.md) | Quotes, commands and exact paper-account outcomes | Historical price replay, automated entries/exits, positions and P&L | No live feed, exchange orders, wallets or profitability claim. |
| [Terraform](terraform.md) | Terraform state identifies infrastructure; Redpanda stores broker records | Reviewed plans, drift and teardown | Infrastructure state is not a Kafka data backup. |
| [Multi-jurisdiction sharding](jurisdictions.md) | Separate regional raw logs and a global summary log | Residency-aware writes, tenant partitions, export policy and region-specific outages | Same host, no legal/compliance or geographic resilience guarantee. |

## The same lifecycle, separate ownership

```bash
nix develop --no-update-lock-file
just up sports
just urls sports
just logs sports app
just rpk sports topic describe sports.events
just check sports
just down sports
```

The five single-broker application labs keep their total-order projections explicit. The explorer and Terraform labs use three brokers for quorum experiments. The jurisdictions lab uses four independent clusters to distinguish jurisdiction sharding from partitioning within a region, with asynchronous summary-only federation. All run on the same host and use development settings. None demonstrates geographic resilience.

Every application uses real Redpanda records. HTTP acceptance and broker acknowledgement are not interchangeable with consumer application. The pages show projection/operation state; the guides explain stable identifiers, deduplication, replay and uncertain outcomes. Redpanda does not generate model answers, deliver media bytes or wake timers by itself. The model server generates text, the sports server streams local MP4 files, and the chat application checks due jobs and records transitions through Redpanda.

`just test LAB` starts real containers, runs the domain workflow and disposes of that lab. It is not safe against data you want to keep. The Terraform test requires empty owned state and reviews exact saved plans before applying its known fixture. Runtime evidence stays outside the source checkout. Source checks are available independently through `just check LAB`; `just check` runs them all.

Terraform's lifecycle adds a review boundary: `just up terraform` displays an infrastructure plan before asking for the project name. Read its guide before applying or destroying anything. The tool's Podman socket has the host user's authority even though the tool container is constrained.

## Visual and interaction choices

The interfaces use original HTML/CSS, system fonts and local assets. The taste-book review selected two useful patterns: Getburnt's paper/ink editorial hierarchy and ElevenLabs' restrained product accents and generous spacing. Those references informed hierarchy, not branding, copied assets or external dependencies.

Trading uses compact amber/ink operational panels; sports uses a slate/red editorial slate and a native video player; messaging uses neutral surfaces with violet stage accents; chat uses paper/cobalt conversation and scheduling controls; Bitcoin uses paper/amber accounting panels and a local price chart. Each offers keyboard-accessible controls and a remembered light/dark choice, initially following the system. Storage failure must not prevent operation. Narrow layouts and enlarged text are part of browser verification, not inferred from CSS.

State labels describe real mechanisms. A connected scoreboard is not proof that video is playing. A completed agent step means a successful local harness result was retained, not that its advice is correct. A scheduled job is pending until its start transition wins the log order; cancellation after that cannot erase the model call. Production choices and recovery boundaries are in the domain guides and the [multi-region recovery explanation](../explanation/production.md).
