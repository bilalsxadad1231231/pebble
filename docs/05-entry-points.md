# Entry points — how a link reaches the app

Status: **BUILT** — needs a development build; not verified on a device yet.

Three ways in, none requiring a special permission. All of them converge on the
same internal handler, so the resolve flow is written once.

---

## The constraint that shapes all of this

Since **Android 10 (API 29)**, an app may read the clipboard only when it is the
**focused foreground app** or the **default keyboard (IME)**. A background
service calling `getPrimaryClip()` receives `null`. This was a deliberate privacy
change — apps were harvesting copied passwords and one-time codes.

**Android 12+** additionally shows a system toast — *"Pebble pasted from your
clipboard"* — every time an app reads text it did not copy.

Consequences:

- "User copies a link in Instagram, our background service notices" is
  **impossible**. Not an Expo limitation; no native module can do it either.
- Apps that appear to do this are either targeting API < 29 (which Play no longer
  accepts for new submissions) or abusing an `AccessibilityService`
  (see [04-tier-3-deferred.md](04-tier-3-deferred.md)).
- Anything that reads the clipboard must be triggered by a **user action that
  gives our app focus**.

---

## 1. Share sheet — primary

**Flow.** Instagram → Share → Pebble. One tap, fewer steps than copy-and-switch.

This is the platform's intended mechanism and should be the path the UI teaches.

### Implementation

- `expo-share-intent` (config plugin wrapping the native share intent).
- Requires a **development build**; Expo Go cannot register share targets.
- Register `text/plain` and URL intent filters in the Android manifest via the
  plugin.
- Cold start and warm start both need handling: the app may be launched *by* the
  intent, or receive it while already running.

### Landing behaviour

The shared URL goes straight into resolve — the paste field is pre-filled and
the resolve request fires immediately, so the user lands on the format picker,
not on an empty Home screen.

### As built

`src/links/useShareIntentBridge.ts`, mounted in the root layout. Configured
with `resetOnBackground`, without which a warm share re-delivers the previous
intent on every resume and reopens a link the user already dealt with. The
intent is consumed even when the link is unsupported, so a bad share leaves the
app on a normal Home screen rather than re-firing forever.

---

## 2. Quick Settings tile — the "smart" one-tap

**Flow.** Copy link in Instagram → swipe down → tap the Pebble tile → Pebble
opens on the format picker with that link already resolved.

Nearly nobody in this category uses this, and it gets the same moment as a
floating bubble with none of the cost.

### Why it works

A `TileService` can launch an activity. That activity has **focus**, therefore it
may read the clipboard legitimately. The activity is transparent and finishes
immediately.

**Correction to the original plan.** This spec claimed the user would see "a
download notification appear — not a screen". That is not what was built, and
it was never quite honest: starting a download without showing a screen means
choosing a format without asking, and for YouTube — where every quality is a
separate server-side merge — there is no defensible default. The tile opens the
app on the format picker with the link already resolved. It is still one
gesture from a copied link to a choice, which was the actual point.

A true one-tap tile is possible later, once there is a remembered "usual
quality" to fall back on. That belongs with the Tier 2 work, not here.

### As built

- `PebbleTileService.kt` and `PasteAndDownloadActivity.kt`, in the existing
  `pebble-downloads` module rather than a new one.
- The activity reads the clipboard and re-enters the app through
  `pebble://link?url=…`; `src/links/useDeepLinkBridge.ts` receives it.
- **Validation stays in JavaScript.** Kotlin passes the raw clipboard text
  through and lets the shared handler decide, so there is one list of supported
  hosts rather than two that drift apart.
- `startActivityAndCollapse` takes a `PendingIntent` on Android 14+; the
  `Intent` overload was removed. Both paths are handled.
- **No special permission.** Tiles are user-added from the QS edit screen.
- Not yet done: `requestAddTileService()` to offer the tile after a successful
  download. Worth adding once, never on first launch.

### Edge cases

- Clipboard empty → brief toast (*"Copy a video link first"*), no app launch.
- Clipboard holds text that is not a supported URL → the app opens and says so,
  rather than being rejected silently in Kotlin. Keeping that judgement in one
  place is worth the extra launch.
- **Not built:** same URL as the last invocation should surface the existing
  download instead of duplicating it. That is the Tier 2 duplicate check
  arriving early, and it needs the local database Tier 2 introduces.

---

## 3. Clipboard on foreground — safety net

**Flow.** User copies a link, opens Pebble normally. On resume the app reads the
clipboard and, if it holds a supported URL, offers it.

### Implementation

- `expo-clipboard` + an `AppState` listener on the `active` transition.
- **Do not auto-start the download.** Reading the clipboard fires the Android 12
  toast, so the read must be visibly justified by something appearing on screen.
- Never re-offer a URL the user has already dismissed or downloaded — track the
  last handled clipboard value.

### As built

`src/links/useClipboardOffer.ts` plus `src/components/ClipboardOffer.tsx`. The
last value read is remembered, so returning to the app does not re-read
needlessly, and a url that was downloaded or dismissed is never offered again.

### UI

A card appears above the paste field: thumbnail placeholder, the detected
platform, and a **Download** action. In the Soft Neumorphic language this is a
`NeuInset` card with a `NeuRaised` pill button, following the tokens and pressed
states in the `pebble-neumorphic-rn-android` skill. It is dismissible and never
blocks the paste field.

---

## 4. App shortcut — free extra

Long-press the launcher icon → **Paste & Download**. Reuses the same transparent
activity as the QS tile, costs almost nothing once that exists, and needs no
permission.

### As built

`res/xml/shortcuts.xml` in the module, next to the activity it launches. The
`android.app.shortcuts` meta-data has to hang off the *launcher* activity, which
Expo generates, so it is attached by `plugins/withPebbleShortcuts.js` — `android/`
is gitignored and regenerated by prebuild, so a hand edit there is lost on the
next build.

---

## Convergence

```
Share intent ─┐
QS tile ──────┤
Clipboard ────┼──> normaliseUrl() ──> resolve() ──> format picker ──> prepare()
App shortcut ─┘
```

Everything normalises to a URL string and enters one handler. Entry-point-specific
behaviour stops at that boundary; nothing downstream knows or cares how the link
arrived.

That handler is `src/links/inbound.ts`. Two details are not obvious:

- It **holds a pending link**, because a share intent can *launch* the app — the
  link arrives before any screen has mounted to hear it.
- It **tracks handled urls**, so the clipboard never re-offers something already
  downloaded or dismissed. Sharing the same link twice still works: that is a
  deliberate repeat, not an accident.

---

## Build implication

Share intent, QS tile and notification actions all require a **development
build**, not Expo Go. That means `eas build` in the loop from day one. This is
the right default for this app regardless, but it should be set up before the
first screen is written rather than discovered halfway through.
