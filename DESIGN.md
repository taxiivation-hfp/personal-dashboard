---
name: Personal Dashboard
description: A private daily adherence guide — a warm ruled page you mark and close, read a dozen times a day without ever being noticed.
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
  state-drifted: "#7b746a"
  state-skipped: "#72695a"
  pillar-social: "#8c7434"
  pillar-physical: "#467c6c"
  pillar-portfolio: "#67609b"
typography:
  hero:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "3.25rem"
    fontWeight: 600
    lineHeight: 0.92
    letterSpacing: "-0.02em"
    fontFeature: "tabular-nums"
  heading:
    fontFamily: "Source Serif 4, ui-serif, Georgia, serif"
    fontSize: "1.75rem"
    fontWeight: 600
    lineHeight: 1.2
  body:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "1rem"
    fontWeight: 400
    lineHeight: 1.6
  small:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.45
  micro:
    fontFamily: "Source Sans 3, ui-sans-serif, system-ui, sans-serif"
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.35
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
  section: "44px"
  page-margin: "68px"
components:
  section-head:
    typography: "{typography.small}"
    textColor: "{colors.ink}"
    padding: "0 0 8px"
  row:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "12px 0"
  row-hover:
    backgroundColor: "{colors.off-white}"
    rounded: "{rounded.lg}"
  button-primary:
    backgroundColor: "{colors.accent-amber}"
    textColor: "#ffffff"
    typography: "{typography.small}"
    rounded: "{rounded.lg}"
    padding: "8px 16px"
  button-ghost:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.small}"
    rounded: "{rounded.full}"
    padding: "6px 14px"
  button-quiet:
    backgroundColor: "transparent"
    textColor: "{colors.muted}"
    typography: "{typography.micro}"
    padding: "0"
  chip-adhered:
    backgroundColor: "{colors.state-adhered}"
    textColor: "#ffffff"
    typography: "{typography.small}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-drifted:
    backgroundColor: "{colors.state-drifted}"
    textColor: "#ffffff"
    typography: "{typography.small}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  chip-skipped:
    backgroundColor: "transparent"
    textColor: "{colors.state-skipped}"
    typography: "{typography.small}"
    rounded: "{rounded.full}"
    padding: "4px 12px"
  input-line:
    backgroundColor: "transparent"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    padding: "0 0 2px"
  panel:
    backgroundColor: "{colors.off-white}"
    textColor: "{colors.ink}"
    typography: "{typography.body}"
    rounded: "{rounded.2xl}"
    padding: "16px 20px"
---

# Design System: Personal Dashboard

## 1. Overview

**Creative North Star: "The Unwitnessed Page"**

Nobody is watching. That is the whole system in three words, and every visual decision here
descends from it. There is no audience to perform for, so nothing celebrates. There is no
one to be ashamed in front of, so nothing scolds. What is left is a warm, plain page you
mark and close — closer to a bedside notebook than to a dashboard, and deliberately so.

The furniture is **rules and margins, not cards**. An earlier version of this app wrapped
every section in a rounded off-white panel, which made eleven identical rectangles out of
eleven different kinds of thing and turned a notebook into a dashboard. Content now sits
directly on the warm beige page, separated by hairlines, with meta hanging in a fixed left
margin the way times hang beside entries in a diary. A panel has to earn itself; exactly
one thing in the app does.

It reads at 8am at a desk and at 11pm in the dark, and it is opened a dozen times a day for
months — which is the governing constraint. Anything that rewards a first look at the cost
of the hundredth is wrong here. A surface seen this often must never be interesting.

What this system explicitly rejects: **the Duolingo / Habitica register** — streaks as a
mechanic, badges, celebration, mascots, loss-aversion. It rejects red, shame copy, and "you
failed" states. It rejects severity ramps, where three shades of worsening encode a verdict
in the palette itself. And it rejects any surface where output could be measured or
compared. Marking a block as drifted must cost exactly what marking it adhered costs; the
moment the palette makes one of them heavier, honest logging stops.

**Key Characteristics:**

- Warm beige ground, one accent, hairline rules. Restrained by doctrine, not by timidity.
- No cards by default and no shadows at all. Depth is tonal; separation is a 1px rule.
- Two families from one superfamily, split by authorship: serif for what you wrote.
- Five type steps, two weights, tabular figures on anything that changes in place.
- Motion is state, feedback and reveal only. Transform and opacity, nothing over 280ms.
- The three block states differ by **form** — filled, filled, outlined — never by severity.
- Every colour is measured against its real background before it ships.

