---
description: Play original local sports animation while separately observing scores, watchlist preferences, and broker-backed playback telemetry.
---

# Courtside Assembly

Courtside Assembly lets you browse the fictional Crosswater Assembly exhibition slate, watch local field animations, and follow scores, watchlist preferences and playback events through Redpanda. The Nix-built image serves the silent geometric animations directly; the log carries the events while video follows its own delivery path.

The clubs, events and media are original fiction. You can explore the portal with local assets; using a real event, team identity, film footage or external stream would require a separate integration and rights review.

## Run and watch

Use the [shared setup and lifecycle commands](../reference/commands.md):

```bash title="Start the synthetic sports portal"
./labs/run sports up
./labs/run sports urls --json
```

The first image build generates four clips with pinned FFmpeg. Runtime needs no remote media, host encoder, model, account or API key.

1. Open the app and wait for **Scoreboard connected**. Choose **Ice hockey**, then the Bracken Quays / Harthwick Bearings match (`bracken-rink`).
2. Use the native player's **Play** control. Confirm that the position advances through the silent geometric animation. No video autoplays; captions describe the animation rather than a real broadcast.
3. Under **Record a score increment**, keep **Bracken Quays** as the scoring club and the one-goal increment. Select **Emit score event**. The score changes only after the command is consumed, independently of the video's position.
4. Select **Add to watchlist**, then open **Watchlist** in the sports navigation. If the button already reads **Remove from watchlist**, leave it saved. The match appears in the watchlist after its preference is consumed. Return to the match to inspect **Behind the desk** and **The event wire**.

The native player also supports pause, seek, volume and fullscreen. Direct routes and browser back/forward select matches. **Pause scoreboard updates** freezes the rendered score/event view, not consumption, video or playback telemetry; **Refresh scoreboard** reads one snapshot without resuming automatic updates.

If **Control plane disconnected** appears, select **Refresh scoreboard** before issuing another action. A confirmed action can already be in the log while the rendered view is stale. Do not submit it again to refresh the page.

| Match ID | Sport | Home / away | Venue |
| --- | --- | --- | --- |
| `elmreach-court` | Basketball | Elmreach Surveyors / Morrowbank Pylons | Alderstep Hall |
| `rillgate-court` | Basketball | Rillgate Arcs / Oxbend Kilns | Rillgate Exchange |
| `bracken-rink` | Hockey | Bracken Quays / Harthwick Bearings | Bracken Icehouse |
| `ternwick-pitch` | Soccer | Ternwick Weavers / Larchmere Posts | Ternwick Common |
| `elmreach-gridiron` | Football | Elmreach Surveyors / Flintwash Switches | Elmreach Yard |

Watchlist membership uses match IDs. Follows use club display names, so following Elmreach Surveyors covers both its basketball and football fixtures. Control-room increments are basketball 1/2/3 points, hockey/soccer 1 goal, and football 1/2/3/6 points. They are not a complete officiating rules engine. Stage/quarter labels and starting scores are fixed fixtures, not live clocks.

Playback sends `play`, `pause` and visible-tab heartbeats every ten seconds. Leaving playing media sends pause for the previous match. Preference confirmation waits for a projected offset. Viewer storage is optional; denied storage creates a new viewer on reload. Theme follows system preference unless explicitly changed.

SSE connectivity is score/control connectivity, not media availability. Telemetry failure leaves playback available but stops telemetry until **Reconnect control plane**. Pause freezes the rendered state/event wire only: consumption and telemetry continue. Refresh discards the old subscription's queued updates, reads one snapshot and stays paused if automatic updates are off. Resume catches up; same-match updates do not reload the player or reset score selections.

Successful snapshots clear scoreboard-read errors, not unconfirmed-operation or media errors. Refreshed scores do not prove that a prior command completed.

## Score and operation contract

`sports.events.v2` has one partition, RF1 and match-ID keys. Records contain `schema:1`, stable `id`, `kind`, `matchId`, server receipt Unix millisecond `at`, plus:

| Kind | Fields |
| --- | --- |
| `score` | `side:"home"` or `"away"`, supported `delta`, optional nonnegative integer `expectedRevision` |
| `follow` | `viewerId`, boolean `enabled`, `side` |
| `watchlist` | `viewerId`, boolean `enabled` |
| `play`, `pause`, `heartbeat` | `viewerId`, numeric `position` in seconds, 0–86,400 |

IDs use 1–80 ASCII letters, digits, underscores or hyphens. POST bodies are bounded to 16,384 bytes and require JSON media type; foreign browser origins receive 403. Viewer IDs are not accounts. Any local caller can score or inspect another viewer, and CLI requests need no Origin. Keep ports private and use synthetic data.

```bash
app=$(./labs/run sports urls --json | jq -er .app)
id="reader_$(date +%s)_$RANDOM"
jq -nc --arg id "$id" '{id:$id,kind:"score",matchId:"bracken-rink",side:"home",delta:1}' |
  curl --fail-with-body -sS -H 'content-type: application/json' \
    --data-binary @- "$app/api/events"
curl -fsS "$app/api/operations/$id"
curl -fsS "$app/api/state?viewer=reader" | jq '.matches[] | select(.id=="bracken-rink")'
./labs/run sports rpk topic describe sports.events.v2
./labs/run sports rpk topic consume sports.events.v2 --offset start --num 10
```

Bounded broker consumption waits if fewer records exist; lower the count or interrupt it. Poll a `pending` operation until `completed` or `error`. Completion includes consumed partition/offset, not merely an append acknowledgment. For optimistic scoring, supply the projected `expectedRevision`; the first consumed change against that revision succeeds and later stale operations become `error`. Read the new state before a new operation. Omitting revision intentionally requests an unconditional additive score.

## API and metrics

| Route | Result |
| --- | --- |
| `GET /health` | 200 after replay; 503 while initializing |
| `GET /api/state?viewer=ID` | Fixture scores/revisions, viewer preferences/playback, latest 60 events, metrics |
| `GET /api/feed?viewer=ID` | SSE `state` on consumption and every ten seconds; at most 100 streams; slow clients close |
| `POST /api/events` | 200 completed/error, 202 pending, 503 unknown publication |
| `GET /api/operations/ID` | Pending/unknown/completed/error with event/error/offset; 404 not observed |
| `GET /metrics` | Prometheus text |
| `/`, `/sport/SPORT`, `/match/ID` | Browser routes |
| `GET /captions.vtt` | Local descriptive captions |
| `GET`/`HEAD /media/SPORT.mp4` | Local media and single byte-range retrieval |

Metrics are `sports_applied_total`, `sports_rejected_total`, `sports_invalid_total`, `sports_duplicates_total`, `sports_publish_errors_total`, `sports_media_requests_total`, `sports_play_total`, `sports_pause_total`, `sports_heartbeat_total` and `sports_active_viewers`. Active viewers have a projected playing session younger than 30 seconds, counted once across matches. Heartbeats cannot start paused sessions. Visibility and wall-clock freshness make these estimates, not billing-grade audience or watch-time accounting. Domain/telemetry counters replay; media requests/publication errors are process-local.

## Media is independent of event delivery

