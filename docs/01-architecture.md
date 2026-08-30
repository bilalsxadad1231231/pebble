# Architecture

Status: **BUILT** unless noted. 46 tests passing; verified against live YouTube
and CDN traffic.

## Shape

```
Android app  ──HTTP──>  FastAPI backend  ──>  yt-dlp (extraction)
     │                        │              └─>  ffmpeg (merge / transcode)
     │                        │
     │                        └─> storage/  (muxed artifacts, TTL swept)
     │
     └──────────────────> platform CDN  (direct downloads bypass us entirely)
```

The app talks to the backend to *decide* and to *prepare*, but for a large share
of downloads it fetches the bytes straight from the platform CDN. That is the
whole point of the hybrid rule below.

## The hybrid delivery rule

One function — `app/services/delivery.py::decide()` — owns this decision, and
both `/resolve` and `/prepare` call it. That is deliberate: an earlier version
had the rule duplicated, and the format picker promised `direct` while `/prepare`
silently started a mux job.

| Case | Delivery | Who serves bytes |
| --- | --- | --- |
| Progressive file (video + audio in one stream) | `direct` | platform CDN |
| Audio-only stream kept as-is | `direct` | platform CDN |
| Codecs unreported for a single complete file | `direct` | platform CDN |
| Video-only DASH (YouTube 1080p+) | `muxed` | us, after ffmpeg |
| Audio transcoded to mp3 | `muxed` | us, after ffmpeg |
| HLS / DASH segmented source | `muxed` | us, after ffmpeg |

### The unreported-codecs subtlety

`track_presence()` returns `True` / `False` / `None`. Lightweight extractors
(generic, Instagram, X) omit `vcodec`/`acodec` entirely for a single complete
file. **Unreported is not the same as absent.** Treating `None` as "no audio
track" is what caused the picker/prepare disagreement; a single-file source with
no codec info is `direct`.

### Practical consequence

YouTube no longer offers progressive video formats, so **every YouTube video
download goes through our server**. The `direct` path carries Instagram, TikTok
and X. This matters for bandwidth planning, and Tier 1 shifts the balance
further toward `muxed` — see [02-tier-1.md](02-tier-1.md).

## The download ticket

Every `/prepare` returns the same shape whichever path produced it, so the app
never branches on delivery mode:

```jsonc
{
  "job_id": "…",            // null on the direct path — no server work to track
  "status": "ready",
  "progress": 1.0,
  "ticket": {
    "delivery": "direct",   // or "muxed"
    "download_url": "…",
    "size": 42800000,       // may be null when the extractor gives no estimate
    "mime_type": "video/mp4",
    "filename": "Sunset timelapse over Karachi.mp4",
    "headers": { "User-Agent": "…", "Referer": "…" },
    "resumable": true,
    "content_stable": true,
    "expires_at": 1735689600,
    "refresh_token": "…"
  }
}
```

## Resume model

This is the core of the product. Three rules the app must follow:

**1. Persist the ticket, not the URL.** CDN links carry expiry parameters and die
in minutes to hours. Store `{ refresh_token, fileUri, bytesWritten }`. On resume,
if `expires_at` has passed, call `POST /refresh` with the token to get a fresh
URL, then range-request from `bytesWritten`.

**2. Replay `headers` on every request, range resumes included.** Most CDNs 403 a
bare GET. This was found live: a direct download returned 403 until the
extractor's `User-Agent`/`Referer` were replayed. `Accept-Encoding` is stripped
server-side on purpose — compression would break the byte-offset arithmetic that
resume depends on.

**3. Honour `content_stable`.**

| Value | Meaning | App behaviour |
| --- | --- | --- |
| `true` | Bytes behind the new URL are identical | Resume from `bytesWritten` |
| `false` | Artifact was swept and re-muxed; ffmpeg gives no byte-for-byte guarantee | **Discard the partial file, restart** |

`content_stable: false` only occurs on the muxed path after the artifact TTL has
expired. Direct re-resolves are always stable.

## Range serving

`app/utils/ranges.py` implements single-range `bytes=start-end` by hand rather
than relying on Starlette's file response, because resume correctness is the
product. Suffix ranges (`bytes=-500`), open-ended ranges (`bytes=500-`) and
clamping past EOF are supported; multi-range requests are deliberately ignored
and fall back to a 200. Unsatisfiable ranges return 416 with `Content-Range:
bytes */<size>`.

`HEAD /files/{id}` exists so the client can probe size and range support before
committing to a transfer.

## Job lifecycle

`pending → running → ready` (or `failed`), plus `expired` after TTL or cancel.

- `/prepare` blocks up to `VAD_PREPARE_TIMEOUT` (default 60 s) and then returns
  `pending`/`running` for the client to poll via `GET /jobs/{id}`.
- Artifacts live under `VAD_STORAGE_DIR` and are swept after `VAD_JOB_TTL`
  (default 6 h).
- `DELETE /jobs/{id}` cancels the task and deletes the artifact.

## Known limits

Recorded so they are not mistaken for oversights:

- **Job store is in-memory and process-local.** More than one uvicorn worker
  requires Redis plus a shared volume.
- **No auth, no rate limiting.** Do not expose the current build publicly.
- **No cookie support**, so private, age-gated and login-walled posts fail.
- **ffmpeg must be discoverable.** `VAD_FFMPEG_BINARY` may be a bare name (found
  on `PATH`) or an absolute path; yt-dlp needs a directory or executable path, so
  a bare name is resolved via `shutil.which` before being passed on. `GET /health`
  reports `degraded` when ffmpeg is missing.
