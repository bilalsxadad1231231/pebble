# Tier 1 — committed for v1

Status: **BUILT** — 79 tests passing, all three verified against real ffmpeg and live yt-dlp

Three features, chosen because they all lean on the ffmpeg pipeline that is
already built and verified. None of them require new architecture — they are new
parameters on `POST /prepare` plus new post-processing steps.

Together they change the pitch from "another downloader" to *get exactly the
piece you want, at a size your phone can hold*.

---

## Shared consequences

Read this before the individual specs.

**All three force `delivery: "muxed"`.** A trimmed, transcoded or retagged file
cannot be a direct CDN handoff — by definition we are producing a new file. So:

- `delivery.decide()` gains a short-circuit: if any Tier 1 option is requested,
  return `MUXED` regardless of the format's own properties.
- More traffic flows through our server. Given YouTube video is already 100%
  muxed, the marginal cost lands mainly on Instagram/TikTok clips.
- `size` on the ticket becomes an **estimate** until the job reaches `ready`.
  The app must treat pre-`ready` sizes as approximate and re-read `ticket.size`
  when the job completes.

**All three extend the refresh-token payload.** The token must carry the Tier 1
options, otherwise a refresh silently re-prepares a *different* file from the one
the user asked for. Payload keys stay short: `c` (clip), `z` (size budget),
`m` (metadata flag).

**Concurrency.** Trimming and fit-to-size are CPU-bound in a way plain stream
copying is not. `VAD_MAX_CONCURRENT_MUXES` (default 2) now guards genuinely
expensive work; a fit-to-size job on a 20-minute video can occupy a core for
minutes. Transcode jobs get their own tighter semaphore rather than sharing the
merge budget.

---

## 1. Clip trimming

**Problem.** The user wants 35 seconds out of a 12-minute video. Every other app
makes them download all 12 minutes and trim it elsewhere, or not at all.

**Why others don't have it.** Most consumer downloaders wrap a naive downloader
with no ffmpeg in the pipeline. We already run ffmpeg for every YouTube merge.

### API

```jsonc
POST /api/v1/prepare
{
  "url": "https://youtube.com/watch?v=...",
  "format_id": "137",
  "kind": "video",
  "clip": { "start": 45.0, "end": 80.5 }   // float seconds, optional
}
```

### Rules

| Rule | Behaviour |
| --- | --- |
| `start >= 0` | else 422 `invalid_clip` |
| `end > start` | else 422 `invalid_clip` |
| `end - start >= 1.0` s | else 422 `invalid_clip` — sub-second clips are a UI bug, not a request |
| `end <= duration` when duration is known | clamped to duration rather than rejected; live streams report no duration, so the check is skipped |
| `clip` present | forces `delivery: "muxed"` |

### Implementation

yt-dlp's `download_ranges` option, with keyframe forcing:

```python
from yt_dlp.utils import download_range_func

opts["download_ranges"] = download_range_func(None, [(start, end)])
opts["force_keyframes_at_cuts"] = True
```

`force_keyframes_at_cuts` matters. Without it ffmpeg cuts on the nearest
keyframe, which on a 2-second GOP can land the cut several seconds from where the
user placed it — the single most common complaint about trim features. With it,
yt-dlp re-encodes a short segment around each cut so the boundary is exact. The
cost is a few seconds of CPU, paid only around the two cut points, not across the
whole clip.

### Filename

Clip bounds go in the name so two clips from one source do not collide:

`Sunset timelapse over Karachi [0-45 to 1-20].mp4`

Formatted `M-SS`, with the existing `safe_filename()` sanitiser applied after.

### Size estimate

`estimated_bytes = source_bytes * (clip_duration / source_duration)`, marked
approximate. Bitrate is not uniform across a video, so this is a hint for the UI,
never a promise. Null when either duration is unknown.

---

## 2. Fit-to-size

**Problem.** A 4K source is 2.1 GB. The user has 400 MB free and wants the video
more than they want the resolution. Choosing between "1080p" and "720p" is
guessing at an outcome they cannot see.

