---
name: Personal Dashboard
description: A private daily adherence guide — warm, quiet, and built to be read a dozen times a day without ever being noticed.
colors:
  accent-amber: "#9a6a2e"
  accent-tint: "#f0e4d0"
  warm-beige: "#f2ede4"
  off-white: "#fbf9f5"
  recessed: "#efe9de"
  hairline: "#e2dbcd"
  hairline-strong: "#cfc5b2"
  ink: "#23201b"
  muted: "#6e675d"
  placeholder: "#6e675d"
  state-adhered: "#9a6a2e"
  state-drifted: "#8a8378"
  state-skipped: "#8f8676"
  pillar-social: "#8c7434"
  pillar-physical: "#467c6c"
  pillar-portfolio: "#67609b"
typography:
  display:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "52px"
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: "-0.03em"
    fontFeature: "tabular-nums"
  headline:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "28px"
    fontWeight: 600
    lineHeight: 1.2
  title:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "16px"
    fontWeight: 600
    lineHeight: 1.4
  body:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "15px"
    fontWeight: 400
    lineHeight: 1.625
  control:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "14px"
    fontWeight: 400
    lineHeight: 1.4
  label:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "13px"
    fontWeight: 400
    lineHeight: 1.4
  caption:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "12px"
    fontWeight: 400
    lineHeight: 1.35
  micro:
    fontFamily: "ui-sans-serif, system-ui, sans-serif"
    fontSize: "11px"
    fontWeight: 400
    lineHeight: 1.3
rounded:
  sm: "4px"
  md: "6px"
  lg: "8px"
  xl: "12px"
  2xl: "16px"
  full: "9999px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
  2xl: "32px"
  section: "48px"
  section-lg: "56px"
components:
  button-primary:
    backgroundColor: "{colors.accent-amber}"
    textColor: "#ffffff"
    typography: "{typography.control}"
    rounded: "{rounded.xl}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    rounded: "{rounded.xl}"
    padding: "6px 12px"
  chip-adhered:
    backgroundColor: "{colors.state-adhered}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-drifted:
    backgroundColor: "{colors.state-drifted}"
    textColor: "#ffffff"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-skipped:
    backgroundColor: "transparent"
    textColor: "{colors.state-skipped}"
    typography: "{typography.label}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  card:
    backgroundColor: "{colors.off-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "16px 20px"
  input-text:
    backgroundColor: "{colors.warm-beige}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.xl}"
    padding: "8px 12px"
  input-numeric:
    backgroundColor: "{colors.recessed}"
    textColor: "{colors.ink}"
    typography: "{typography.control}"
    rounded: "{rounded.lg}"
    padding: "4px 10px"
    width: "72px"
  tab-item:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.caption}"
    padding: "10px 8px 12px"
  tab-item-active:
    textColor: "{colors.ink}"
---

# Design System: Personal Dashboard

## 1. Overview

**Creative North Star: "The Unwitnessed Page"**

Nobody is watching. That is the whole system in three words, and every visual decision
here descends from it. There is no audience to perform for, so nothing celebrates. There
is no one to be ashamed in front of, so nothing scolds. What's left is a warm, plain page
you mark and close — closer to a bedside notebook than to a dashboard, and deliberately so.

The surface is a light warm beige with off-white panels floating on it, one muted amber
accent, and three desaturated hues that categorise but never rank. It is dense where the
day's work is and generous everywhere else. It reads at 8am at a desk and at 11pm in the
dark, and it is opened a dozen times a day for months — which is the governing constraint.
Anything that rewards a first look at the cost of the hundredth is wrong here. A surface
seen this often must never be interesting.

What this system explicitly rejects: **the Duolingo / Habitica register** — streaks as a
mechanic, badges, celebration, mascots, loss-aversion. It rejects red, shame copy, and
"you failed" states. It rejects severity ramps, where three shades of worsening encode a
verdict in the palette itself. And it rejects any surface where output could be measured
or compared. Marking a block as drifted must cost exactly what marking it adhered costs;
the moment the palette makes one of them heavier, honest logging stops.

**Key Characteristics:**

- Warm beige ground, off-white panels, one accent. Restrained by doctrine, not by timidity.
- Flat. Depth is tonal layering, never cast shadow.
- Eight type steps, two weights, tabular figures on anything that changes in place.
- Motion is state, feedback and reveal only. Nothing choreographed, everything under 280ms.
- The three block states are distinguished by **form** — filled, filled, outlined — never
  by a severity gradient.
