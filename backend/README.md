# Downloader API

Backend for the React Native video/audio downloader. Resolves a shared post url
to downloadable media and hands the app a **download ticket** it can pause and
resume.

## The hybrid rule

One decision function (`app/services/delivery.py`) picks how the bytes reach the
device, and both `/resolve` and `/prepare` call it, so the format picker can
never promise a mode that `/prepare` contradicts.

| Case | Delivery | Who serves the bytes |
| --- | --- | --- |
| Progressive file (video+audio in one stream) | `direct` | the platform CDN |
| Audio-only stream, kept as-is | `direct` | the platform CDN |
| Codecs unreported for a single complete file | `direct` | the platform CDN |
| Video-only DASH (YouTube 1080p+) | `muxed` | this API, after ffmpeg |
| Audio transcoded to mp3 | `muxed` | this API, after ffmpeg |
| HLS/DASH segmented source | `muxed` | this API, after ffmpeg |

`direct` costs us nothing and keeps traffic off the server. `muxed` is used only
when ffmpeg is genuinely required.

## Pause / resume

Both paths are resumable over HTTP `Range`. The client stores the **ticket**, not
the url — CDN links expire in hours or minutes.

- `POST /refresh` with the stored `refresh_token` re-resolves a fresh url.
- `content_stable: true` means the bytes behind the new url are identical, so a
  paused transfer resumes from its existing offset.
- `content_stable: false` (a muxed artifact that was swept from disk and had to
  be re-muxed) means ffmpeg gives no byte-for-byte guarantee — **discard the
  partial file and restart**.
- `headers` on the ticket **must** be replayed on every request, range resumes
  included. Most CDNs return 403 without the extractor's `User-Agent`/`Referer`,
  and `Accept-Encoding` is stripped deliberately so byte offsets stay meaningful.

## Layout (MVC)

```
app/
  views/        routers - HTTP surface only
  controllers/  request orchestration, ticket assembly
  services/     yt-dlp extraction, delivery rule, ffmpeg muxing, job store
  models/       pydantic schemas + the Job entity
  utils/        range serving, token signing, filename/mime helpers
```

## Setup

```bash
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
# source .venv/bin/activate && pip install -r backend/requirements.txt

cp backend/.env.example backend/.env    # then set VAD_SECRET_KEY
```

ffmpeg must be on `PATH` (or set `VAD_FFMPEG_BINARY`). `GET /health` reports
`degraded` when it is missing.

## Run

```bash
cd backend
../.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000 --reload
```

Docs at `/docs`. Set `VAD_PUBLIC_BASE_URL` to a LAN ip a real device can reach —
muxed download links are built from it.

## Test

```bash
cd backend
../.venv/Scripts/python -m pytest -q
```

Unit tests mock the network; they cover the delivery rule, range/resume
arithmetic, token signing, and the full job lifecycle.

## Endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | liveness + ffmpeg discovery |
| `GET` | `/api/v1/platforms` | supported platform list |
| `POST` | `/api/v1/resolve` | url → media info + format picker |
| `POST` | `/api/v1/prepare` | format → download ticket (or a job) |
| `POST` | `/api/v1/refresh` | re-issue an expired url from a token |
| `GET` | `/api/v1/jobs/{id}` | poll mux progress |
| `DELETE` | `/api/v1/jobs/{id}` | cancel and delete the artifact |
| `GET` | `/api/v1/files/{id}` | download a muxed artifact (Range-capable) |
| `HEAD` | `/api/v1/files/{id}` | probe size and range support |

`/prepare` blocks up to `VAD_PREPARE_TIMEOUT` and then returns `pending`/
`running` for the client to poll — `job_id` is `null` whenever delivery is
`direct`, because there is no server-side work to track.

## Processing options

Three optional `/prepare` fields. **Any of them forces `delivery: "muxed"`** — a
trimmed, transcoded or retagged file is a new file, so it can never be a CDN
handoff.

| Field | Type | Effect |
| --- | --- | --- |
| `clip` | `{start, end}` float seconds | Downloads only that range, cutting on exact frames |
| `target_size_mb` | int | Two-pass encode to land under the budget |
| `embed_metadata` | bool, default `true` | Tags + cover art; audio only |

```jsonc
{
  "url": "https://youtube.com/watch?v=...",
  "format_id": "137",
  "kind": "video",
  "clip": { "start": 45.0, "end": 80.5 },
  "target_size_mb": 20
}
```

Notes:

- With both `clip` and `target_size_mb`, the budget applies to the **clip**
  duration — *this 30 seconds, under 20 MB*.
- `target_size_mb` is validated **before** the job spawns, so an impossible
  budget is a synchronous 422 naming the smallest workable size.
- Fit-to-size is refused above `VAD_MAX_TRANSCODE_SECONDS` of source; trim first.
- `ticket.size` is an **estimate** until the job reaches `ready`, then exact.
- `embed_metadata` defaults on for audio, which makes a plain m4a `muxed`. Set it
  to `false` to keep the faster direct path.

## Known limits

- The job store is in-memory and process-local. Running more than one worker
  needs Redis plus a shared volume.
- No auth or rate limiting yet. Do not expose this publicly as-is.
- Private/age-gated posts need cookies passed to yt-dlp; not wired up.
- A shared server IP gets rate-limited by the platforms far sooner than a
  handset does — this is the main reason to keep `direct` delivery on the
  device wherever the rule allows it.