**Why it matters here specifically.** Storage pressure on mid-range Android is
the defining constraint of the target market, and no mainstream downloader lets
you state a budget.

### API

```jsonc
POST /api/v1/prepare
{
  "url": "...",
  "format_id": "137",
  "kind": "video",
  "target_size_mb": 100
}
```

### Bitrate maths

```
overhead_factor   = 0.95                       # container + muxing slack
audio_bitrate     = 128_000                    # bits/s, fixed
budget_bits       = target_size_mb * 1_000_000 * 8 * overhead_factor
video_bitrate     = (budget_bits / duration_s) - audio_bitrate
```

MB here is 10^6, not 2^20 — it matches what a file manager shows the user.

### Guard rails

| Condition | Response |
| --- | --- |
| `video_bitrate < 200_000` (200 kbps) | 422 `target_too_small`, with the smallest workable size in the detail so the UI can suggest it |
| `duration` unknown or 0 | 422 `duration_unknown` — a budget is meaningless without one |
| `duration > VAD_MAX_TRANSCODE_SECONDS` (default 1200 = 20 min) | 422 `source_too_long`. Two-pass encoding a feature-length video on a small VPS is hours of CPU. Long sources must be trimmed first — which is exactly what feature 1 is for |
| `target_size_mb` larger than the source | Accepted, no transcode; falls through to a normal merge |

The floor is a real constraint, not caution: below roughly 200 kbps H.264 at any
usable resolution becomes unwatchable, and shipping a file the user deletes on
sight is worse than refusing with a number they can act on.

### Encoding

Two-pass libx264 — one-pass VBR overshoots a hard budget badly:

```
ffmpeg -y -i in.mp4 -c:v libx264 -b:v {v} -pass 1 -an -f mp4 NUL
ffmpeg -y -i in.mp4 -c:v libx264 -b:v {v} -pass 2 -c:a aac -b:a 128k out.mp4
```

Runs as a post-processing step after yt-dlp has produced the merged source, not
inside yt-dlp. Pass-log files are written into a per-job temp directory and
removed with the job. The null sink differs by platform (`NUL` on Windows,
`/dev/null` elsewhere) and is selected at runtime.

**Combines with clip trimming.** Trim first, then fit the *clip* to the budget —
the duration used in the bitrate calculation is the clip duration. This
combination is the strongest thing in Tier 1: *this 30 seconds, under 20 MB.*

### Progress

Two-pass means job progress is no longer just yt-dlp's download percentage.
Progress is reported in three weighted phases so the dial moves smoothly:

| Phase | Weight |
| --- | --- |
| Download + merge | 0.00 → 0.50 |
| Pass 1 | 0.50 → 0.70 |
| Pass 2 | 0.70 → 1.00 |

ffmpeg progress is parsed from `-progress pipe:1` (`out_time_us` against the
known duration).

---

## 3. Audio with real metadata and cover art

**Problem.** Every downloader produces `video_1737.mp3` with no tags. It lands in
the user's music player as "Unknown Artist — Unknown Album" with a blank tile.
The music use case is enormous and universally botched.

**Cost to us.** Almost nothing — yt-dlp has post-processors for both, and we
already run the mp3 transcode.

### API

```jsonc
POST /api/v1/prepare
{
  "url": "...",
  "format_id": "140",
  "kind": "audio",
  "audio_format": "mp3",
  "embed_metadata": true
}
```

`embed_metadata` defaults to `true` for `kind: "audio"`.

### Tag mapping

Extractor fields are inconsistent across platforms, so each tag falls back:

| Tag | Source, in order |
| --- | --- |
| `title` | `track` → `title` |
| `artist` | `artist` → `uploader` → `channel` |
| `album` | `album` → `playlist_title` → *omitted* |
| `date` | `release_date` → `upload_date` |
| `comment` | source URL — so the file remembers where it came from |

