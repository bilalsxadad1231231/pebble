# Design system

**The skill is the source of truth**, not this document.

`~/.claude/skills/pebble-neumorphic-rn-android/SKILL.md` — installed globally,
holds the exact tokens, shadow recipes, component recipes, per-screen structure
and the verification checklist. Any conflict resolves in the skill's favour.

This file records only what the skill does not: how the direction was chosen, and
one open decision.

---

## Direction: Soft Neumorphic

Light warm-grey monochrome, raised and pressed tactile shadows, a single teal
accent used sparingly.

It suits the positioning in [00-overview.md](00-overview.md): Pebble is a calm
utility, not a media-consumption app. The restraint — accent only on the active
nav icon, the progress ring, the Paste label and small dot indicators — is what
keeps the style reading as considered rather than busy.

### Selection process

Six directions were mocked as static HTML specimens, each rendering the same two
screens so the aesthetic was the only variable: `design/style-specimens.html`
(published at
<https://claude.ai/code/artifact/a4052b66-bfa8-4031-a12e-a4e0e486aaf9>).

Findings worth keeping from that exercise:

- **Cyberpunk failed for a non-obvious reason.** `#00FF66` on `#0D0D0D` measures
  about 14:1 and passes AAA. The problem is halation — saturated green on black
  blooms at the glyph edges, which is why terminals dim their green. Contrast
  ratio alone does not predict legibility.
- **OLED Dark corrected for the `#000000` smear problem converges on Modern
  Dark.** They were not really distinct options.
- **Glassmorphism costs a GPU pass per blurred surface.** Stacked `BlurView`s
  over a scrolling list is where React Native drops frames — and this app scrolls
  a list while animating progress bars.

Soft Neumorphic was chosen separately from a different mockup canvas
(<https://claude.ai/code/artifact/6cdf6187-0d8a-425a-8cc0-668fb42a6e8f>) and
supersedes that comparison. The specimen page is kept for the reasoning, not as a
live proposal.

---

## Open decision: text contrast

**Status: raised, not resolved. Needs a call before the first screen ships.**

Measured against the `#E7E9EE` background, per WCAG 2.1:

| Token | Hex | Ratio | AA normal text (4.5:1) |
| --- | --- | --- | --- |
| `text` | `#33363F` | **9.9:1** | passes |
| `textMuted` | `#7A7E8C` | **3.3:1** | fails |
| `accentPressedText` | `#3D8F86` | **3.2:1** | fails |
| `textFaint` | `#9CA1AE` | **2.1:1** | fails |

Headings and titles are fine. The concern is where the failing tokens are
actually used:

- `textFaint` carries meta text — `platform · size · quality`, placeholders, and
  the "Ns left" readout under the progress dial. At 2.1:1 that is not
  borderline.
- `accentPressedText` labels the **Paste** and **Save** buttons — the two most
  important controls on their screens.
- 3:1 is the bar for *large* text (18sp+, or 14sp bold). These tokens are
  specced at 11.5–12sp, so the large-text allowance does not apply.

### Proposed fix

Darken three values; change nothing else.

| Token | Current | Proposed | New ratio |
| --- | --- | --- | --- |
| `textFaint` | `#9CA1AE` | `#6E7280` | ~4.6:1 |
| `textMuted` | `#7A7E8C` | `#5F636F` | ~5.6:1 |
| `accentPressedText` | `#3D8F86` | `#2F6F67` | ~4.7:1 |

The soft character of this style comes from the **background and shadow** tokens
(`#E7E9EE`, `#C7CAD1`, `#FFFFFF`), not from the text. Darkening the text costs
nothing visually and is invisible next to the shadow work.

### Alternatives

1. **Scope the pale tokens to large text only** and raise the affected type to
   14sp bold. Preserves the palette exactly but changes the typographic rhythm
   the mockups establish, and does not cover the 11.5sp meta text.
2. **Accept and document.** Legitimate for a side-loaded APK — but it makes file
   sizes, speeds and time-remaining hard to read in daylight, which is precisely
   when a phone is used outdoors.

**Recommendation: apply the three-token fix.** Until it is decided, screens are
built with the skill's values as authored.
