# Pebble — product overview

## What it is

An Android app that saves video and audio from Instagram, YouTube, Facebook,
TikTok, X, Reddit and the other platforms yt-dlp supports, backed by a small
self-hosted API that does the extraction and any ffmpeg work.

## Positioning

Downloading is a commodity. yt-dlp does the hard part for every app in this
category, so nobody is retained by the download itself — they are retained by
what happens around it. Pebble competes on three things existing apps handle
badly:

1. **Downloads that survive.** Pause, resume, expired CDN links, app kills,
   network changes. Most apps restart from zero; ours resumes from the byte.
2. **Storage that fits the phone.** The target user has a 64 GB Android device
   with 4 GB free. "1080p or 720p, hope for the best" is not a real choice.
3. **Files you can actually find and play.** Real titles, real audio tags, real
   cover art — not `video_1737.mp4` and an "Unknown Artist" row in the music app.

## Target user

Android-first, mid-range hardware (360–412 dp widths), metered mobile data,
storage-constrained. Saves reels and short video to rewatch offline, and music
video audio to listen to in a normal music player.

## Distribution reality

Recorded here so it is not rediscovered later:

- **Apple App Store is effectively closed** to this category (guideline 5.2.3).
  iOS is out of scope; this is an Android product.
- **Google Play prohibits YouTube downloading by name.** Direct APK and
  alternative stores are the realistic channels. This constrains which features
  are worth building — see [04-tier-3-deferred.md](04-tier-3-deferred.md).
- The backend is **self-hosted and single-tenant**. A shared server IP gets rate
  limited by the platforms far sooner than a handset does, which is why the
  hybrid delivery rule in [01-architecture.md](01-architecture.md) keeps as much
  traffic as possible off our server.

## Current state

| Component | Status |
| --- | --- |
| Backend API (resolve / prepare / refresh / jobs / files) | **BUILT**, 46 tests passing, verified against live YouTube and CDN traffic |
| Hybrid direct/muxed delivery rule | **BUILT** |
| Range-based pause/resume, both delivery paths | **BUILT**, byte-exact reassembly verified |
| Tier 1 features | **BUILT**, 79 tests passing, ffmpeg paths verified live |
| React Native app | **BUILT** — Expo SDK 57, typecheck + 18 tests + bundle clean, 21/21 expo-doctor |
| Tier 1 app surfaces | **BUILT** — clip scrubber, size budget, tagging toggle |
| Entry points, foreground service, gallery save | **PLANNED** |

## Naming

The product is **Pebble**. The backend package remains
`video-audio-downloader` and its env prefix remains `VAD_`; renaming it buys
nothing and would break the deployed configuration.
