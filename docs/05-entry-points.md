# Entry points — how a link reaches the app

Status: **PLANNED** (app not started)

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

---

## 2. Quick Settings tile — the "smart" one-tap

**Flow.** Copy link in Instagram → swipe down → tap the Pebble tile → download
starts.

Nearly nobody in this category uses this, and it gets the same moment as a
floating bubble with none of the cost.

### Why it works

A `TileService` can launch an activity. That activity has **focus**, therefore it
may read the clipboard legitimately. The activity is transparent and finishes
immediately, so the user sees the tile flash and a download notification appear —
not a screen.

### Implementation

- Small Kotlin `TileService` exposed through an Expo config plugin.
- Plus a transparent, no-UI activity: read clipboard → validate URL → hand to the
  resolve handler → `finish()`.
- **No special permission.** Tiles are user-added from the QS edit screen.
- Android 13+ can prompt the user to add the tile via
  `requestAddTileService()` — worth using once, after a successful download, not
  on first launch.

### Edge cases

- Clipboard empty or not a supported URL → brief toast, no app launch.
- Same URL as the last tile invocation → do not silently duplicate; surface the
  existing download instead (this is the Tier 2 duplicate check arriving early in
  a narrow form).

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

---

## Build implication

Share intent, QS tile and notification actions all require a **development
build**, not Expo Go. That means `eas build` in the loop from day one. This is
the right default for this app regardless, but it should be set up before the
first screen is written rather than discovered halfway through.
