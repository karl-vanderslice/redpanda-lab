---
hide:
  - toc
---

# Courtside Assembly

![Proposed Courtside Assembly system topology](../assets/blueprints/sports.svg)

Follow two paths through the proposed system: a Redpanda consumer serves revision-checked score views, while a separate CDN delivers video. Authenticated controls keep score authority distinct from viewer telemetry. Media bytes travel through origin, transcoding and object storage, leaving the Kafka log for events.

[Scope and deployment assumptions](./index.md).

## Lab and proposal

In the lab, one ordered `sports.events.v2` topic carries score, preference and playback records, and the app serves local MP4 files directly. The proposed media-provider integration separates analytics and adds authorized publishing, captions, object storage and CDN delivery.

## Authority and effects

The score owner controls revisions and permissions. Media owns rights, renditions, captions and HTTP range/cache behavior. Analytics/privacy must define telemetry identity, session windows, late data and retention before splitting the stream. Fresh viewer counts are not durable unique-human accounting, and analytics cannot decide scores.

Replay the complete retained score, preference and playback prefix through a captured offset frontier before admitting new controls. Reconstruction must not emit new playback events or fetch replacement media. Video availability and media-request counters remain outside the event-log restore contract.

[Lab guide](../labs/sports.md) · [D2 source](sources/sports.d2) · [PNG export](../assets/blueprints/sports.png)