An absent tag is omitted rather than written as an empty string; empty tags
display worse than missing ones in most players.

### Cover art

```python
opts["writethumbnail"] = True
opts["postprocessors"] = [
    {"key": "FFmpegExtractAudio", "preferredcodec": audio_format, "preferredquality": "0"},
    {"key": "FFmpegMetadata", "add_metadata": True},
    {"key": "FFmpegThumbnailsConvertor", "format": "jpg"},
    {"key": "EmbedThumbnail", "already_have_thumbnail": False},
]
```

Order matters: extract audio, write tags, convert the image, embed it.

**The webp trap.** YouTube serves webp thumbnails, and ID3v2 cannot carry webp —
the embed silently no-ops and the user gets a tagged file with no artwork.
`FFmpegThumbnailsConvertor` must run before `EmbedThumbnail`. This is the failure
mode most implementations ship with, so it gets an explicit test.

Cover art is embedded, not merely downloaded alongside. A sidecar `.jpg` is
invisible to Android's media scanner.

### Container support

| Format | Tags | Cover art |
| --- | --- | --- |
| `mp3` | ID3v2.4 | Yes, after jpg conversion |
| `m4a` | iTunes atoms | Yes |

`m4a` with `embed_metadata` now forces `muxed`, where previously a bare m4a
stream was a direct handoff. The app should default `embed_metadata` to `true`
for audio and let the user turn it off to get the faster direct path.

---

## Test plan

Unit tests mock the network; ffmpeg paths are exercised against a small generated
fixture rather than live traffic.

- [x] Clip validation: negative start, inverted range, sub-second span, end past duration
- [x] Clip forces `muxed` even for a progressive format that would be `direct`
- [x] Clip filename encodes bounds and stays filesystem-safe
- [x] Bitrate maths matches the worked example below
- [x] `target_too_small` returns the minimum workable size in its detail
- [x] `source_too_long` fires above the configured ceiling
- [x] Clip + fit-to-size together compute bitrate from the **clip** duration
- [x] Refresh token round-trips all three options; a refreshed ticket describes the same file
- [x] Tag fallback chain picks `uploader` when `artist` is absent
- [x] Thumbnail convertor precedes embed (webp regression guard)
- [x] Progress crosses the three phase boundaries monotonically

### Verified live

| Check | Result |
| --- | --- |
| Two-pass fit-to-size, 1 MB budget on a 20 s source | 980,884 bytes — 98% of budget, under target |
| Clip 30.0–45.0 s from a 635 s YouTube source | duration exactly 15.00 s, both streams present, ~1 MB transferred |
| mp3 + metadata + cover art | `ID3` magic, real title/artist/date/comment, artwork embedded as **mjpeg** |
| Passlog and thumbnail temp files | cleaned up, none left behind |

### Worked example (fixture for the maths test)

```
target 100 MB, duration 300 s
budget_bits   = 100 * 1e6 * 8 * 0.95   = 760_000_000
video_bitrate = 760_000_000 / 300 - 128_000
              = 2_533_333 - 128_000    = 2_405_333 bits/s  ~= 2405 kbps
```

---

## New settings

| Variable | Default | Purpose |
| --- | --- | --- |
| `VAD_MAX_TRANSCODE_SECONDS` | `1200` | Refuse fit-to-size above this source duration |
| `VAD_MAX_CONCURRENT_TRANSCODES` | `1` | Separate, tighter budget than merges |
| `VAD_TRANSCODE_AUDIO_BITRATE` | `128000` | Reserved audio bits in the budget calculation |
| `VAD_MIN_VIDEO_BITRATE` | `200000` | Floor below which fit-to-size is refused |

## Deliberately out of scope for Tier 1

- Multiple clip ranges from one source — the UI cost outweighs the demand.
- Resolution capping as a separate control; the size budget is the better lever
  and offering both invites contradictory requests.
- Client-side (on-device) ffmpeg. The maintained `ffmpeg-kit-react-native` was
  retired in early 2025, and this work is already server-side.