## 2. Colors

A warm, heavily desaturated palette: nothing in it exceeds 0.098 chroma, so the page reads
as paper with one metal on it rather than as a coloured interface.

### Primary

- **Muted Amber** (`#9a6a2e`): the single accent, and the only coloured block state. It
  carries the adherence ring, primary buttons, the active tab indicator, the strip bars,
  checked non-negotiables, and focus rings. Despite the name it sits closer to aged brass
  than to signal-amber. Used on well under 10% of any screen; its rarity is the point.
- **Amber Tint** (`#f0e4d0`): the accent diluted to a background. Marks today's column in
  the strip and backs the one or two chips that need the accent's presence without its ink.

### Secondary — the three block states

Not a ramp. Three tonally equal treatments distinguished by fill and outline.

- **Adhered** (`#9a6a2e`): the accent, filled, white text at 4.69:1.
- **Drifted** (`#7b746a`): a warm grey, filled, white text at 4.62:1. Information, not alarm.
- **Skipped** (`#72695a`): a warm grey as a 1px outline plus label text, never a fill —
  4.64:1 on the page, 5.14:1 on a panel.

### Tertiary — the three pillar hues

Categorisation only. These name a domain; they never indicate status, quality, or health.
All three are owner-editable from a curated palette; nothing else in this document is.

- **Dry Ochre** (`#8c7434`): Social.
- **Deep Sage-Teal** (`#467c6c`): Physical.
- **Muted Iris** (`#67609b`): Portfolio.

### Neutral

- **Warm Beige** (`#f2ede4`): the page, and now the background of nearly everything.
- **Off-White** (`#fbf9f5`): the one earned panel, and row hover.
- **Recessed Warm** (`#efe9de`): inset surfaces. Use sparingly — it measures 1.04:1 against
  the page and disappears entirely on anything that must stay visible when empty.
- **Hairline** (`#e2dbcd`) and **Hairline Strong** (`#cfc5b2`): rules, borders and empty
  tracks. Strokes only — Hairline Strong measures 1.47:1 and must never carry text.
- **Near-Black Ink** (`#23201b`): body and heading text, 13.9:1.
- **Warm Grey** (`#6e675d`): secondary text and placeholders, 4.79:1 on the page, 5.31:1 on
  a panel. Placeholder text is text and gets this, not a hairline colour.

### Named Rules

**The One Voice Rule.** Amber is the only accent. A second accent is not a design decision,
it is a bug. The three pillar hues are categorisation and are forbidden from carrying
status, error, warning, or success meaning.

**The No-Red Rule.** There is no red in this palette and none may be added. The block states
avoid a severity ramp entirely — they differ by form, not by degree of badness. Encoding
judgement in the palette is how honest logging dies.

**The Fill-Is-Not-Ink Rule.** A colour certified as a *fill* is not certified as *text*.
Muted Amber clears 4.69:1 with white on top and is safe as a background; as text on the
page it measures **4.02:1** and fails. This has caught two real bugs. Before using any hue
as type, measure that hue against that background — not the reverse pairing it was signed
off on.

**The Chip Test.** Any hue used as a filled chip must clear 4.5:1 with white on top, not
merely 3:1 against the page. It caught `--color-physical` at 4.45, then both block-state
greys at 3.75 and 3.08. All now pass.

**The Foreign Hue Rule.** A colour arriving from outside the app — currently only a Google
Calendar `colorId` — is never used as it arrives. Google's palette runs chroma 0.105–0.226,
up to 2.3× this app's accent, and `colorId` 11 is literal signal red. It is **projected**:
hue kept, lightness and chroma replaced with fixed values (`oklch(0.56 0.045 h)`), and a
source below 0.02 chroma projects to a true grey so a grey stays grey. `L = 0.56` is not
arbitrary — at 0.58 the worst case is 4.18:1 with white and fails The Chip Test.

The result is a **stroke on the left edge of an event row and nothing else** — never a
fill, never text, never a dot. The block state keeps its own dot, so form carries status
and position carries category, and the two can never be confused. Projected hues are not
accents: they are the owner's own filing system, arriving pre-labelled by the event title
beside them. Hue rotation was tried and rejected — rotating Flamingo, Tomato and Tangerine
out of the red band collapsed all three into one identical stroke, destroying the very
categorisation the feature exists to provide.

## 3. Typography

**Display / authored text:** Source Serif 4 (variable, with the `opsz` axis)
**Interface:** Source Sans 3 (variable)

