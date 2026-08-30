# Tier 2 — v1.1 candidates

Status: **PLANNED**

Everything here is specified enough to build, but deliberately not in v1. The
split is not arbitrary: Tier 1 is backend work on a pipeline that already exists,
while most of Tier 2 is **app-side** work that cannot start until the React
Native app does. Building them in this order means no feature waits on another.

Ordered by my confidence that users will actually want it.

---

## 1. Wi-Fi-only smart queue

**Problem.** Mobile data is metered and expensive in the target market. Users
want to queue now and download when they get home.

**Why it is nearly free for us.** A queued job is a paused job with a network
condition attached. The resume machinery is already built and verified — this
feature is a scheduling policy on top of it, not new transfer logic.

### Behaviour

- Per-download toggle plus a global default in Settings.
- On a metered connection, a Wi-Fi-only download sits in `queued` and shows
  *"Waiting for Wi-Fi"* rather than failing.
- On reaching an unmetered network, queued downloads start automatically,
  respecting the concurrency cap.
- If the connection drops mid-transfer, it returns to `queued`, not `failed`.

### Implementation notes

- `@react-native-community/netinfo` exposes `isConnectionExpensive`, which is
  what "metered" actually means — do **not** infer it from connection type. A
  hotspot reports as Wi-Fi while being someone's mobile data.
- Resuming across a network change needs the CDN URL re-resolved via `/refresh`
  if `expires_at` has passed. This is the same path an app-kill resume takes.
- Requires a foreground service to continue while backgrounded.

### Open question

Whether a queued download should hold its resolved ticket or re-resolve on
start. Re-resolving is more robust (links expire) but costs an extra round trip.
Leaning toward re-resolve, since the queue exists precisely because time will
pass.

---

## 2. Private vault

**Problem.** People download things they would rather not have appear in the
gallery between family photos. Nobody says this out loud, which is exactly why
it is underserved.

### Behaviour

- Long-press any Library item → **Move to Vault**.
- Vault is a separate tab, gated behind `expo-local-authentication` (fingerprint
  or device credential).
- Vault files live in app-private storage and are **never** registered with
  `MediaStore`, so they do not appear in the gallery, in other apps, or in
  Android's media picker.
- No thumbnails for vault items in any surface outside the vault, including
  recents and notifications.

### Implementation notes

- The critical detail is *not* the lock screen — it is staying out of
  `MediaStore`. A file the user believes is hidden but which the gallery still
  indexes is worse than no vault at all.
- Moving into the vault means moving the file out of shared storage and deleting
  the `MediaStore` entry, not merely flagging it in our database.
- Biometric failure must fall back to device PIN, never to open access.
- Deliberately **no decoy or panic mode**. Half-implemented plausible
  deniability is a security theatre trap, and the honest framing — "hidden from
  the gallery, locked behind your fingerprint" — is what it actually delivers.

---

## 3. Subtitles

**Problem.** Language learners and non-native speakers need the text. yt-dlp
already fetches subtitles for most platforms.

### Behaviour

- The format picker lists available subtitle languages when the source has them.
- Two modes: **save alongside** (`.srt` next to the video) and **burn in**
  (rendered into the picture, permanent).
- Auto-generated captions are labelled as such — quality differs sharply from
  human ones and users should be able to tell.

### Implementation notes

- `writesubtitles` / `writeautomaticsub` plus `subtitleslangs` in yt-dlp.
- Burn-in is an ffmpeg `subtitles=` filter, so it is a full re-encode. It shares
  the Tier 1 transcode budget and the same duration ceiling.
- Soft-muxing into an mp4 is possible (`mov_text`) but Android's stock player
  support is patchy — burn-in or a sidecar file are the honest options.

---

## 4. Smart naming and auto-organise

**Problem.** The single most common complaint about this category: a folder of
`video_1737.mp4` that cannot be searched.

### Behaviour

- Files named from real metadata: `Creator — Title (1080p).mp4`.
- Optional folder structure: `Pebble/<Platform>/<Creator>/`.
- Collision handling appends a counter, never silently overwrites.

### Implementation notes

- The backend already produces a sanitised `filename` on the ticket; this is
  mostly about the app honouring it and adding folder placement.
- Android scoped storage means writes go through `MediaStore` for shared files.
  Arbitrary nested folders are restricted — verify what the platform actually
  permits before promising a structure in the UI.

---

## 5. Built-in player with resume position

**Problem.** The Library is currently a dead end: tap a file and it hands off to
another app, which forgets where you were.

### Behaviour

- Tap to play in-app, remembering position per file.
- Continue-watching row on Home.
- Background audio playback for audio-only items.

### Implementation notes

- `expo-video` (the successor to `expo-av`, which is deprecated).
- This is what turns the Library from storage into a destination, which is why
  it ranks above the smaller quality-of-life items despite being more work.

---

## 6. Duplicate detection

**Problem.** Users re-download things they already have, wasting data and space.

### Behaviour

- On resolve, if the same source ID and format already exist locally, show
  *"Already downloaded"* with a jump-to-file action instead of a download button.
- Keyed on `(extractor, media id, format_id, clip bounds)` — not on the URL,
  since the same post has many URL forms.

### Implementation notes

Cheap to build once the Library has a local database. The tricky part is that a
Tier 1 clip of a video is *not* a duplicate of the full video, so clip bounds
have to be part of the key.

---

## 7. Storage reclaim

**Problem.** The app accumulates gigabytes the user never opens.

### Behaviour

- Settings surface: *"3.8 GB in Pebble. 2.1 GB never opened."*
- Sort by size, by age, by never-played.
- Multi-select delete with an undo window.

### Implementation notes

Depends on the player (item 5) for "never opened" to mean anything. Until then it
can only report size and age, which is weaker but still useful.

---

## Sequencing within Tier 2

```
Wi-Fi queue ──────────────> independent, ship first
Vault ────────────────────> independent
Subtitles ────────────────> independent (backend)
Smart naming ─────────────> independent
Player ───────────────────> unlocks:
                             ├─ Duplicate detection (needs local DB)
                             └─ Storage reclaim (needs play history)
```

The player is the keystone. Everything after it in the list gets cheaper once it
exists, so it should not be scheduled last despite being the largest single item.
