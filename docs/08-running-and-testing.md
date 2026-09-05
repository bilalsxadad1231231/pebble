# Running and testing

Everything needed to get Pebble onto a phone, plus the failures we actually hit
and what fixed them.

---

## Prerequisites

| Tool | Notes |
| --- | --- |
| Python 3.11+ | backend |
| Node 20+ | app |
| ffmpeg on `PATH` | merging, trimming, size budgets. `GET /health` reports `degraded` without it |
| Android SDK + NDK 27.x | only needed to build the dev client |
| JDK 21 | Android Studio's bundled JBR works |

---

## The two-terminal loop

**Terminal 1 — backend**

```powershell
cd backend
..\.venv\Scripts\python.exe -m uvicorn app.main:app --host 0.0.0.0 --port 8000
```

Settings come from `backend/.env` (copy `backend/.env.example`). PowerShell has
no `VAR=value cmd` prefix, which is why config lives in the file rather than
inline env vars.

**Terminal 2 — app**

```powershell
cd mobile
npx expo start
```

Both commands must run from their own directory. Running `npx expo` from the
repo root fails with `The expected package.json path ... does not exist`.

---

## When to rebuild the native app

`npx expo run:android` builds, installs and starts Metro. **It is not part of the
daily loop.** Once the dev client is installed, `npx expo start` is all you need.

| Change | What to run |
| --- | --- |
| Screen, component, logic (`app/`, `src/`) | nothing — Fast Refresh handles it |
| Backend Python | restart uvicorn |
| `mobile/.env` | `npx expo start --clear` — `EXPO_PUBLIC_*` is inlined at bundle time |
| Kotlin or `res/` in `modules/pebble-downloads/` | `npx expo run:android` |
| `plugins/*.js` config plugins | `npx expo run:android` |
| New native package, `app.json` plugins/permissions, icons | `npx expo run:android` |

Plugging or unplugging the cable is **not** a native change.

---

## Connecting the phone

### USB (bypasses the firewall)

```powershell
adb devices                       # confirm the phone is listed
adb reverse tcp:8000 tcp:8000     # backend
adb reverse tcp:8081 tcp:8081     # Metro
```

Then set both env files to `127.0.0.1`:

```
mobile/.env    EXPO_PUBLIC_API_BASE=http://127.0.0.1:8000
backend/.env   VAD_PUBLIC_BASE_URL=http://127.0.0.1:8000
```

`adb reverse` rules **do not survive** an unplug, a phone reboot, or an adb
server restart. Re-run them whenever the server "disappears".

### Wi-Fi

Use the PC's LAN address in both env files, and open the port once from an
**admin** PowerShell:

```powershell
New-NetFirewallRule -DisplayName "Pebble API 8000" -Direction Inbound `
  -LocalPort 8000 -Protocol TCP -Action Allow -Profile Any
```

Required because a "Public" network profile blocks inbound connections by
default. Metro on 8081 often gets through on its own; the Python server does not.

### Checking before you touch the phone

```powershell
curl.exe -s -o NUL -w "api %{http_code}`n"   http://127.0.0.1:8000/health
curl.exe -s -o NUL -w "metro %{http_code}`n" http://127.0.0.1:8081/status
```

Use `curl.exe`, not `curl` — bare `curl` in PowerShell is an alias for
`Invoke-WebRequest` and takes different flags.

The **Settings** tab in the app reports the same thing: *Connected*, *Connected
but ffmpeg is missing*, or *Cannot reach the server*.

---

## ABI matters

The phone is **arm64-v8a**; an emulator is usually **x86_64**. An APK built for
one will not run on the other — check with:

```powershell
unzip -l android\app\build\outputs\apk\debug\app-debug.apk | findstr "lib/"
```

`expo run:android` picks the connected device's ABI automatically, so the safe
habit is to have exactly one target attached. With both connected, name one:

```powershell
adb -s emulator-5554 emu kill          # or
npx expo run:android --device <serial>
```

**Never run two builds at once.** Two Gradle builds against the same project with
different ABIs corrupt the intermediates and fail with confusing errors like
`Failed to create MD5 hash for ... libjsi.so`.

---

## Automated checks

```powershell
cd backend
..\.venv\Scripts\python.exe -m pytest -q      # 79 tests

