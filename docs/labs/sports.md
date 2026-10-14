# Sports: Courtside broadcast portal

Courtside is a fictional, unaffiliated multi-sports portal. Original silent 18-second field animations play from the Nix-built image; Redpanda carries real score, preference and playback events. No ESPN stream, film footage or real sporting event is included.

## Start and watch

Use the [common environment and lifecycle commands](../reference/commands.md):

```bash
just up sports
./labs/run sports urls
```

No external media, model, API key, account or host encoder is needed. The first build generates four clips with pinned FFmpeg; runtime downloads none.

Each sport has match pages, exhibition fixtures and a native player with play/pause/seek/volume/fullscreen. Basketball includes Timberwolves vs Harbor Comets and Tune Squad vs Monstars; other routes cover hockey, soccer and football. Captions/descriptions explain the silent animation. No autoplay is used; back/forward and direct match URLs work.

Playback emits `play`, `pause` and a visible-tab `heartbeat` every ten seconds. Leaving playing media emits pause for the old match. **Watchlist** stores matches; **Follow** uses team display names, so Timberwolves also covers its football fixture. Preference confirmation waits for the projected offset. Control-room score increments are basketball 1/2/3, hockey/soccer 1, football 1/2/3/6, not a complete rules engine.

Viewer ID/theme persist when local storage works; otherwise reload creates a new viewer. **Scoreboard connected** means SSE/control-plane connectivity, not playable media. Telemetry failure leaves playback working but stops telemetry until **Reconnect control plane**. Errors retain the operation ID for investigation.

## Produce and inspect a score

```bash
APP=$(./labs/run sports urls --json | jq -er .app)
ID="reader_$(date +%s)_$RANDOM"
curl --fail -H 'Content-Type: application/json' \
  -d "{\"id\":\"$ID\",\"kind\":\"score\",\"matchId\":\"ducks-rink\",\"side\":\"home\",\"delta\":1}" \
  "$APP/api/events" | jq
curl --fail "$APP/api/operations/$ID" | jq
curl --fail "$APP/api/state?viewer=reader" | jq '.matches[] | select(.id == "ducks-rink")'
./labs/run sports rpk topic describe sports.events
./labs/run sports rpk topic consume sports.events --offset start --num 10
```

Poll a `pending` operation until `completed` or `error`. Completion includes consumed partition/offset; append acknowledgment alone does not apply the score. Bounded `rpk` consumption waits if fewer records exist; reduce the count or use Ctrl-C.

For optimistic scoring, send the match's `expectedRevision` from state. Only one concurrent change against that revision succeeds; the consumer marks later stale operations `error`. Read the new score before creating another ID. Omission intentionally makes an unconditional additive score.

## Media and control planes

```text
Nix FFmpeg → immutable MP4 → HTTP byte ranges → native player
                                                   │ play/pause/heartbeat
Score / follow / watchlist ─────────────────────────┤
                                                   ▼
POST /api/events → sports.events → consumer/replay → projection → state/SSE
```

Media is H.264/yuv420p, 960×540, 24 fps, fast-start MP4. `/media/{basketball,hockey,soccer,football}.mp4` supports HEAD, one standard/suffix byte range and 206/416. A bounded stream serves bytes; Kafka carries no video. Matches reuse their sport's loop. No adaptive bitrate, HLS ingest, DRM, live audiovisual feed or burned-in score overlay exists. Stage/quarter labels are deterministic fixtures, not clocks.

`sports.events` has one partition, RF1, match-ID keys and total event order. Records contain `schema: 1`, stable `id`, `kind`, `matchId`, server receipt `at`, plus:

| Kind | Additional fields |
| --- | --- |
| Score | `side`, `delta`, optional `expectedRevision` |
| Preference | `viewerId`, `enabled`; follows also `side` |
| Telemetry | `viewerId`, `position` in seconds |

Startup uses an ephemeral consumer group, replays from the beginning through the pre-start high watermark, then becomes ready. Replay has no external effects. Only consumer callbacks change domain state. The projection applies the first valid record per terminal operation ID; invalid direct topic records are logged/counted without mutation.

HTTP reserves IDs synchronously before append. Identical reuse returns the observed operation; changed input returns 409. Failed/timed-out append can be **unknown**, not absent. The process preserves uncertainty until consumption resolves it. Inspect operation/topic before retrying; never blindly use a new ID. After restart, an unobserved ID can return 404 without proving non-publication.

## API and metrics reference

| Endpoint | Contract |
| --- | --- |
| `GET /health` | 200 `{ready:true}` after replay; 503 initializing |
| `GET /api/state?viewer=ID` | Fixtures, scores/revisions, viewer preferences/playback, latest 60 events, metrics |
| `GET /api/feed?viewer=ID` | SSE `state` after consumption/every ten seconds; max 100 streams; slow clients closed |
| `POST /api/events` | Bounded JSON/schema/origin validation; 200 completed/error, 202 pending, 503 unknown publication |
| `GET /api/operations/ID` | Pending/unknown/completed/error, event/error/offset; 404 not observed in this process |
| `GET /metrics` | Prometheus text |

