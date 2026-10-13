# Sports: Courtside broadcast portal

Courtside is an unaffiliated, fictional multi-sports portal inspired by the information hierarchy of a sports broadcaster: a sports rail, exhibition slate, match player, scoreboard and event wire. It does **not** stream ESPN, movie footage or a real sporting event. It plays original, silent, 18-second synthetic field animations from the local Nix-built image, while Redpanda carries actual score, preference and playback events.

## Start and watch

From the repository root, enter the pinned development environment and start the isolated project:

```bash
nix develop
just up sports
./labs/run sports urls
```

Open the reported app URL. No external media URL, model, API key, account or host-installed encoder is needed. The first image build generates four videos using the flake-pinned Nixpkgs FFmpeg. No video is downloaded at runtime.

1. Choose **Basketball**, then open **Timberwolves vs Harbor Comets** or **Tune Squad vs Monstars**. Press the native player's **Play** control. A moving red marker crosses an abstract court. The video is deliberately silent; its text description and captions explain the animation.
2. Use the native pause, seek, volume and fullscreen controls. Successful playback publishes `play`; pausing publishes `pause`; playback while the tab is visible publishes a `heartbeat` every 10 seconds. The event wire and “Behind the broadcast” counters show these consumed records.
3. Choose **Ice hockey**, **Soccer** and **Football**. Each has its own match page and generated media file, scoring increments and exhibition fixtures. Browser back/forward and direct match URLs work. Moving away from playing media emits a pause for the old match.
4. On a match, choose **Add to watchlist** and **Follow** either team. Wait for the projected-offset confirmation, then visit **Watchlist**. The saved match appears. Follow is by team display name, so the fixture Timberwolves follow also covers the football fixture. Toggle again to remove a preference.
5. In **Control room**, choose a scoring team and increment, then **Emit score event**. The number changes only after a consumer projects that record. Basketball permits 1/2/3; hockey and soccer 1; football 1/2/3/6. This is an exhibition scoring demo, not a full rules engine.
6. Toggle light/dark theme. Viewer ID and theme persist in local storage if the browser allows it; a storage-blocked tab still works, but gets a new viewer identity on reload. No auto-play is used.

A “Scoreboard connected” label describes the SSE/control-plane connection, not video availability. If telemetry publication fails, playback still works; telemetry stops until **Reconnect control plane** is chosen. Errors display the operation ID to investigate before issuing another action.

## Produce and inspect a score

The runner reports the actual isolated port; do not assume port 3000 on the host:

```bash
APP=$(./labs/run sports urls --json | jq -er .app)
curl --fail "$APP/health"
curl --fail "$APP/api/state?viewer=reader" | jq '.matches'

ID="reader_$(date +%s)_$RANDOM"
curl --fail -H 'Content-Type: application/json' \
  -d "{\"id\":\"$ID\",\"kind\":\"score\",\"matchId\":\"ducks-rink\",\"side\":\"home\",\"delta\":1}" \
  "$APP/api/events" | jq
curl --fail "$APP/api/operations/$ID" | jq
curl --fail "$APP/api/state?viewer=reader" | jq '.matches[] | select(.id == "ducks-rink")'

./labs/run sports rpk topic describe sports.events
./labs/run sports rpk topic consume sports.events --offset start --num 10
curl --fail "$APP/metrics"
```

The operation can initially be `pending`; query its URL again until it is `completed` or `error`. `completed` includes the consumed partition/offset. Append acknowledgement alone does not mean the scoreboard was applied. The Console URL reported by `urls` provides another way to inspect the topic. The bounded `rpk` example waits for ten records if fewer exist; use Ctrl-C or choose a smaller count.

For optimistic scoring, include `expectedRevision` from the match in `/api/state`. Two concurrent changes against one revision cannot both succeed: the consumer records the later stale operation as `error`. Read the new scoreboard before creating a new ID. Omit this field for an intentionally unconditional additive score.

## Media and control planes

```text
Nix FFmpeg → immutable local MP4 → HTTP byte ranges → native video player
                                                        │ play/pause/heartbeat
Score buttons / follow / watchlist ──────────────────────┤
                                                        ▼
                         POST /api/events → sports.events (Redpanda)
                                                    │ consumer / replay
                                                    ▼
                       in-memory projection → state + operations + SSE
```

Media files are H.264/yuv420p at 960×540, 24 fps, with fast-start MP4 layout. `/media/{basketball,hockey,soccer,football}.mp4` supports HEAD, a single standard byte range, suffix ranges and 206/416 responses. A bounded readable stream supplies bytes directly; Kafka never carries video fragments. All matches of a sport reuse its original synthetic loop. There is no adaptive bitrate, HLS live ingest, real-time audiovisual feed, DRM or score overlay burned into the video. “Broadcast” refers to the portal presentation; the stage/quarter is a deterministic fixture label, not a ticking live clock.