- Every colour is measured against its real background before it ships.

## 2. Colors

A warm, heavily desaturated palette: nothing in it exceeds 0.098 chroma, so the page reads
as paper with one metal on it rather than as a coloured interface.

### Primary

- **Muted Amber** (`#9a6a2e`): the single accent, and the only coloured block state. It
  carries the adherence ring, primary buttons, the active tab indicator, the 7-day strip
  bars, checked non-negotiables, and link text. Despite the name it sits closer to aged
  brass than to signal-amber — dark enough to hold white text at 4.69:1, which is exactly
  why it can be a filled chip. Used on well under 10% of any screen; its rarity is the
  point.
- **Amber Tint** (`#f0e4d0`): the accent diluted to a background. Marks today's column in
  the 7-day strip. Never carries text.

### Secondary — the three block states

Not a ramp. Three tonally equal treatments distinguished by fill and outline.

- **Adhered** (`#9a6a2e`): the accent, filled, white text. The only state with colour.
- **Drifted** (`#8a8378`): a warm grey, filled, white text. Information, not alarm.
- **Skipped** (`#8f8676`): a warm grey used as a 1px outline plus label text, never as a
  fill. Outline rather than a third fill because a grey pale enough to read as "least"
  measured 2.1:1 — below the floor for a meaningful swatch.

### Tertiary — the three pillar hues

Categorisation only. These name a domain; they never indicate status, quality, or health.
All three are owner-editable from a curated palette; nothing else in this document is.

- **Dry Ochre** (`#8c7434`): Social.
- **Deep Sage-Teal** (`#467c6c`): Physical. Was `#4a8271` until it measured 4.45:1 with
  white on top and was darkened — the exact failure the chip test exists to catch.
- **Muted Iris** (`#67609b`): Portfolio.

### Neutral

- **Warm Beige** (`#f2ede4`): the page. Every measurement in this document is taken
  against it unless stated otherwise.
- **Off-White** (`#fbf9f5`): panels and cards. The primary raised surface.
- **Recessed Warm** (`#efe9de`): inset surfaces — numeric inputs, empty strip tracks.
- **Hairline** (`#e2dbcd`) and **Hairline Strong** (`#cfc5b2`): borders and ring tracks.
  Strokes only. Hairline Strong measures 1.47:1 and must never carry text.
- **Near-Black Ink** (`#23201b`): body and heading text, 13.9:1.
- **Warm Grey** (`#6e675d`): secondary text and placeholders, 4.79:1 on the page and
  5.31:1 on panels. Placeholder text is text and gets this, not a hairline colour.

### Named Rules

**The One Voice Rule.** Amber is the only accent in the system. A second accent is not a
design decision, it is a bug. The three pillar hues are categorisation and are forbidden
from carrying status, error, warning, or success meaning.

**The No-Red Rule.** There is no red in this palette and none may be added. The block
states avoid a severity ramp entirely — they differ by form, not by degree of badness.
Encoding judgement in the palette is how honest logging dies.

**The Chip Test.** Any hue used as a filled chip must clear **4.5:1 with white on top**,
not merely 3:1 against the page. Two colours currently fail it and must be corrected
rather than propagated: white on **Drifted** measures **3.75:1**, and **Skipped** used as
13px label text measures **3.08:1** on the page (3.42:1 on a panel). Skipped is compliant
as a 1px outline; it is the text use that fails. Darkening Drifted toward ~4.6:1 makes it
*more* tonally equal to Adhered, not less, so the fix does not create a severity ramp.

## 3. Typography

**Display Font:** none declared.
**Body Font:** none declared.

**This is the system's largest gap, and it is not a stylistic choice.** No `next/font`, no
`@font-face`, no `font-family` declaration, and no `--font-sans` in the `@theme` block
exist anywhere in the project. Every surface falls through to Tailwind's preflight default,
`ui-sans-serif, system-ui, sans-serif` — which resolves to **Segoe UI on the laptop and SF
Pro on the iPhone**. The two devices this app was built for render it in two different
typefaces. `globals.css` also sets `font-feature-settings: "cv02", "cv03", "cv04"`, which
are Inter's character-variant features; with no Inter loaded they are silent no-ops on both
devices. Any work on this system should resolve the family first.

