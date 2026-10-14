---
hide:
  - toc
---

# Courtside Assembly

![Proposed Courtside Assembly system topology](../assets/blueprints/sports.svg)

A Redpanda consumer serves revision-checked score views while the viewer receives video through a separate CDN. Authenticated controls distinguish score authority from viewer telemetry. Media bytes flow through origin, transcoding and objects, never the Kafka log.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

The lab combines score, watchlist and playback records in one ordered `sports.events.v2` topic and serves local MP4 files directly. The proposal separates analytics and adds authorized media publishing, captions, objects and CDN delivery; no media-provider integration exists.

## Authority and effects

The score owner controls revisions and permissions. Media owns rights, renditions, captions and HTTP range/cache behavior. Analytics/privacy must define telemetry identity, session windows, late data and retention before splitting the stream. Fresh viewer counts are not durable unique-human accounting, and analytics cannot decide scores.

Replay the complete retained score, watchlist and playback prefix through a captured offset frontier before admitting new controls. Reconstruction must not emit new playback events or fetch replacement media. Video availability and media-request counters remain outside the event-log restore contract.

[Lab guide](../labs/sports.md) · [D2 source](sources/sports.d2) · [PNG export](../assets/blueprints/sports.png)
