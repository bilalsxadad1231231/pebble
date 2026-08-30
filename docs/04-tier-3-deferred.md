# Tier 3 — deliberately deferred

Status: **DEFERRED**

Recorded with reasons so these are not re-proposed every few weeks, and so the
reasoning can be revisited if a premise changes.

---

## Channel / creator auto-sync

**The idea.** Subscribe to a creator; new uploads download automatically,
podcast-style.

**Why it is attractive.** Genuine recurring utility, and a strong retention hook
— the app keeps working while closed.

**Why not.**

1. **It is the most aggressive thing you can do against platform terms.** Ad-hoc
   downloading of a link a user already has is one thing; standing polling of a
   creator's catalogue is automated bulk collection.
2. **It makes the server an obvious target.** Periodic polling for many users
   against the same platform, from one IP, is exactly the fingerprint that
   triggers rate limiting and IP bans. It would force rotating residential
   proxies — real recurring cost — to keep the *rest* of the app working.
3. **It is the feature most likely to lose a distribution channel.** Given Play
   Store is already hostile to this category (see
   [00-overview.md](00-overview.md)), adding the most defensible-to-ban feature
   is a poor trade.

**Revisit if:** the product moves to a model where each user's downloads run from
their own IP, which removes both the ban and the cost argument.

---

## AI summaries and transcripts

**The idea.** "Summarise this 40-minute video into 200 words with timestamps",
or a searchable transcript.

**Why it is attractive.** Genuinely novel in this category, and it fits the
"around the download" positioning better than most ideas.

**Why not now.**

1. **Per-user inference cost in an app with no revenue model.** Every summary
   costs money on a product that currently earns nothing. That is a business
   decision, not a technical one, and it should be made deliberately.
2. **It needs the whole audio, always.** No direct-delivery path, no clip
   shortcut — every summary is a full server-side download plus transcription.
3. **Cheaper 80% already exists.** Many platforms ship captions, and yt-dlp can
   fetch them. Subtitles (Tier 2) delivers much of the value for near zero
   marginal cost.

**Revisit if:** a paid tier exists, or captions prove insufficient in practice.
Sequence it after subtitles either way — captions are the input a transcript
feature would want anyway.

---

## Floating overlay bubble

**The idea.** A Messenger-style chat head over other apps that catches copied
links.

**Why it came up.** It is the only mechanism that can read the clipboard from
outside the app, because tapping it gives our app focus — and focus is what
Android's clipboard restriction actually gates on. See
[05-entry-points.md](05-entry-points.md) for the full mechanics.

**Why not.**

1. **`SYSTEM_ALERT_WINDOW` is a high-friction special permission** requiring a
   trip to a Settings screen, not a runtime dialog.
2. **OEM skins block it by default** — MIUI, ColorOS, Funtouch and Realme UI each
   add their own buried toggle. On the exact devices the target market carries, a
   meaningful share of users would never successfully enable it.
3. **No maintained Expo or React Native library exists.** It means a custom
   Kotlin module, overlay lifecycle handling and drag behaviour.
4. **The UX case is weak.** Messenger earns a persistent bubble because a
   conversation is ongoing. A download link is a two-second event; a permanent
   overlay is a lot of intrusion to catch it.
5. **A Quick Settings tile gets the same moment** with no special permission, no
   OEM interference and roughly a tenth of the code.

**Revisit if:** users ask for it after launch. The transparent-activity plumbing
built for the QS tile is the same plumbing a bubble needs, so by then it is a UI
shell over working code rather than a feature from scratch.

---

## Accessibility-service clipboard monitoring

**The idea.** Use an `AccessibilityService` to observe the clipboard or screen
and react to copied links in the background.

**Why not.** It works, and it is how several apps in this category actually do
it. It is also a straightforward Google Play policy violation — accessibility
APIs must serve users with disabilities, and using them for convenience features
is grounds for removal. It also requires a permission whose warning screen
tells the user the app can read everything on their screen.

**Revisit:** never. This one is closed.

---

## Building our own extractors

**The idea.** Replace yt-dlp with in-house per-platform extraction.

**Why not.** yt-dlp absorbs a continuous stream of breakage across a thousand
sites, including YouTube's obfuscated signature challenges which change without
notice. Reimplementing that is a permanent treadmill with no product upside. The
correct investment is keeping yt-dlp updated, which is one `pip install -U` and
fixes every user at once.
