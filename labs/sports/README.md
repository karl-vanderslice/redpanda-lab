# Courtside Assembly

A fictional portal for the original Crosswater Assembly exhibition slate. Silent synthetic H.264 loops come from the Nix image; Redpanda carries scores, preferences and playback telemetry, not video. No film footage, real event or third-party stream is included.

From the repository root, use the [shared setup](../../README.md), then:

```bash
./labs/run sports up
./labs/run sports urls --json
```

Open a match, play/seek its native media, change a score, add a watchlist entry or follow a club. Following Elmreach Surveyors covers its basketball and football fixtures. Pause freezes the displayed score/event view only; telemetry and consumption continue. Refresh reads one snapshot without resuming.

[Guide: fixtures, media/API, rights, replay and recovery](../../docs/labs/sports.md). Viewer IDs are not accounts; anyone with local access can score. Keep ports private. Preserve uncertain operation IDs and inspect receipts/topic rather than blindly creating another ID. Broker failure does not by itself remove local media playback.

The fictional catalog uses `sports.events.v2`; the previous `sports.events` topic remains intact and unread/unwritten by this app. There are no old-ID aliases or record rewrites. Retain old records and their original source catalog before disposal, which deletes both histories. The [full-prefix policy](../../docs/reference/tuning.md#topic-policy) has no snapshots; viewer state and receipts also grow without bounds.

```bash
just check sports
just test sports
```

`bash labs/sports/e2e.sh` needs a running stack and pinned Node/curl/jq/FFmpeg. It checks generated media/ranges, scores, preferences, telemetry and exact replay; API proof does not establish native playback. Public/commercial media delivery needs separate rights and codec review, not an assumption of clearance from this lab.