Four sport loops are H.264/yuv420p, 960×540, 24 fps, 18 seconds, silent fast-start MP4. Nix uses `color`, `drawbox`, `drawgrid` and timed `overlay`, encodes with libx264 at CRF 24, medium preset and one build thread, and removes metadata. Matches reuse their sport loop. HTTP supports HEAD, one standard or suffix range and 206/416, with a bounded file stream and `max-age=3600`. It does not implement multipart ranges, adaptive bitrate, HLS, DRM, live audiovisual ingest or score overlays. [RFC 9110 §14](https://www.rfc-editor.org/rfc/rfc9110#section-14) defines range semantics.

Media and event paths share this process/host, so logical separation is not fault isolation. Broker recovery cannot repair missing video, and cached playback does not prove fresh scores.

## Replay, unknown publication and catalog cutover

Startup uses a fresh group, replays from zero through the pre-start high watermark, then becomes ready. Consumer callbacks alone apply domain state. The first valid terminal operation ID wins; later direct duplicates do not repeat effects. Invalid direct topic records are counted/logged without mutation, except schema-1 records naming a match outside the current fixture catalog, which stop replay. General direct-topic production is unsupported.

HTTP reserves IDs before append. Identical reuse returns its operation; changed input returns 409. A failed or timed-out append may be accepted later. The process keeps uncertainty until consumption resolves it. Inspect the original operation and topic; do not replace its ID or blindly submit again. A 404 after restart is not proof of non-publication. App-only restart preserves broker data:

```bash
./labs/run sports restart app
```

The [full-prefix policy](../reference/tuning.md#topic-policy) retains event history until disposal and rejects missing history or extra partitions. There are no snapshots; operation receipts and viewer state grow despite the 60-row feed. [Log close waits for in-flight sends](../reference/tuning.md#recovery-limits-are-application-specific); forced stop still needs reconciliation.

The fictional catalog starts a new lineage in `sports.events.v2`. The previous `sports.events` topic stays intact in the same broker volume; this app neither reads nor writes it. No records are renamed, reinterpreted or deleted, and no old-ID aliases exist. Old bookmarks show unknown-match state rather than bind to a new outcome. Export old records and retain their original source catalog before explicitly disposing the lab, which deletes both histories.

## Workload tuning and rights

`KAFKA_BROKERS` defaults to `redpanda:9092` and accepts comma-separated bootstrap addresses. The runner supplies `LAB_APP_IMAGE` and loopback `APP_PORT`; the image listens on 3000. No runtime media-CDN, score-window, heartbeat, freshness, stream-limit or feed-size settings exist. Those values and media encoding are code-owned; changes require source/image review. The 100-stream limit is an admission ceiling, not measured safe capacity.

Measure SSE snapshot bytes/fanout, consumed score lag and media bandwidth separately. Proposed object storage/CDN delivery must preserve range/cache correctness and rights. Do not discard scores or relax revisions for throughput. See [client and host limits](../reference/tuning.md).

Names, clubs, venues, captions and animations are authored fiction; no posters, film stills/clips, logos, voices, soundtracks, external fonts or third-party stream assets are used. Shared KafkaJS is 2.2.4; the lock pins Node/FFmpeg/encoders and broker/Console inputs. Adding real media requires territorial/time-window rights, entitlement and qualified legal review. Online availability or educational use is not blanket authorization, and there is no universally safe clip duration: see the [U.S. Copyright Office permission/fair-use FAQ](https://www.copyright.gov/help/faq/faq-fairuse.html). Territorial chain of title, sublicensing, trademark clearance and browser codec/patent suitability remain unverified; this lab grants no media rights.

## Proposed production view

[Production blueprint](../blueprints/sports.md).

The proposal separates score authority from media publishing. Authorized scorers get fenced ownership, durable projections and their own recovery policy. A media delivery system adds redundant ingest and transcoding, object origins, regional CDN delivery, captions, entitlement checks and player-quality monitoring. Each part needs suitable recovery objectives and rights/privacy policy. Preserve the distinction during restore: old heartbeat records describe past activity and must not recreate a fresh audience.

## Scenario coverage

`bash labs/sports/e2e.sh` needs a running lab and the pinned Node/curl/jq/FFmpeg environment. It exercises media properties, decoded frames/ranges, score duplicates/stale revisions, preference removal, telemetry, Origin errors, metrics/SSE and exact restart equality. [Commands](../reference/commands.md) describes `just check sports` and `just test sports`. API proof does not prove native playback; browser checks must observe advancing time, navigation/pause, captions, focus and themes.