**Character:** what the scale *intends* is a single neutral sans doing every job — headings,
buttons, labels, body, data — with hierarchy carried entirely by size, weight and space.
That is the correct instinct for this register. It is currently unrealised.

### Hierarchy

Eight steps, fixed in px. Not fluid: this is product UI at consistent DPI, and a clamped
heading that shrinks inside a column looks worse, not better.

- **Display** (600, 52px, line-height 0.92, letter-spacing −0.03em, tabular figures): the
  adherence numeral, and nothing else in the entire app. Tight tracking because large
  numerals default to looking loose; tabular figures so the percentage does not jitter as
  it changes through the day.
- **Headline** (600, 28px): deeper-screen page headings — Goals, Habits, Colours.
- **Title** (600, 16px): dialog titles.
- **Body** (400, 15px, line-height 1.625): the default. Prose capped at 62ch.
- **Control** (400, 14px): input values and control labels. Numeric inputs use tabular
  figures.
- **Label** (400, 13px): dense list rows, secondary actions, block-state chips.
- **Caption** (400, 12px): tab bar, inline links, metadata.
- **Micro** (400, 11px): ring captions, fact lines, weekday initials.

### Named Rules

**The Two Weight Rule.** 400 and 600. **No 500.** `font-medium` is banned outright — a
third weight is a bug, not a choice. One violation exists today at
`src/app/login/page.tsx:62`.

**The Eight Step Rule.** 11 / 12 / 13 / 14 / 15 / 16 / 28 / 52. A ninth size is a bug. If
something needs to stand out, use weight or space, never a new size. Sizes are written as
explicit `text-[Npx]`, never as Tailwind's default scale — `text-3xl` is 30px and is not a
step in this system. Three files currently bypass the spine: `login/page.tsx` (including a
genuine ninth step at 30px), `JournalCanvas.tsx`, and `JournalText.tsx`. A deliberate
exception exists at `JournalPanel.tsx:74`, where 9px renders a scale-model thumbnail of a
journal page rather than UI text.

**The Tabular Rule.** Any number that changes in place gets `font-variant-numeric:
tabular-nums`. A percentage that reflows as it counts is a percentage nobody trusts.

## 4. Elevation

**This system is flat.** Depth is communicated entirely through tonal layering, and the
whole ramp is three steps: the page (`#f2ede4`), raised panels (`#fbf9f5`), and recessed
insets (`#efe9de`). Borders are hairlines, not shadows. A card is a card because it is
lighter than the page, not because it casts anything.

The layering is deliberately shallow. The values sit within ~0.05 OKLCH lightness of each
other, so surfaces separate without any of them announcing itself — which is what lets the
adherence numeral be the only thing on the screen with real presence. One consequence is
documented in the ring component: an empty ring track uses **Hairline Strong**
(`#cfc5b2`), not the recessed surface token, because `#efe9de` on `#f2ede4` is so close
that an unfilled ring reads as nothing at all rather than as a ring that isn't filled.

### Shadow Vocabulary

Two uses exist in the entire application, both `shadow-sm`, both on elements that
genuinely leave the plane:

- **Floating affordance** (`box-shadow: 0 1px 2px 0 rgb(0 0 0 / 0.05)`): the
  hover-revealed delete control on a journal thumbnail.
- **Popover** (same value): the journal's new-page menu.

### Named Rules

**The Flat-By-Default Rule.** Surfaces are flat at rest and stay flat on hover. Reach for
tonal separation or a hairline first; a shadow is only correct when the element has
actually left the page plane. Two shadows in the whole app is the budget, not the starting
point.

**The Legible-Empty Rule.** An empty state must still be visible. An unfilled ring, an
unmarked block, an untouched day in the strip — each draws a real track at ≥3:1. "Thin
means neglected, never failed" only works if the thin thing can be seen.

## 5. Components

Quiet and tappable. Generous hit areas, hairline borders, no fills except where state
demands one. Everything is sized for a thumb at 11pm.

### Buttons

- **Shape:** softly rounded (12px, `rounded-xl`) for solid and bordered actions; fully
  rounded (`rounded-full`) for the three-way state selector, where a pill reads as a
  choice rather than a command.
- **Primary:** Muted Amber fill, white text, 12px radius, 16px × 8–10px padding, at
  Control (14px) or Body (15px). Hover drops opacity to 0.9. Disabled drops to 0.4.