Scores, viewer preferences and playback positions live in the **single-partition**, replication-factor-one `sports.events` topic. Keys are match IDs. The small lab deliberately gives all events one total partition order; a production design would partition by domain key and explicitly reconcile cross-partition projections.

Records have `schema: 1`, a stable `id`, `kind`, `matchId` and server receipt timestamp `at`. Score records add `side`, `delta`, optional `expectedRevision`; preference records add `viewerId`, `enabled` and (for follows) `side`; telemetry records add `viewerId`, `position` in seconds. The shared log starts an ephemeral consumer group on every process startup, replays from the beginning and resolves readiness after the startup high watermark. Replay has no external side effects. The projection deduplicates terminal operation IDs and applies only the first valid record for an ID. Invalid direct topic records are logged/count as invalid and do not mutate the domain.

The server synchronously reserves each HTTP operation ID before append. Reusing an ID with identical input returns its observed operation rather than publishing again; changing its input returns 409. Domain updates happen only in consumer callbacks. Failed/timed-out append can mean **unknown outcome**, not “not published.” The same process preserves this uncertainty, and a later consumer record can resolve it. Do not blindly retry, especially with a new ID: check the operation, inspect the topic and establish what happened. After an app restart, an unobserved operation may return 404; absence from an in-memory map is not proof it never reached the broker.

## API and metrics reference

| Endpoint | Meaning |
| --- | --- |
| `GET /health` | 200 `{ready:true}` after replay; 503 during initialization. |
| `GET /api/state?viewer=ID` | Fixtures plus projected scores/revisions, this viewer's preferences/playback, latest 60 consumed events and metrics. |
| `GET /api/feed?viewer=ID` | SSE `state` snapshots after consumed events and every ten seconds; slow clients are closed rather than buffered indefinitely. Maximum 100 streams. |
| `POST /api/events` | Bounded JSON input; same-origin browser mutations; event schema validation; 200 completed/error or 202 pending, 503 unknown publish outcome. |
| `GET /api/operations/ID` | Pending/unknown/completed/error operation, event, error and consumed offset; 404 means not observed in this process. |
| `GET /metrics` | Plain Prometheus exposition, no metrics library required. |

IDs must contain 1–80 ASCII letters, digits, underscores or hyphens. Mutations require `application/json`; untrusted browser origins receive 403. This is not authentication: command-line clients have no Origin requirement. Local viewer identifiers are demonstration identities, not accounts. Any local client can submit score events or query another viewer's preferences. Do not expose these ports publicly.

Metrics include `sports_applied_total`, `sports_rejected_total`, `sports_invalid_total`, `sports_duplicates_total`, `sports_publish_errors_total`, `sports_media_requests_total`, `sports_play_total`, `sports_pause_total`, `sports_heartbeat_total` and `sports_active_viewers`. Active viewers are those with a projected playing session whose latest timestamp is less than 30 seconds old, counted once across matches. A heartbeat does not turn a paused viewer into a playing viewer. Visibility limits background-tab telemetry; counts are demo activity estimates, not billing or fraud-resistant audience analytics. Domain/telemetry counters rebuild through replay; media requests and publish failures describe the current process only.

## Replay and meaningful verification

```bash
./labs/run sports restart app
curl --fail "$APP/health"
curl --fail "$APP/api/state?viewer=reader" | jq '.matches'
just check sports
just test sports
```

An app-only restart retains the broker volume. Wait for readiness, then the same retained log reconstructs the scores and preferences. The seeded baseline in `fixtures.mjs` is deterministic; all later scores are retained additive events, not random timers. The broker's lab retention is finite (24 hours), so an expired prefix cannot reconstruct an authoritative lifetime scoreboard. Keep this project disposable. Do not mistake RF1, one host or a retained Docker volume for a recovery strategy.

`labs/sports/e2e.sh` requires the started runner project and the pinned shell's Node, curl/jq and FFmpeg tools. It exercises four sport routes, retrieves every actual media file, asserts MP4 range bytes and H.264 properties with ffprobe, decodes frames with FFmpeg, emits/consumes scores, checks duplicate IDs and stale revisions, tests follow/watchlist removal and telemetry, verifies origin/validation errors, metrics/SSE, then restarts **only app** and compares replayed state. It does not claim native browser playback from an API check. For browser verification, play the clip and confirm advancing `currentTime`, pause it, navigate across sports and confirm consumed telemetry/score changes; check keyboard focus, captions, narrow layout and theme switching.

## Source research, rights and pinning

Primary sources were read on **2026-10-13** to decide fixture identity and media boundaries. Source observations are not asset licenses:

| Primary source | What it establishes / design consequence |
| --- | --- |
| [Air Bud Entertainment: World of Air Bud](https://www.airbud.com/air-bud) | Producer descriptions distinguish basketball in *Air Bud*, Timberwolves/football in *Golden Receiver*, soccer in *World Pup*, baseball and beach volleyball in later films. The lab selects four sports rather than incorrectly labelling every sequel basketball. |
| [Disney: Air Bud: Golden Receiver](https://movies.disney.com/air-bud-golden-receiver) | Disney independently names the school football Timberwolves. This is **not** a Minnesota NBA franchise reference. The basketball Timberwolves exhibition is a lab fixture association, not a claim of a licensed roster or canonical game. |
| [Disney: The Mighty Ducks](https://movies.disney.com/the-mighty-ducks) | The 1992 film description explicitly identifies pee-wee hockey. Mighty Ducks is placed on the ice, not a real NHL team roster. Northstar Blades and the fixture score/venue are original lab inventions. |
| [Warner Bros. Discovery's Space Jam announcement, May 7, 2026](https://www.prnewswire.com/news-releases/warner-bros-discovery-tips-off-the-30th-anniversary-of-space-jam-302765723.html) | The issuer names Tune Squad versus Monstars and carries a Warner Bros. copyright/trademark notice. The lab uses the original rivalry as **text only**; it does not substitute the later film's Goon Squad, download the offered press assets or claim broadcast rights. This is one issuer's release, not independent licensing corroboration. |
| [U.S. Copyright Office: What Does Copyright Protect?](https://www.copyright.gov/help/faq/faq-protect.html) | Names/titles are not protected by copyright in isolation, but names may have trademark protection and logo artwork may have copyright. Textual references are not a blanket trademark or character-use clearance. |
| [U.S. Copyright Office: permission and fair-use FAQ](https://www.copyright.gov/help/faq/faq-fairuse.html) | Online availability and educational purpose do not automatically authorize copies or entertainment performance; there is no universal safe clip duration. The conservative implementation excludes posters, film stills/clips, logos, voices and soundtracks completely. |
| [FFmpeg filter documentation](https://ffmpeg.org/ffmpeg-filters.html#drawbox) | `color`, `drawbox`, `drawgrid` and time-based `overlay` allow original procedural generation with no third-party visual inputs. The exact filter graph lives in `default.nix`. |
| [RFC 9110, HTTP range requests](https://www.rfc-editor.org/rfc/rfc9110.html#name-range-requests) | MP4 seeking uses local HTTP byte ranges instead of treating the Kafka event stream as a media transport. This lab supports one range, not multipart range responses. |

The title/fixture references are neither endorsements nor proof of rights to exploit a franchise. The primary descriptions settle the sport mapping, but do **not** establish a complete territorial chain of title, sublicensing authority or trademark clearance; those remain unknown and must be reviewed for public/commercial use. Replace reference names with original names if the use requires that boundary. The synthetic clips are original geometric animations, not altered copyrighted clips; plain system fonts and lab-written CSS/HTML supply the visual identity. No remote font, analytics script, CDN or image is loaded. ESPN inspiration is editorial hierarchy only; no ESPN marks/assets are reproduced.

The root `flake.lock` pins Nixpkgs, thereby Node/FFmpeg and encoder dependencies; `labs/common` pins the KafkaJS dependency to 2.2.4 and the shared Compose configuration supplies the exact broker/Console image pins. Sports adds no npm package and fetches no binary outside these inputs. Updating the lock or common pins changes the build inputs; inspect those files for the exact versions/digests rather than assuming upstream `latest`. FFmpeg generation happens in a Nix derivation and outputs are copied into the immutable application image. Browser H.264 support and codec/patent suitability for the intended deployment still require review.

## What a production regional service needs

The demo intentionally separates *logical* media and control planes but shares one app process/host; this is not physical fault isolation. Production needs licensed rights by event, sport, territory and time window; entitlement/authentication, geographic enforcement and applicable privacy/retention policy; redundant ingest and transcode; multiple bitrate ladders/manifests, object storage origins and regionally redundant CDN delivery; and secure signed media authorization with monitored player quality metrics.

For the control plane, use replicated brokers across failure domains, workload-appropriate partitioning, authoritative durable materialized views/snapshots, schema evolution, idempotency retained beyond event retention and authorized score producers. Define recovery point/time objectives independently for media manifests/objects, score events, viewer preferences and live-state services. Replicate to the recovery region, fence old writers during failover, rehearse consumer rehydration and avoid counting replayed telemetry as fresh viewing. [Redpanda's disaster-recovery documentation](https://docs.redpanda.com/current/manage/disaster-recovery/) describes cross-region Shadowing and topic/cluster restore; availability and prerequisites depend on the pinned edition/version. The single local broker here provides none of those multi-region guarantees. A recovered score service cannot repair lost media, and a playable cached clip cannot prove scoreboard freshness.

Revisit the research if fixtures/franchises change, any protected asset is added, distribution becomes public/commercial, territorial rights are required, or the broker/browser/toolchain pins change. Obtain qualified rights advice instead of treating this lab as legal clearance.