Both are self-hosted through `next/font` — no runtime request — so the laptop and the phone
render identical type. They load with `display: optional` rather than `swap`: this Next
version emits no metric-matched fallback face, so `swap` would reflow the page the moment
the font landed, and the app is opened from the home screen often enough that it is always
cached after the first visit.

**Character:** two faces from one superfamily, so they share a skeleton and pair without
arguing. The contrast between them is structural — serif against sans — which is a real
axis, unlike two sans-serifs differing only in mood.

### The Author Rule

The split is not decorative and it is not about widgets. **The serif renders what the owner
wrote; the sans renders what the app says.**

Serif: journal pages, workout logs, habit names, block and event titles, goal and subgoal
text, skill names — *including inside the inputs that hold them*, because a goal title is
the owner's either way. Plus the two things that are about the day rather than about
operating the app: the adherence numeral and page headings.

Sans: labels, chips, buttons, units, counts, times, percentages, captions, the tab bar, and
number and weight fields.

The one deliberate edge case is the coach's daily note, which takes the **serif**. Read
strictly by authorship it should not — the coach is the app talking. But the line the eye
needs is prose against chrome: it is a sentence you read, not a control you operate, and
setting the only paragraph on the screen in the label face would make it look like a system
message. Prose is the test; authorship is how prose usually gets decided.

### Hierarchy

Five steps, in rem. Not fluid: this is product UI at consistent DPI.

- **Hero** (serif, 600, 3.25rem/52px, line-height 0.92, tracking −0.02em, tabular): the
  adherence numeral and the `%` sharing its baseline. Nothing else, ever. Tracking is
  gentler than a sans numeral would want — a serif's own brackets already bridge the gaps.
- **Heading** (serif, 600, 1.75rem/28px): deeper-screen page headings only.
- **Body** (sans, 400, 1rem/16px, line-height 1.6): the default. Prose capped at 62ch.
- **Small** (sans, 400, 0.875rem/14px): dense rows, chips, controls, section headings.
- **Micro** (sans, 400, 0.75rem/12px): margin meta, times, units, fact lines, the tab bar.

### Named Rules

**The Two Weight Rule.** 400 and 600. **No 500.** `font-medium` is banned outright — a third
weight is a bug, not a choice.

**The Five Step Rule.** 12 / 14 / 16 / 28 / 52, written as the semantic utilities
`text-micro` / `text-small` / `text-body` / `text-heading` / `text-hero`. Never
`text-[15px]`, never Tailwind's default scale — `text-3xl` is 30px and is not a step here.
This replaced an eight-step scale whose middle was a lie: 12/13/14/15 carried 98 of 110
usages at ratios of 1.07–1.08, four ways of saying the same thing, while the documented 11
and 16 steps were used six times between them.

**The Tabular Rule.** Any number that changes in place gets `tabular-nums`. A percentage
that reflows as it counts is a percentage nobody trusts.

## 4. Elevation

**This system is flat, and now literally so: there are zero shadows in the application.**
Depth is communicated entirely through tonal layering and hairlines. The ramp is three
steps — page (`#f2ede4`), the earned panel (`#fbf9f5`), recessed inset (`#efe9de`) — and a
1px rule does most of the separating that a card used to do.

The last `box-shadow` was removed from the journal's delete popover. It genuinely floats,
which is the one case that would justify a lift, but it had become the only shadow in the
codebase and a single unexplained exception reads as an oversight rather than a system. The
panel surface, the hairline and the z-index already say "above".

### Named Rules

**The No-Shadow Rule.** Zero, not few. If an element needs to read as lifted, give it the
panel surface and a hairline. If that is not enough separation, the problem is the layout.

**The One Gradient Rule.** There is exactly one gradient in the interface: the border
around today in the calendar column, which fades downward toward tomorrow. It replaces
nothing — no shadow was added — and it encodes *direction*, which no flat stroke can. The
journal's ruled lines are paper texture, not a UI effect, and do not count. A second
gradient is a bug. Fills are flat, borders are flat, bars are flat.

**The Window Exception.** The furniture *inside* a column is rules and margins, not cards —
that rule was aimed at the eleven identical rectangles an earlier pass made of eleven
different kinds of thing. The three **columns themselves** are the exception, and the only
one: they are windows onto three time horizons, and a window is allowed to have an edge.
Each takes a rounded surface, a 1px hairline and a page-ground gutter. Nothing *inside* a
column may take a second surface.

Their tones differ by 1.03–1.07:1 — at or below the 1.04:1 this very section documents as
invisible. **That is intended.** The hairline and the gutter separate the windows; the tone
only tells you which one you are in, and is meant to be felt rather than seen.