- **Ghost:** transparent, 1px Hairline Strong border, ink text, fully rounded, 14px × 6px.
  This is the unmarked block-state selector — three equal-weight options, no default, no
  recommended choice.
- **Quiet:** transparent, no border, Warm Grey text at Caption (12px), darkening to ink on
  hover. Used for `edit`, `colours`, and other one-tap-deeper navigation.
- **Focus:** a 2px Muted Amber outline at 2px offset with a 6px radius, applied globally
  via `:focus-visible`. Never removed, never restyled per component.

### Chips

- **Style:** fully rounded, 12px × 4px, Label (13px). Marked block states only.
- **State:** Adhered and Drifted are filled with white text; Skipped is a 1px outline with
  the label in its own colour. Fill-versus-outline is the entire distinction — see The
  No-Red Rule. (Both filled variants currently fail The Chip Test; see Colors.)

### Cards / Containers

- **Corner Style:** 16px (`rounded-2xl`) for content panels; 12px (`rounded-xl`) for
  interactive rows and inputs.
- **Background:** Off-White on the Warm Beige page. Recessed Warm for insets.
- **Shadow Strategy:** none. See Elevation.
- **Border:** most panels carry no border and rely on tonal separation alone. Where a
  border is needed it is 1px Hairline; 1px Hairline Strong when the element is interactive.
- **Internal Padding:** 16–20px on content panels, 8–12px on list rows. Nested cards are
  forbidden.

### Inputs / Fields

- **Style:** 12px radius, 1px Hairline Strong border, page-coloured or Off-White fill,
  12px × 8px padding, Control (14px). Numeric fields drop to 8px radius, sit on Recessed
  Warm, are right-aligned with tabular figures, and are ~72px wide.
- **Focus:** the global amber `:focus-visible` ring. `outline: none` appears on inputs
  only because the global rule supplies the ring.
- **Placeholder:** Warm Grey (`#6e675d`) at the full 4.5:1. Placeholder text is text.
- **Commit behaviour:** numeric fields commit on blur and on Enter. Clearing the field
  clears the day — there is no separate delete affordance.

### Navigation

- **Desktop:** no chrome at all. A three-column grid with a single date line as the header
  and one quiet link. There is no sidebar, no top bar, no logo, no account menu.
- **Mobile:** a fixed bottom tab bar below `lg` — Calendar / Today / Pillars. Translucent
  (`color-mix(in srgb, var(--color-bg) 88%, transparent)`) over a 12px backdrop blur, so
  the page reads as continuing underneath. 1px Hairline top border. Bottom padding is
  `max(0.5rem, env(safe-area-inset-bottom))`.
- **States:** inactive labels are Warm Grey at Caption (12px); the active label is ink.
  A single 2px × 24px amber indicator **slides** between tabs over 180ms rather than three
  indicators blinking — the movement is what says "you moved sideways".
- **Gesture:** horizontal swipe changes tab, requiring ≥56px of travel and a 1.6:1
  horizontal-to-vertical ratio so a diagonal scroll cannot flip the tab. Canvases, inputs,
  and open dialogs are excluded from the gesture.

### Rings (signature component)

The one genuinely custom component, and two species share it. They must stay visually
distinct or today's adherence reads as one more quota to fill:

- **Adherence ring:** 168px, 10px stroke, amber, the numeral **inside**.
- **Pillar ring:** small, pillar-hued, thin stroke, a fact line **below** — never a
  percentage.

Three states, and the third is what stops a first load reading as total failure:
**filled** (a hued arc), **empty but live** (a faint solid track, no arc — "0 of 2 days"),
and **ghost** (a *dashed* track for a metric with no data source yet). Null never enters
the arc arithmetic; it is guarded before any maths, because coercing null to 0 would draw
a 0% ring for a day that hasn't happened.

Arcs use `stroke-linecap: butt`, never round: round caps add half a stroke width at each
end, which makes the smallest non-zero fills read as roughly half again their true value.
The ring would overstate exactly where honesty matters most. Overdrive past the threshold
draws a second translucent lap at 0.45 opacity and 42% stroke width, capped at 2×.

### Motion

