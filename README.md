# Pebble

Save video and audio from Instagram, YouTube, Facebook, TikTok and elsewhere —
**the part you want, at a size your phone can hold**, with downloads that
actually survive being interrupted.

Android app (Expo / React Native) plus a self-hosted Python API that does the
extraction and any ffmpeg work.

---

## Why another downloader

Downloading is a commodity — yt-dlp does the hard part for every app in this
category. Pebble competes on the three things the others handle badly:

**Downloads that survive.** Pause, resume, expired CDN links, app kills, network
changes. Most apps restart from zero; Pebble resumes from the byte. The client
persists a signed refresh token rather than a URL, so an expired link is
re-resolved and the transfer continues from its existing offset.

**Storage that fits the phone.** State a budget — *under 50 MB* — and the server
two-pass encodes to land under it. Choosing between "1080p" and "720p" is
guessing at an outcome you cannot see.

**Only the part you want.** Set in and out points and download just that range,
cut on exact frames. No downloading twelve minutes to keep thirty seconds.

Plus: audio comes out with real ID3 tags and embedded cover art, so it lands in
your music player as a proper track instead of "Unknown Artist".

---

## Layout

```
backend/    FastAPI + yt-dlp + ffmpeg  — extraction, merging, trimming, encoding
mobile/     Expo (SDK 57) Android app  — Soft Neumorphic UI
docs/       architecture, feature tiers, decision log
design/     style specimens from the visual-direction exercise
```

Each directory has its own README with setup and detail:
[backend](backend/README.md) · [mobile](mobile/README.md) · [docs](docs/README.md)

---

## Quick start

**Requirements:** Python 3.11+, Node 20+, ffmpeg on `PATH`, an Android device.

```bash
# 1. Backend
python -m venv .venv
.venv/Scripts/python -m pip install -r backend/requirements.txt   # Windows
# source .venv/bin/activate && pip install -r backend/requirements.txt

cp backend/.env.example backend/.env        # set VAD_SECRET_KEY and VAD_PUBLIC_BASE_URL
cd backend && ../.venv/Scripts/python -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

```bash
# 2. App
cd mobile
npm install
echo "EXPO_PUBLIC_API_BASE=http://<your-lan-ip>:8000" > .env
npx expo start
```

`EXPO_PUBLIC_API_BASE` must be the **LAN address** of the machine running the
API — `localhost` is the phone itself — and it must match the backend's
`VAD_PUBLIC_BASE_URL`, since server-side download links are built from it.

Over USB instead of Wi-Fi:

```bash
adb reverse tcp:8000 tcp:8000 && adb reverse tcp:8081 tcp:8081
# then use http://127.0.0.1:8000 in both .env files
```

---

## How it works

### Hybrid delivery

One rule (`backend/app/services/delivery.py`) decides how bytes reach the device,
and both `/resolve` and `/prepare` call it, so the format picker can never
promise a mode that `/prepare` contradicts.

| Case | Delivery | Who serves the bytes |
| --- | --- | --- |
| Progressive file (video + audio in one stream) | `direct` | platform CDN |
| Audio-only stream kept as-is | `direct` | platform CDN |
| Video-only DASH (YouTube 1080p+) | `muxed` | this API, after ffmpeg |
| Trimmed, size-budgeted or retagged | `muxed` | this API, after ffmpeg |
| HLS / DASH segmented source | `muxed` | this API, after ffmpeg |

`direct` costs the server nothing and keeps traffic off it entirely. Note that
YouTube no longer offers progressive video, so every YouTube video download is a
server-side merge.

### Resume

Three rules the client follows, each learned the hard way:

1. **Persist the ticket, not the URL** — CDN links expire in minutes to hours.
2. **Replay the ticket's headers on every request**, range resumes included —
   most CDNs return 403 without the extractor's `User-Agent`/`Referer`.
3. **Honour `content_stable`** — a re-muxed artifact is not byte-identical, so
   resuming onto one would silently corrupt the file.

---

## API

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/health` | liveness + ffmpeg discovery |
| `GET` | `/api/v1/platforms` | supported platforms |
| `POST` | `/api/v1/resolve` | url → media info + format list |
| `POST` | `/api/v1/prepare` | format → download ticket (or a job) |
| `POST` | `/api/v1/refresh` | re-issue an expired url from a token |
| `GET` | `/api/v1/jobs/{id}` | poll server-side progress |
| `DELETE` | `/api/v1/jobs/{id}` | cancel and delete the artifact |
| `GET`/`HEAD` | `/api/v1/files/{id}` | download an artifact (Range-capable) |

Three optional `/prepare` fields — `clip`, `target_size_mb`, `embed_metadata` —
each force server-side delivery. See [backend/README.md](backend/README.md).

---

## Tests

```bash
cd backend && ../.venv/Scripts/python -m pytest -q   # 79 tests
cd mobile  && npm test && npm run typecheck          # 26 tests
```

Backend tests mock the network and cover the delivery rule, range arithmetic,
token signing, the Tier 1 guard rails and the full job lifecycle. The app tests
lock its copy of the size-budget maths to the backend's own numbers, because a
duplicated rule has already drifted once in this project.

---

## Status

| Area | State |
| --- | --- |
| Backend API, hybrid delivery, pause/resume | Built, verified against live traffic |
| Clip trimming, fit-to-size, audio metadata | Built, verified against real ffmpeg |
| Android app: home, picker, library, downloads | Built |
| Share intent, quick-settings tile, clipboard | Planned |
| Foreground service, gallery save, playback | Planned |

Roadmap and the reasoning behind each decision live in
[docs/07-roadmap.md](docs/07-roadmap.md).

---

## Known limits

- The job store is in-memory and process-local; multiple workers need Redis plus
  a shared volume.
- No auth or rate limiting — **do not expose the backend publicly as-is**.
- Private and age-gated posts need cookies passed to yt-dlp; not wired up.
- Downloads do not yet continue while the app is backgrounded.

---

## Legal

Pebble is a personal tool for saving content you have the right to save.
Downloading from most platforms is against their terms of service, and
redistributing other people's work is a copyright matter regardless of the tool
used. You are responsible for how you use it.

Not affiliated with, endorsed by, or connected to any of the platforms it can
read from. Platform names appear only to describe compatibility.

## License

MIT — see [LICENSE](LICENSE).