**The Legible-Empty Rule.** An empty state must still be visible, and this is where the
tonal palette is most dangerous. `--color-panel-2` measures **1.04:1** against the page:
used as an empty strip track it vanished completely, and a day with no data read as no day
at all. Empty things are **outlined**, not filled — the same answer the Skipped state uses.
An unfilled ring keeps a solid `--color-line-strong` track at 1.47:1 for the same reason.
"Thin means neglected, never failed" only works if the thin thing can be seen.

## 5. Components

Quiet and tappable. Generous hit areas, hairline separation, no fills except where state
demands one. Everything is sized for a thumb at 11pm.

### The ruled page

Two shared classes carry the structure so ten components cannot each invent a near-miss
version of the same thing:

- **`.section-head`** — a heading sitting on its rule: flex, baseline-aligned,
  space-between, 8px bottom padding, 1px bottom hairline. The heading is Small at 600; an
  optional right-aligned action is a quiet Micro link.
- **`.page-margin`** — a two-column grid, `var(--page-margin)` (4.25rem) plus 1fr, 14px
  gap. Meta sits left, right-aligned, Micro, tabular, muted. The owner's words sit right in
  serif. Use it wherever real marginalia exists — a time, a count, a quantity — and never as
  decoration.

Rows are `divide-y` hairlines with 12px vertical padding. Interactive rows bleed their
hover with `-mx-2 px-2 rounded-lg` onto the Off-White surface. (Tailwind v4 gates `hover:`
behind `@media (hover: hover)`, so this is touch-safe by default.)

### Buttons

- **Primary:** Muted Amber fill, white text, 8px radius, 16×8px, Small. Hover drops opacity
  to 0.9, disabled to 0.4.
- **Ghost:** transparent, 1px Hairline Strong border, ink text, fully rounded, 14×6px. This
  is the three-way block-state selector — three equal options, no default, no recommended
  choice, one shared class string so none of them can drift heavier than the others.
- **Quiet:** bare, Micro, Warm Grey, darkening to ink with an underline on hover.
- **Focus:** a 2px amber outline at 2px offset, applied globally via `:focus-visible`. Never
  removed, never restyled per component.

### Inputs

**Lines, not boxes.** Transparent background, 1px Hairline Strong bottom border, darkening
to the accent on focus. Numeric fields are right-aligned with tabular figures. A value
written on a line rather than typed into a chip.

The exception is a **writing surface** — the journal sheet and the workout log — which keeps
its bordered page. Those are pages, not fields.

### Chips

Fully rounded, 12×4px, Small. Marked block states only. Adhered and Drifted are filled with
white text; Skipped is a 1px outline with its label in its own colour. Fill-versus-outline
is the entire distinction.

### Navigation

- **Desktop:** no chrome. Three columns separated by 1px rules — a notebook spread, not
  three floating panels — under a single date line and one quiet link.
- **Mobile:** a fixed bottom tab bar below `lg`. Translucent over a 12px backdrop blur so
  the page reads as continuing underneath, 1px top hairline, bottom padding of
  `max(0.5rem, env(safe-area-inset-bottom))`. Inactive labels are Warm Grey, active is ink —
  never a weight change, which would re-measure the text and nudge the other tabs sideways.
- A single 2px × 24px amber indicator **slides** between tabs by translating whole multiples
  of its own width. Horizontal swipe changes tab, requiring ≥56px of travel and a 1.6:1
  horizontal-to-vertical ratio so a diagonal scroll cannot flip the tab.

### Rings (signature component)

Two species share one component and must stay obviously different, or today's adherence
reads as one more quota to fill:

- **Adherence:** 176px, 8px stroke, amber, the numeral **inside**. A fine line drawn around
  a number reads as a mark on a page; a thick arc reads as a gauge.
- **Pillar:** small, pillar-hued, thin stroke, a fact line **below** — never a percentage.