IDs allow 1–80 ASCII letters/digits/underscores/hyphens. Mutations require `application/json`; untrusted browser origins receive 403. Origin checks are not authentication: CLI needs no Origin, viewer IDs are not accounts, and any local client can score or inspect another viewer. Keep ports private.

Metrics: `sports_applied_total`, `sports_rejected_total`, `sports_invalid_total`, `sports_duplicates_total`, `sports_publish_errors_total`, `sports_media_requests_total`, `sports_play_total`, `sports_pause_total`, `sports_heartbeat_total`, `sports_active_viewers`. Active viewers have projected playing sessions younger than 30 seconds, counted once across matches. Heartbeats never start paused sessions; background visibility limits telemetry. Counts are estimates, not billing/fraud-resistant analytics. Domain/telemetry counters replay; media requests/publication failures are process-local.

## Replay and meaningful verification

App-only restart retains broker data; readiness precedes reconstructed scores/preferences. `fixtures.mjs` provides a deterministic baseline; later scores are retained additive events, not random timers. Retention is 24 hours: an expired prefix cannot recover a lifetime scoreboard.

`labs/sports/e2e.sh` requires a running project and pinned Node/curl/jq/FFmpeg. It checks four routes, all media, range bytes, ffprobe H.264 properties, decoded frames, consumed scores, duplicate/stale operations, preference removal, telemetry, validation/origin errors, metrics/SSE and app-only restart equality. **API checks do not prove native playback.** Browser checks must observe advancing `currentTime`, pause/navigation, consumed telemetry/scores, keyboard focus, captions, narrow layout and themes. Use `just check sports`/`just test sports` as described in [commands](../reference/commands.md).

## Source research, rights and pinning

Sources read **2026-10-13** establish fixture mapping, not asset licenses:

| Source | Boundary |
| --- | --- |
| [Air Bud producer descriptions](https://www.airbud.com/air-bud) | Basketball in *Air Bud*, football in *Golden Receiver*, soccer in *World Pup*; later films include baseball/beach volleyball. Sequels are not all basketball. |
| [Disney: Golden Receiver](https://movies.disney.com/air-bud-golden-receiver) | School football Timberwolves, not Minnesota's NBA franchise. Basketball association is a lab fixture, not licensed/canonical roster. |
| [Disney: The Mighty Ducks](https://movies.disney.com/the-mighty-ducks) | Pee-wee hockey, not an NHL roster. Northstar Blades, scores and venues are lab inventions. |
| [Warner Bros. Space Jam announcement, May 7, 2026](https://www.prnewswire.com/news-releases/warner-bros-discovery-tips-off-the-30th-anniversary-of-space-jam-302765723.html) | Tune Squad/Monstars, not the sequel's Goon Squad. Text only; no press assets. Issuer copyright/trademark notice is not independent licensing corroboration. |
| [Copyright scope](https://www.copyright.gov/help/faq/faq-protect.html) | Names/titles alone lack copyright, but may carry trademarks; logos may have copyright. No blanket clearance. |
| [Permission/fair-use FAQ](https://www.copyright.gov/help/faq/faq-fairuse.html) | Online availability/education are not automatic authorization; no universally safe clip duration. No posters, stills, clips, logos, voices or soundtracks are used. |
| [FFmpeg filters](https://ffmpeg.org/ffmpeg-filters.html#drawbox) | `color`, `drawbox`, `drawgrid`, timed `overlay`; exact original-generation graph in `default.nix`. |
| [RFC 9110 ranges](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests) | Local MP4 seeking; one range, not multipart. |

Territorial chain of title, sublicensing and trademark clearance remain **unknown**. References imply neither endorsement nor exploitation rights. Public/commercial distribution needs qualified rights review; substitute original names when required. Geometric clips, system fonts and lab CSS/HTML copy no assets; no remote fonts, analytics, CDN or images load. ESPN influence is editorial hierarchy only.

Root `flake.lock` pins Node/FFmpeg/encoders; shared KafkaJS is 2.2.4 and shared Compose pins broker/Console. Sports adds no npm package or extra binary download. Clips are built in Nix and copied into the immutable image. Review browser H.264 support and codec/patent suitability; lock updates change inputs.

## What a production regional service needs

Planes are logically separate but share a process/host, not fault isolation. Production requires territorial/time-window rights, entitlement/geographic enforcement, privacy/retention policy, redundant ingest/transcode, bitrate ladders/manifests, object origins, regional CDN, signed authorization and player-quality monitoring.

Control state needs replicated failure domains, domain partitioning/cross-partition reconciliation, durable views/snapshots, schema evolution, long-lived IDs and authorized scorers. Set separate RPO/RTO for media, scores, preferences and live services; fence writers and rehearse rehydration without treating old telemetry as fresh viewing. [Redpanda recovery](https://docs.redpanda.com/current/manage/disaster-recovery/) depends on pinned edition/version; this broker supplies no regional guarantee. Recovered scores cannot repair lost media; cached playback cannot prove fresh scores.

Revisit rights research when fixtures/assets/distribution/territories or broker/browser/toolchain pins change. This lab is not legal clearance.
