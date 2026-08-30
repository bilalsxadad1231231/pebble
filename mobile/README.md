# Pebble — Android app

Expo (SDK 57) / React Native client for the downloader API in `../backend`.

Visual direction is **Soft Neumorphic**, owned by the
`pebble-neumorphic-rn-android` skill. `src/theme/neumorphic.ts` reproduces its
tokens exactly — change the skill first, then this file, never the other way
round.

## Run

```bash
npm install
npx expo start --dev-client
```

Point the app at your backend:

```bash
# .env
EXPO_PUBLIC_API_BASE=http://192.168.1.10:8000
```

On a real device this must be the **LAN address** of the machine running the
API — `localhost` is the phone itself. It should match the backend's
`VAD_PUBLIC_BASE_URL`, since muxed download links are built from that value.

### A development build is required

Expo Go is not enough. The entry points planned next — share intent, quick
settings tile, notification actions — all need custom native code, so
`eas build --profile development --platform android` is in the loop from the
start rather than being discovered halfway through.

## Checks

```bash
npm run typecheck   # tsc --noEmit
npm test            # jest, pure logic only
npx expo-doctor     # 21 config/dependency checks
```

## Layout

```
app/                       expo-router routes
  _layout.tsx              font gate + stack
  (tabs)/_layout.tsx       custom neumorphic tab bar
  (tabs)/index.tsx         Home: paste -> resolve -> format -> Tier 1 controls
  (tabs)/library.tsx       Library, grouped by day
  (tabs)/settings.tsx      server health, storage
  download/[id].tsx        progress dial, pause/resume
src/
  theme/neumorphic.ts      tokens, verbatim from the skill
  components/Neu.tsx       NeuRaised / NeuInset / NeuPressable
  components/Icon.tsx      one shared stroke icon set
  api/                     typed client mirroring the backend schemas
  download/manager.ts      queue, persistence, resume, refresh-on-expiry
  utils/                   formatting and url normalisation
```

## Shadows

Android's native `elevation` cannot render this style — one flat shadow, no
light-side highlight. Every surface goes through `react-native-shadow-2`
(SVG-backed, Fabric-safe):

- **Raised** — two stacked `<Shadow>`s, dark toward bottom-right, light toward
  top-left.
- **Inset** — no true inset shadow exists in the library, so it is approximated
  with two clipped gradients running the opposite way. Check it against the
  mockups on a device and nudge the stops if it reads flat rather than
  pressed-in.
- **Pressed** — `NeuPressable` swaps raised → inset while held. A neumorphic
  surface that never moves reads as flat, not soft.

## Download manager

`src/download/manager.ts` implements the three rules the backend contract sets
out:

1. **Persist the ticket, not the url.** CDN links expire in minutes to hours.
   The durable handle is `refresh_token`.
2. **Replay `headers` on every request**, range resumes included — most CDNs
   403 a bare GET.
3. **Honour `content_stable`.** When false, the artifact was re-muxed and is not
   byte-identical, so the partial file is deleted and the transfer restarts.

Built on SDK 57's `File.createDownloadTask()`, whose `savable()` /
`fromSavable()` persist a paused transfer across an app kill. On resume past
`expires_at` the manager re-resolves through `/refresh` and restores the task
onto the fresh url.

## Tier 1 surfaces

| Feature | Where | Note |
| --- | --- | --- |
| Clip trimming | `ClipScrubber` on Home | Two draggable handles over the source duration |
| Fit to size | `SizeBudget` on Home | Presets; impossible budgets are disabled, not left to fail |
| Audio tags + cover art | Toggle on Home | Defaults on; turning it off keeps the faster direct path |

## Gallery

A finished download is copied into the device gallery under a **Pebble** album,
so it is reachable from the Gallery, music players and other apps' file pickers.
Until that happens the file lives only in app-private storage, which is why the
Library row says `In gallery`, `Saving…` or `App only` rather than just "saved".

Permission is requested on the first completed download using Android 13+
granular grants (`photo`, `video`, `audio`). If it is denied the file is kept and
the row offers a retry — the transfer is never lost to a permission prompt.

The size presets mirror the backend's guard rails so a budget that would 422 is
never offered. `__tests__/logic.test.ts` locks that mirror to the backend's own
numbers — a 13 MB floor at 300 s, 2,405,333 bps for the worked example — because
this is exactly the kind of duplicated rule that already drifted once on the
server.

## Not built yet

- Share intent, quick settings tile, clipboard-on-foreground
  (see `../docs/05-entry-points.md`)
- Foreground service, so downloads survive backgrounding
- Playback; Library rows open the progress screen rather than a player