cd ..\mobile
npm run typecheck                              # tsc --noEmit
npm test                                       # 41 tests
npx expo-doctor                                # 21 config/dependency checks
npx expo export --platform android             # proves the bundle builds
```

`expo-doctor` will **not** catch a transitive native version conflict — see
Troubleshooting. A green doctor run is not proof the native build works.

**If npm refuses to install anything**, with an ERESOLVE naming `react-dom`:
`react-dom` is pinned to `19.2.3` in `package.json` to match `react`, because a
transitive `react-dom@19.2.8` peer-requires a newer react than the SDK uses.
Keep that pin. Reaching for `--legacy-peer-deps` instead is what caused the
`executeSync` build failure below.

To verify only the native module compiles, without a full app build:

```powershell
cd android
.\gradlew :pebble-downloads:compileDebugKotlin
```

---

## Manual test pass

### Resolve and format picker

- [ ] Paste a YouTube link → media card shows the real thumbnail, title, creator
- [ ] Format list shows **one row per resolution** (1080p, 720p, 480p…), not
      several rows of the same resolution — YouTube returns 5-6 variants of each
- [ ] Every row shows a size, never `—`
- [ ] **AUDIO ONLY** section is present, with MP3/M4A and the tagging toggle
- [ ] Instagram / TikTok links resolve and show `Direct` delivery

### Tier 1

- [ ] Trim toggle reveals the scrubber; dragging updates the in/out readout
- [ ] Downloaded clip's duration matches the selection
- [ ] Size presets below the floor are disabled; trimming shorter unlocks them
- [ ] A file with a size budget lands under it
- [ ] MP3 with tagging on lands in a music player with title, artist and artwork

### Storage

- [ ] After a download completes and reads **In gallery**, the staging copy is
      gone - `adb shell 'run-as com.pebble.downloader ls files/Pebble'` is empty
- [ ] The file is in a **Pebble** album, once, not twice
- [ ] **Delete** removes it from the gallery too, after Android's own prompt
- [ ] Downloads survive a force-stop and reopen (they live in SQLite now)
- [ ] An install upgraded from an older build keeps its existing library - the
      AsyncStorage records migrate on first launch

### Downloads

- [ ] Tapping **Download** goes straight to Library, row appears immediately
- [ ] Row shows `Preparing…` then live byte progress
- [ ] Pause, then Resume — the transfer continues rather than restarting
- [ ] Kill the app mid-download, reopen, resume — same
- [ ] Tapping a row opens the progress dial
- [ ] Cancel removes the row and the partial file

### Entry points (dev build only)

- [ ] Share a link from Instagram/YouTube → Pebble appears in the share sheet,
      and opens on the format picker with the link resolved
- [ ] Share while Pebble is already open, from another tab → it switches to Home
      and resolves
- [ ] Share the *same* link twice → it resolves both times
- [ ] Add the **Paste & Download** tile from the quick-settings edit screen;
      copy a link, tap it → Pebble opens on the picker
- [ ] Tap the tile with an empty clipboard → toast, app does not open
- [ ] Long-press the launcher icon → **Paste** shortcut does the same
- [ ] Copy a link elsewhere, then switch to Pebble → the copied-link card
      appears above the paste field
- [ ] Dismiss it, leave and return → it does **not** come back
- [ ] Download it, leave and return → it does **not** come back

### Gallery and background (dev build only)

- [ ] First completed download prompts for gallery permission
- [ ] Completed row reads **In gallery**, and the file appears in the phone's
      Gallery under a **Pebble** album
- [ ] Denying permission leaves the row as **App only** with a retry action, and
      does **not** lose the file
- [ ] Start a download, switch apps or lock the screen → progress notification
      appears and the transfer keeps going

---

## Expo Go vs development build

| | Expo Go | Dev build |
| --- | --- | --- |
| Resolve, formats, Tier 1, downloads | yes | yes |
| Gallery save | no — rows say **App only** | yes |
| Background downloads | no | yes |
| Clipboard offer on foreground | yes | yes |
| Share intent, QS tile, launcher shortcut | no | yes |

Both features degrade rather than crash in Expo Go, so it stays useful for JS
iteration.

---

## Troubleshooting

### `Cannot find native module 'ExpoMediaLibraryNext'`

Expo Go, or a dev build made before the dependency was added. The app should
*not* crash — it loads the module lazily. If it does crash, the bundle is stale:
`npx expo start --clear`, then force-close and reopen the app so the phone drops
its cached copy too.

### `no member named 'executeSync' in 'worklets::WorkletRuntime'`

A transitive native version conflict. `expo-modules-core` needs
`react-native-worklets ≤ 0.10`; `react-native-reanimated 4.6` pulls `0.12`, which
removed that function. Both are pinned in `package.json` (reanimated 4.5.1,
worklets 0.10.1) — if it reappears, something re-resolved them:

```powershell
npm ls react-native-worklets
```

Root cause was an earlier `--legacy-peer-deps` install, which silences exactly
this warning. Prefer `npx expo install` for anything with native code.

### `librnscreens.so: The source file doesn't exist`

Stale per-ABI artifacts after switching target ABIs. Clean the native build dirs
and rebuild once for a single ABI:

```powershell
cd mobile
Remove-Item -Recurse -Force node_modules\*\android\build -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force node_modules\*\android\.cxx  -ErrorAction SilentlyContinue
Remove-Item -Recurse -Force android\app\build            -ErrorAction SilentlyContinue
npx expo run:android
```

### `Failed to create MD5 hash for ... libjsi.so`

Two Gradle builds ran at once. Stop everything, then rebuild:

```powershell
cd mobile\android
.\gradlew --stop
```

### Metro reachable on `[::1]` but not `127.0.0.1`

`expo start --localhost` binds IPv6 only, while `adb reverse` forwards IPv4 — the
phone then shows *Something went wrong*. Use plain `npx expo start`, which binds
all interfaces.

### `ConfigError: The expected package.json path ... does not exist`

You are in the repo root. `cd mobile` first.

### Server unreachable from the phone

In order: is uvicorn bound to `0.0.0.0`; is `adb reverse` still listed
(`adb reverse --list`); does `mobile/.env` match the transport you are using; was
Metro restarted with `--clear` after changing it.