Three states: **filled** (a hued arc), **empty but live** (a solid track, no arc — "0 of 2
days"), and **ghost** (a *dashed* track for a metric with no data source yet). Null never
enters the arc arithmetic; it is guarded before any maths, because coercing null to 0 would
draw a 0% ring for a day that hasn't happened.

Arcs use `stroke-linecap: butt`, never round: round caps add half a stroke width at each
end, making the smallest non-zero fills read as roughly half again their true value. The
ring would overstate exactly where honesty matters most. Overdrive past the threshold draws
a second translucent lap at 0.45 opacity and 42% stroke width, capped at 2×.

### Motion

- **Easings:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or
  responding; `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for something crossing the
  screen. **There is deliberately no ease-in token** — it delays the first moment, which is
  exactly when the eye is watching.
- **Durations:** `--dur-press` 140ms, `--dur-fast` 180ms, `--dur-modal` 240ms, `--dur-data`
  280ms. Nothing exceeds 280ms.
- **Three travel classes, and nothing animates outside them:** `.motion-data` (280ms
  transform — bars, progress), `.motion-slide` (180ms transform — the tab indicator),
  `.motion-arc` (280ms stroke-dasharray — ring arcs). All three are nulled under
  `prefers-reduced-motion`. The arc lives in a class rather than an inline style precisely
  so reduced motion can reach it: an inline style would need `!important`, and the blanket
  reduced-motion rule only nulls `animation-*`, never `transition`.
- **Press feedback:** every enabled button scales to 0.97 on `:active`. Felt, not watched,
  and load-bearing: an app whose value depends on marking things quickly must confirm the
  tap landed.
- **Dialogs:** enter from `scale(0.97)` and opacity 0 over 240ms, exit at 180ms. Never from
  `scale(0)` — nothing in the real world appears out of nothing. Exit is faster than entry
  because the system responding should outpace the system presenting.
- **Reduced motion:** gentler, not none. Movement goes; colour and opacity stay. A blanket
  `0.01ms` on everything would also flatten the dialog's `allow-discrete` transitions and
  make modals pop.

### Named Rules

**The Transform-Only Rule.** Animate `transform` and `opacity`. Bars translate or scale,
never `width`/`height`. No element in the app transitions height, width, margin, padding,
top, left, bottom or right — verified in the browser, not assumed.

**The Pressable Rule.** Every interactive element confirms the tap. A control that does not
move on press leaves you unsure it registered.

## 6. Do's and Don'ts

### Do:

- **Do** treat the adherence numeral as the only element with real presence. Serif, 52px,
  600, tabular, tracking −0.02em. Nothing else may compete.
- **Do** measure every colour against its actual background, in the direction you are using
  it. A fill certification is not a text certification.
- **Do** reach for a rule before a card, and a hairline before a shadow.
- **Do** put meta in the margin with `.page-margin`, and use `.section-head` for headings.
- **Do** keep meaning off hue alone — a label, shape or position must carry it too.
- **Do** print the real number beneath any capped ring (`11 of 8 days`). The arc caps; the
  text never does.
- **Do** distinguish the three block states by **form** — filled, filled, outlined.
- **Do** make empty states outlined and visible. An unfilled thing must still read.
- **Do** give every animation a `prefers-reduced-motion` path by using one of the three
  travel classes.

### Don't:

- **Don't** build anything in the **Duolingo / Habitica** register. No XP, levels, points,
  badges, mascots, confetti, celebration, or loss-aversion. The streak is a plain count of
  days logged and must never be dramatised.
- **Don't** use red. Anywhere. Not for errors, not for drift, not for delete. An error
  stands out by weight — ink at 600 — because there is no alarm colour in this system.
- **Don't** build a severity ramp. Three shades of worsening grey encode a verdict, and a
  person who feels judged logs inaccurately.
- **Don't** measure, score, rank, or compare output — not between days, not between
  fortnights, not between pillars.
- **Don't** use a pillar hue as a status colour, or the accent as text.
- **Don't** wrap a section *inside* a column in a panel because it needs separating. Use a
  rule. Within a column a panel must earn itself, and exactly one thing does. The three
  columns themselves are the one sanctioned exception — see The Window Exception.
- **Don't** add a shadow. The count is zero and should stay zero.
- **Don't** add a second gradient. The count is one — today's border — and should stay one.
- **Don't** use a Google `colorId` as it arrives, or let a projected hue become a fill, a
  text colour or a status mark. See The Foreign Hue Rule.
- **Don't** let the productivity figure acquire a colour, a target line, a best-week
  marker, or a week-over-week delta. It is graphite on paper — a record, not a scoreboard.
- **Don't** use `font-medium`, or any weight other than 400 and 600.
- **Don't** use Tailwind's default type scale or an arbitrary `text-[Npx]`.
- **Don't** add a second accent or a free hex colour picker. Pillar hues are editable only
  from the curated palette; the accent, ink, surfaces and block states are fixed.
- **Don't** animate a layout property, or write a transition inline where reduced motion
  cannot override it.
- **Don't** set a filled input where a line will do, or reach for a modal before exhausting
  inline and progressive alternatives.
