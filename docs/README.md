# Pebble — documentation

Working documents for the Pebble video/audio downloader (Python backend + React
Native Android app).

| Doc | Contents |
| --- | --- |
| [00-overview.md](00-overview.md) | What the app is, who it is for, what makes it different |
| [01-architecture.md](01-architecture.md) | Hybrid delivery rule, resume model, what is already built |
| [02-tier-1.md](02-tier-1.md) | **BUILT** — clip trim, fit-to-size, audio metadata |
| [03-tier-2.md](03-tier-2.md) | v1.1 candidates — vault, Wi-Fi queue, subtitles, library quality |
| [04-tier-3-deferred.md](04-tier-3-deferred.md) | Deliberately not building, with reasons |
| [05-entry-points.md](05-entry-points.md) | How a link gets into the app: share sheet, QS tile, clipboard |
| [06-design-system.md](06-design-system.md) | Soft Neumorphic direction + a contrast audit that needs a decision |
| [07-roadmap.md](07-roadmap.md) | Build order and the decision log |
| [08-running-and-testing.md](08-running-and-testing.md) | **How to run it, which commands, and every failure we hit** |

Code lives in [`../backend`](../backend/README.md) (API) and
[`../mobile`](../mobile/README.md) (Android app).

## Status key

Used consistently across these documents.

| Marker | Meaning |
| --- | --- |
| **BUILT** | Implemented and verified against live traffic |
| **IN PROGRESS** | Being implemented now |
| **PLANNED** | Specified here, not yet written |
| **DEFERRED** | Deliberately not building, reason recorded |

## Conventions

- Sizes in this repo are **bytes** on the wire and **MB** in user-facing copy.
- Durations are **float seconds** everywhere, including clip in/out points.
- All backend settings are environment variables prefixed `VAD_`.
- Design tokens are owned by the `pebble-neumorphic-rn-android` skill, not by
  these documents. Where a doc mentions a colour or radius it is quoting the
  skill, and the skill wins on any conflict.
