# Sports Portal

A local multi-sport web application with basketball, ice hockey, soccer, and football fixtures. The browser plays original synthetic MP4 loops. Redpanda carries scores, follow/watchlist changes, and playback events.

Media and application events take different paths. The server delivers video bytes over HTTP, including byte-range requests for seeking. The broker stores the events that update the scoreboard and viewer state. Sending video through Kafka would obscure that distinction without helping this application.

## Run it

From the repository root:

```bash
nix develop --no-update-lock-file
just up sports
just urls sports
```

Open the app URL, choose a match, and use the native video controls. Save a match to the watchlist, follow a team, or change the score from its control room. The event wire shows consumed records and their offsets.

```bash
just rpk sports topic describe sports.events
just rpk sports topic consume sports.events --offset start --num 1
```

The first Nix build generates four silent, 18-second videos with the pinned FFmpeg toolchain. They are geometric field animations, not movie clips or licensed sports broadcasts. Air Bud, Tune Squad/Monstars, and Mighty Ducks references are text-only fictional fixtures. The [research and rights section](../../docs/labs/sports.md#source-research-rights-and-pinning) explains the source choices and their limits.

## State and replay

Score, preference, and playback updates become authoritative when the consumer applies their records. An HTTP or producer acknowledgement alone does not establish that the scoreboard changed. Stable operation IDs suppress duplicate updates; optional revision checks reject stale score changes.

```bash
just restart sports app
```

An app-only restart rebuilds the projection from the retained `sports.events` log. Media delivery does not depend on broker availability, so a control-plane failure can leave the clip playing while telemetry is stopped. The page distinguishes that condition from successful event delivery.

This lab uses one partition and replication factor one. Its 24-hour retention is suitable for a disposable experiment, not lifetime scores, durable accounts, or audience billing.

## Check and remove

```bash
just check sports
just test sports
just down sports
```

The E2E checks all four media files, range bytes, codec properties, frame decoding, score/preference transitions, telemetry, and restart replay against real services. Browser playback is a separate check, not inferred from a successful HTTP response. `down` removes the lab's data and containers.

The [full guide](../../docs/labs/sports.md) includes API examples, recovery rules, metrics, and the additional rights, ingest, CDN, entitlement, and regional-recovery work a production service would require.
