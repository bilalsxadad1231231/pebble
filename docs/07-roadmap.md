# Roadmap and decision log

## Build order

```
[DONE]  0. Backend foundation
           resolve / prepare / refresh / jobs / files
           hybrid direct-vs-muxed rule
           range-based pause & resume, both paths
           46 tests, verified against live traffic

[DONE]  1. Tier 1 — backend
           clip trimming            (exact-frame cuts)
           fit-to-size transcode    (two-pass, lands 98% of budget)
           audio metadata + cover art

[DONE]  2. App foundation
           Expo SDK 57 + expo-router, TypeScript strict
           design tokens verbatim from the skill
           NeuRaised / NeuInset / NeuPressable + pressed-state swap
           shared SVG icon set (18 glyphs)

[DONE]  3. App core flow
           Home (paste -> resolve) / format picker / progress dial / Library
           download manager: queue, persisted resume state, refresh-on-expiry
           -- still open: foreground service + notification actions

[DONE]  4. Tier 1 — app surfaces
           clip scrubber, size-budget control, audio tagging toggle

[DONE]  4b. Making downloads usable
           gallery save via expo-media-library (Pebble album)
           foreground service so transfers survive backgrounding

[NOW]   5. Entry points
           share intent, QS tile, clipboard-on-foreground, app shortcut

        6. Tier 2
           Wi-Fi queue -> vault -> subtitles -> naming -> player -> dedupe -> reclaim
```

### Why this order

- **Tier 1 before the app** because it is pure backend work on a verified
  pipeline, and it changes the `/prepare` contract. Building the app against a
  contract that is about to change would mean writing the client twice.
- **Dev build before the first screen.** Share intent, QS tile and notification
  actions all need one. Discovering that halfway through means reworking the
  project setup.
- **Player is the Tier 2 keystone**, so it is not scheduled last despite being
  the largest item — duplicate detection and storage reclaim both get cheaper
  once it exists.

---

## Decision log

Decisions that were argued and settled. Each records what would reopen it.

| # | Decision | Reasoning | Reopen if |
| --- | --- | --- | --- |
| 1 | Backend, not on-device extraction | Extractors break weekly; a server fix reaches every user instantly, an app fix waits for updates. YouTube signature challenges are a permanent treadmill | Traffic grows enough that platform IP bans cost more than the update lag |
| 2 | Hybrid delivery, not always-server | A shared server IP is rate limited far sooner than a handset. Direct handoff keeps Instagram/TikTok traffic off us entirely | — |
| 3 | Android-only, no iOS | App Store guideline 5.2.3 makes this category effectively non-shippable on iOS | Apple policy changes |
| 4 | One delivery rule, called by both endpoints | Duplicated rules disagreed in production: the picker promised `direct` while prepare started a mux job | — |
| 5 | Ticket carries CDN headers | Verified live: direct downloads 403 without the extractor's `User-Agent`/`Referer` | — |
| 6 | `Accept-Encoding` stripped from tickets | Compression breaks the byte-offset arithmetic resume depends on | — |
| 7 | `content_stable` flag on tickets | Re-muxed artifacts are not byte-identical; resuming onto one silently corrupts the file | — |
| 8 | Soft Neumorphic direction | Calm tactile utility matches the positioning; chosen from mockups over five alternatives | — |
| 9 | Expo dev build, not bare RN | Config plugins cover share intent, notifications and the QS tile; bare buys nothing here | A native need appears that no plugin can express |
| 10 | Share sheet primary, QS tile second | Android 10+ blocks background clipboard reads outright; both these paths give the app focus legitimately | — |
| 11 | No floating overlay bubble | Special permission, OEM-blocked by default in the target market, no maintained library, weak UX case | Users ask post-launch — the QS tile plumbing is reusable |
| 12 | No accessibility-service clipboard monitoring | Straightforward Play policy violation | Never |
| 13 | No channel auto-sync | Most ban-attractive feature; would force paid proxies to protect the rest of the app | Downloads move to per-user IPs |
| 15 | Own foreground-service module, not a community package | No first-party Expo option; `expo-background-task` is deferred periodic work with a 15-min floor. Community foreground-service packages are thinly maintained | A maintained first-party module appears |
| 16 | Gallery publish is separate from the transfer | A denied permission must not lose a file that already downloaded | — |
| 14 | Fit-to-size capped at 20 min source | Two-pass encoding a long video on a small VPS is hours of CPU. Long sources trim first | Dedicated encoding capacity exists |

---

## Open questions

| Question | Blocking | Owner |
| --- | --- | --- |
| Apply the three-token contrast fix? ([06](06-design-system.md)) | First screen | User |
| Auth and rate limiting before any public exposure | Deployment, not development | — |
| Cookie support for private/age-gated posts | Nothing yet; will surface as user reports | — |
| Redis + shared volume for multi-worker deployment | Single worker is fine for now | — |

---

## Non-goals

Stated so scope creep is visible when it happens.

- iOS.
- A social layer, accounts, or cloud sync.
- Playlist or bulk-channel downloading (single posts and clips only).
- Editing beyond trimming and size budget — Pebble is not a video editor.
- Reimplementing extraction. yt-dlp stays.