- **Easings:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or
  responding; `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for something moving across
  the screen. **There is deliberately no ease-in token** — it delays the first moment,
  which is exactly when the eye is watching.
- **Durations:** `--dur-press` 140ms, `--dur-fast` 180ms, `--dur-modal` 240ms, `--dur-data`
  280ms. Nothing exceeds 280ms.
- **Press feedback:** every enabled button scales to 0.97 on `:active`. Small enough to be
  felt rather than watched, and load-bearing: an app whose value depends on marking things
  quickly must confirm the tap landed.
- **Dialogs:** enter from `scale(0.97)` and opacity 0 over 240ms, exit at 180ms. Never from
  `scale(0)` — nothing in the real world appears out of nothing, and a zero-scale entrance
  reads as a pop rather than an arrival. Exit is faster than entry because the system
  responding should always outpace the system presenting. Backdrop is
  `rgb(35 32 27 / 0.28)`.
- **Data:** rings animate `stroke-dasharray` over 280ms.
- **Reduced motion:** gentler, not none. Movement is removed; colour and opacity still
  carry meaning. A blanket `0.01ms` on everything would also kill the dialog's
  `allow-discrete` transitions and make them pop.

### Named Rules

**The Pressable Rule.** Every interactive element confirms the tap. A control that does not
move on press leaves you unsure it registered, and this app is marked dozens of times a day.

**The Hover-Is-Not-Touch Rule.** Hover states must not stick after a finger lifts. A touch
device fires `:hover` on tap, so an ungated hover leaves a row looking selected when it
isn't.

**The Transform-Only Rule.** Animate `transform` and `opacity`. Bars scale with `scaleX`,
never `width`. One violation exists today: the 7-day strip at `Today.tsx:185` transitions
`height` while also changing `marginTop` — and `marginTop` is not in the transition list,
so the bar's top edge teleports while its height eases.

## 6. Do's and Don'ts

### Do:

- **Do** treat the adherence numeral as the only element on the screen with real presence.
  52px, weight 600, tabular figures, tight tracking. Nothing else may compete.
- **Do** measure every colour against its actual background before shipping it. Body text
  ≥4.5:1, strokes and large text ≥3:1, and any filled chip ≥4.5:1 with white on top. This
  discipline caught Physical at 4.45:1, a real failure that looked fine.
- **Do** keep meaning off hue alone. Every pillar-coloured element needs a label, shape, or
  position doing the same job.
- **Do** print the real number beneath any capped ring (`11 of 8 days`). The arc caps; the
  text never does.
- **Do** distinguish the three block states by **form** — filled, filled, outlined.
- **Do** write type sizes as explicit `text-[Npx]` from the eight-step spine.
- **Do** use tonal layering for depth: page → panel → inset.
- **Do** give every animation a `prefers-reduced-motion` alternative that removes movement
  while keeping colour and opacity.

### Don't:

- **Don't** build anything in the **Duolingo / Habitica** register. No XP, no levels, no
  points, no badges, no mascots, no confetti, no celebration state, no loss-aversion
  nudge. The streak is a plain count of days logged and must never be dramatised.
- **Don't** use red. Anywhere. Not for errors, not for drift, not for delete.
- **Don't** build a severity ramp. Three shades of worsening grey encode a verdict in the
  palette, and a person who feels judged logs inaccurately.
- **Don't** write shame copy or "you failed" states. Marking drifted must cost exactly what
  marking adhered costs.
- **Don't** measure, score, rank, or compare output — not between days, not between
  fortnights, not between pillars.
- **Don't** use a pillar hue as a status colour. One violation exists at
  `login/page.tsx:68`, where Dry Ochre carries an error message at 3.86:1.
- **Don't** use `font-medium` or any weight other than 400 and 600.
- **Don't** use Tailwind's default type scale (`text-sm`, `text-3xl`). `text-3xl` is 30px
  and is a ninth step.
- **Don't** add a second accent, and don't add a free hex colour picker. Pillar hues are
  editable only from the curated palette; the accent, ink, surfaces and block states are
  fixed.
- **Don't** animate layout properties. No `height`, no `width`, no `margin`. Bars use
  `scaleX`.
- **Don't** add shadows for decoration, nest cards, or reach for a modal before exhausting
  inline and progressive alternatives.
- **Don't** add a ninth type step or a third font weight. If something needs to stand out,
  use weight or space.
- **Don't** let an empty state render as invisible. An unfilled ring must still read as a
  ring.
