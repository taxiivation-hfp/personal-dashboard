---
name: Personal Dashboard
description: A private daily adherence guide — a warm ruled page you mark and close, read a dozen times a day without ever being noticed.
colors:
  accent-amber: "#9a6a2e"
  accent-deep: "#7a5322"
  accent-tint: "#f0e4d0"
  warm-beige: "#f2ede4"
  off-white: "#fbf9f5"
  recessed: "#efe9de"
  hairline: "#e2dbcd"
  hairline-strong: "#cfc5b2"
  hairline-edge: "#bfb49f"
  ink: "#23201b"
  muted: "#6e675d"
  placeholder: "#6e675d"
  state-adhered: "#9a6a2e"
  state-drifted: "#7b746a"
  state-skipped: "#72695a"
  pillar-health: "#467c6c"
  pillar-career: "#7d5a72"
  neutral-no-pillar: "#7b746a"
  floor-line: "#b0483a"
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
  popover:
    backgroundColor: "{colors.off-white}"
    textColor: "{colors.ink}"
    rounded: "{rounded.xl}"
    border: "1px {colors.hairline-strong}"
    outline: "2px {colors.warm-beige}"
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
margin the way times hang beside entries in a diary. A panel has to earn itself; the things
that do are named in §4.

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
- Motion is state, feedback and reveal only. Transform and opacity, nothing that you TOUCH
  over 280ms.
- The three block states differ by **form** — filled, filled, outlined — never by severity.
- Every colour is measured against its real background before it ships.

## 2. Colors

A warm, heavily desaturated palette: nothing in it exceeds 0.098 chroma, so the page reads
as paper with one metal on it rather than as a coloured interface.

### Primary

- **Muted Amber** (`#9a6a2e`): the single accent, and the only coloured block state. It
  carries the adherence ring, the adherence tracker's line and area, primary buttons, the
  active tab indicator, checked non-negotiables, one-off non-negotiables, the worked-fraction
  slider's fill, and focus rings. Despite the name it sits closer to aged brass than to
  signal-amber. Used on well under 10% of any screen; its rarity is the point.
- **Amber Tint** (`#f0e4d0`): the accent diluted to a background, for the one or two chips
  that need the accent's presence without its ink.
- **Deep Amber** (`#7a5322`): **the accent one step down in lightness, and not a second
  accent.** It exists for exactly one figure — the adherence tracker's *average*, printed
  over a 0.16-alpha wash of the accent's own colour. A number set over a tint of itself has
  to be darker than that tint or it dissolves into it, and the alternative was to print the
  average in ink, which would have made the one figure on the card the one thing on it that
  was not amber. The shift is the same move `segmentShade` makes on a pillar hue, which is
  why it is not a new colour so much as a known one, stepped.

  Measured **on the ground it is actually printed on** — the tracker's `.record-card`, i.e.
  `--color-panel`, not the gold window the card sits inside: **6.47:1**, and 6.5:1 under the
  card's own white top gradient. It measures 5.69:1 on `--color-surface-3`, which also
  passes; the pair recorded is the pair on screen, so that the next reader retuning the
  card's ground is checking a number about a surface the numeral touches.

### Secondary — the three block states

Not a ramp. Three tonally equal treatments distinguished by fill and outline.

- **Adhered** (`#9a6a2e`): the accent, filled, white text at 4.69:1.
- **Drifted** (`#7b746a`): a warm grey, filled, white text at 4.62:1. Information, not alarm.
- **Skipped** (`#72695a`): a warm grey as a 1px outline plus label text, never a fill —
  4.64:1 on the page, 5.14:1 on a panel.

### Tertiary — the two pillar hues

Categorisation only. These name a domain; they never indicate status, quality, or health.
Both are owner-editable from a curated palette; nothing else in this document is.

- **Moss** (`#467c6c`): **Health**. 4.02:1 on the page as a stroke, 4.68:1 with white on top.
- **Plum** (`#7d5a72`): **Career**. 5.09:1 on the page as a stroke, 5.93:1 with white on top.

**There were three, and the third is gone — the owner's ruling, 2026-09-18, replacing the
Social / Physical / Portfolio set.** Socialising "comes naturally in between blocks" and is
no longer planned or tracked, so Social's **Dry Ochre** (`#8c7434`) left the token set with
the feature; `--color-social` is deleted and nothing reads it. The hue itself survives in
the curated palette as **Clay**, selectable for either remaining pillar — a colour is not
the thing it was used for, and deleting a good value from an eight-swatch palette because
one feature stopped needing it would be throwing away the palette to make a point about the
feature.

Career's Plum **replaced Muted Iris** (`#67609b`) in the same ruling. The live database row
carried Rust (`#9a6448`) at the time, which sat almost on top of the amber accent — a pillar
hue a hair from the one accent is a pillar hue that reads as status. The CSS token **keys**
stay `--color-physical` and `--color-portfolio`: renaming a live database key is churn, and
the names a person reads come from `PILLAR_NAME` in `rings.ts` and only from there.

### Neutral — and the absence of a pillar

- **Warm Beige** (`#f2ede4`): the page, and the background of nearly everything.
- **Off-White** (`#fbf9f5`): the earned panel, the popover ground, and row hover.
- **Recessed Warm** (`#efe9de`): inset surfaces. Use sparingly — it measures 1.04:1 against
  the page and disappears entirely on anything that must stay visible when empty.
- **Hairline** (`#e2dbcd`), **Hairline Strong** (`#cfc5b2`) and **Hairline Edge** (`#bfb49f`):
  rules, borders, empty tracks, and the three steps of the window bevel — 1.18:1 / 1.47:1 /
  1.76:1 against the page. Strokes only; none of the three may ever carry text.
- **Near-Black Ink** (`#23201b`): body and heading text, 13.9:1.
- **Warm Grey** (`#6e675d`): secondary text and placeholders, 4.79:1 on the page, 5.31:1 on
  a panel. Placeholder text is text and gets this, not a hairline colour.
- **No Pillar** (`#7b746a`): the tick colour of a non-negotiable that belongs to neither
  pillar — Journal, Read, Tidy room. 3.97:1 on the page as a mark, 4.62:1 with white on top,
  which it must clear because a habit tick is a filled box with a white tick inside it.

  **It is deliberately the same value as Drifted rather than a ninth invented neutral.** That
  grey is already certified in both directions, which is exactly what a tick needs, and a
  second warm grey a point or two away would be a distinction nobody could see defended by a
  token nobody could justify. They are kept as two names because one is a BLOCK STATE and the
  other is the ABSENCE OF A PILLAR: renaming or retuning either must not silently move the
  other, and the day drift wants a different grey is the day this pays for itself.

### The one red

**Floor Line** (`#b0483a`), at the owner's explicit direction, for exactly one mark: the
dotted floor line on the calories and steps charts. A brick red desaturated to sit on this
paper — 5.2:1 on the panel, clearing the stroke floor and the small-text floor both. It is
**not** a state colour. No block state, no error, no chip may ever take it, or the no-red
rule that protects honest logging is gone for a chart accent. The rule that keeps this
exception from spreading is DIRECTION: a floor is a line you climb to, so a day under it
reads "not yet". A ceiling or a goal is a line you can be found wanting against, and this
app draws none.

### Named Rules

**The One Voice Rule.** Amber is the only accent. A second accent is not a design decision,
it is a bug. Deep Amber is the accent stepped, not a second one, and it has exactly one
consumer named in this document; if it acquires a second the rule has been misread. The two
pillar hues are categorisation and are forbidden from carrying status, error, warning, or
success meaning.

**The No-Red Rule.** There is one red, it draws a floor on two charts, and it is named
above. Nothing else may be red — not errors, not drift, not delete. The block states avoid a
severity ramp entirely: they differ by form, not by degree of badness. Encoding judgement in
the palette is how honest logging dies.

**The Fill-Is-Not-Ink Rule.** A colour certified as a *fill* is not certified as *text*.
Muted Amber clears 4.69:1 with white on top and is safe as a background; as text on the
page it measures **4.02:1** and fails. This has caught two real bugs. Before using any hue
as type, measure that hue against that background — not the reverse pairing it was signed
off on.

**The Chip Test.** Any hue used as a filled chip must clear 4.5:1 with white on top, not
merely 3:1 against the page. It caught `--color-physical` at 4.45, then both block-state
greys at 3.75 and 3.08. It is also what settled Career's Plum: 5.93:1 with white, against
Iris's marginal pass, on a hue that now fills the written log's outreach tabs.

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

The projections now have exactly one consumer: the **hours by category** stack on the
record. Graphite (`colorId "8"`) is ignored app-wide by the owner's ruling and reaches no
chart at all.

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

Serif: journal pages, workout logs, habit names, block and event titles, task titles, goal
and subtask text — *including inside the inputs that hold them*, because a goal title is the
owner's either way. Plus the things that are about the day rather than about operating the
app: the adherence numeral, the pillar percentages, the tracker's average, and page
headings.

Sans: labels, chips, buttons, units, counts, times, percentages in fact lines, captions, and
number and weight fields.

The test that decides an edge case is **prose against chrome**, and authorship is only how
prose usually gets decided. The case that set it was the coach's daily note — a sentence you
read rather than a control you operate, so it took the serif even though the coach was the
app talking. The coach is gone; the test is not, because the next paragraph-shaped thing
will face the same question.

### Hierarchy

Five steps, in rem. Not fluid: this is product UI at consistent DPI.

- **Hero** (serif, 600, 3.25rem/52px, line-height 0.92, tracking −0.02em, tabular): the
  adherence numeral and the `%` sharing its baseline. Nothing else, ever. Tracking is
  gentler than a sans numeral would want — a serif's own brackets already bridge the gaps.
- **Heading** (serif, 600, 1.75rem/28px): page headings, the pillar percentage in a ring's
  centre, and the tracker's average.
- **Body** (sans, 400, 1rem/16px, line-height 1.6): the default. Prose capped at 62ch.
- **Small** (sans, 400, 0.875rem/14px): dense rows, chips, controls, section headings.
- **Micro** (sans, 400, 0.75rem/12px): margin meta, times, units, fact lines, part lists.

`.stat-hero` is the class that carries serif + 600 + tabular figures + the −0.02em, and it
is applied to every number that is a FIGURE rather than a row value. Never write
`font-serif` or `tabular-nums` beside it; that is what the class is for.

### Named Rules

**The Two Weight Rule.** 400 and 600. **No 500.** `font-medium` is banned outright — a third
weight is a bug, not a choice.

**The Five Step Rule.** 12 / 14 / 16 / 28 / 52, written as the semantic utilities
`text-micro` / `text-small` / `text-body` / `text-heading` / `text-hero`. Never
`text-[15px]`, never Tailwind's default scale — `text-3xl` is 30px and is not a step here.
This replaced an eight-step scale whose middle was a lie: 12/13/14/15 carried 98 of 110
usages at ratios of 1.07–1.08, four ways of saying the same thing, while the documented 11
and 16 steps were used six times between them.

The one sanctioned exception is the **journal page**, whose type is fluid in `cqw`. A page
is not the app speaking; it is an artefact, and sizing it to its own paper is what makes a
thumbnail the page in miniature rather than a full-size page cropped to a stamp.

**The Tabular Rule.** Any number that changes in place gets `tabular-nums`. A percentage
that reflows as it counts is a percentage nobody trusts.

## 4. Elevation

**This system is flat: there are zero shadows in the application.** Depth is communicated
entirely through tonal layering and hairlines. The ramp is three steps — page (`#f2ede4`),
the earned panel (`#fbf9f5`), recessed inset (`#efe9de`) — and a 1px rule does most of the
separating that a card used to do.

The last `box-shadow` was removed from the journal's delete popover. It genuinely floats,
which is the one case that would justify a lift, but it had become the only shadow in the
codebase and a single unexplained exception reads as an oversight rather than a system. The
panel surface, the hairline and the z-index already say "above".

### What earns a surface

Four things, and the list is closed:

1. **The three windows** — see The Window Exception.
2. **`.record-card`** — the chart cards on the record, and the adherence tracker. The
   window's own treatment at a smaller scale: the same three-step bevel, a 14px radius, the
   same top light with a shorter throw (120px rather than 220px), so they read as smaller
   panes of the same glass rather than as a new component. `--card-bg` is set per card.
3. **`.popover`** — the third floating thing, after the dialog and the timeline's cards. The
   drifted editor beside a block row, and the `+N more` task list beside the hero.
4. **The dialog.**

**The popover takes no shadow either, and that is the interesting one.** It genuinely
overlaps content, which is the classic argument for a lift. What separates it instead is an
OPAQUE ground plus the window's own three-step bevel and a 2px halo in the page colour — a
cut-out rather than a lift. It reads as "in front" because it *interrupts* what is behind
it, which is the honest cue and costs no new colour. Positioning is the caller's: the class
sets no top/left and no z-index beyond `--z-popover`, so one popover can be fixed to the
viewport and another absolute inside a card.

### Named Rules

**The One Lamp Rule.** *(replaces The One Gradient Rule)* There is a single light source,
above the page at twelve o'clock, outside the frame. Every gradient in the interface must be
derivable from it — and **no gradient may encode a value.** The second clause is the
load-bearing one: a bloom that brightened as adherence climbed would make marking a block a
reward, so the bloom is pixel-identical at 0% and at 100%, and **nothing you MARK catches the
light at all** — not the block states, not the habit boxes, not the subtask ticks. Marking
"adhered" must cost exactly what marking "drifted" costs. The hero ring's `bloom` and a
pillar's `glow` are both BOOLEANS for this reason: they can be on or off and can never be
given a value.

The old rule counted gradients. This one is stricter in the way that matters, and still
falsifiable by an engineer reading a diff, which is the property worth keeping.

The light only ever **lifts**, never darkens. On warm paper there is no room above white for
a highlight, so light reads as the surface itself being brighter where it is hit — and
because it only adds, nothing needed re-certifying. Windows take a 220px falloff of white at
0.38 from their top edge and every measured value improved (muted on the gold window 4.67:1
→ 5.00:1). Ring tracks ≥48px run lit at the top to shaded at the foot: **the track is the
OBJECT and the arc is the DATUM**, and a gradient on the arc would mean a 25% day, drawn
entirely in the lit upper arc, looked brighter than a 100% day.

**The No-Shadow Rule.** *(narrowed, not repealed — see The One Lamp Rule)* Three exceptions
and no others: one **annular bloom** behind the hero adherence ring, peaking at the ring's
own radius with a clear inner disc so no hero glyph ever sits on tint; the **pillar bloom**,
the same annulus in the pillar's own hue, mixed with `color-mix` because a pillar hue is
owner-editable and arrives as an arbitrary value with no channel token to split; and **blur
on `dialog::backdrop`**, never on the panel. Blurring the panel would buy transparency with
a contrast ratio and force every `--color-panel` certification to be re-run against whatever
happens to pass beneath a modal. What reads as glass is the blur, not the alpha.
`prefers-reduced-transparency` gets a real alternative rather than an absence: the blur goes
and the dim goes *up* to 0.34, past the 0.28 it started at, because 0.28 was chosen with no
blur to help it.

The **streak pill's** soft glow is the fourth and last, and it is the owner's own 2026-08-24
exception rather than this document's: streak pills only, and nothing you MARK may catch
light.

Everything else that looks lifted is a **lift** — a gradient that adds light — which is a
different mechanism from a shadow and implies no cast object. Windows also carry a
three-step bevel (lit top edge, mid sides, shaded bottom) drawn entirely inside the border
box, so three panes still sit 16px apart without the gutters filling with soft grey.

*Both of the above superseded two rules that shipped for most of this project's life, kept
here because the reasoning is still the reasoning:*

> **The old No-Shadow Rule.** Zero, not few. If an element needs to read as lifted, give it
> the panel surface and a hairline. If that is not enough separation, the problem is the
> layout. — *Still true of everything except the named exceptions. Nothing in this app
> casts, and the popover is the proof that "it floats" is not on its own an argument.*
>
> **The old One Gradient Rule.** There is exactly one gradient in the interface: the border
> around today in the calendar column, which fades downward toward tomorrow. A second
> gradient is a bug. — *Replaced because a light layer cannot survive a gradient count. Its
> subject outlived it by less: the calendar column was deleted on 2026-09-18 and `.today-mark`
> now has no consumer. **The class is kept deliberately** — it is the app's one gradient that
> encodes DIRECTION, and re-deriving the mask, the stops and the measured ratios (4.39:1 at
> the top edge, 1.46:1 at 70% down) would cost more than the twenty lines it occupies.*

**The Hue-Not-Lightness Rule.** This palette's lightness range is spent. `--color-muted`
needs a surface at or above `oklch(0.9268)` to hold 4.5:1, which is 0.02 L below the page,
so surfaces cannot spread downward — a `#e4dccd` page drops muted to 4.10:1 and skipped to
3.97:1. Surfaces that must differ from each other therefore differ by **hue at near-equal
lightness**: the three windows sit at hue 82 / 120 / 68 — a warm near-white, a cool paper
with a lilac cast, and a gold. A contrast ratio near 1.00 between two of them is expected
and fine; the ratio measures luminance, and luminance is not what separates them.

**The Window Exception.** The furniture *inside* a column is rules and margins, not cards —
that rule was aimed at the eleven identical rectangles an earlier pass made of eleven
different kinds of thing. The three **columns themselves** are the exception: they are
windows onto three views of the day, and a window is allowed to have an edge. Each takes a
rounded 16px surface, the three-step bevel and a page-ground gutter.

The three, left to right, with their surfaces and their flex:

| Window | Surface | `--panel-grow` | `--panel-min` |
|---|---|---|---|
| **Blocks** | `--color-surface-2` (`#f2f1f5`, cool paper, lilac cast) | 1 | 15rem |
| **Today** | `--color-surface-1` (`#fffdf9`, warm near-white) | 1.7 | 26rem |
| **Recent** | `--color-surface-3` (`#f5e9dd`, gold) | 1.25 | 17rem |

**The leftmost window used to be the CALENDAR — nine days, past and upcoming — and it is now
the BLOCKS window: today's list and nothing else** (the owner's ruling, 2026-09-18). The
surface did not move, and that is the point of naming it here: `--color-surface-2` was chosen
as "the column of days AROUND today, quieter than the hero column beside it", and it is now
"the list you are marking, quieter than the figure it feeds". Both readings want the same
cool paper, so retuning it for the new job would be moving a token to say something it
already said.

Two tokens outlived the column they were built for. `--color-recorded` (`#fdefdc`) survives
on the catching-up bar, which is the one place a past day still dresses itself. `--color-today`
(`#f8ead0`) and `--color-ahead` (`#fcfbf9`) have no consumer at all now: a nine-day view was
the only surface that needed to say "this row is today" and "this row has not happened". They
are kept, unread, for the same reason `.today-mark` is.

Source order is **today → blocks → pillars**, with `order-1 / order-2 / order-3` putting them
on screen in the other order. The document leads with the day's work because that is what the
phone gets.

Their tones differ by 1.03–1.11:1 — at or near the 1.04:1 this very section documents as
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
  optional right-aligned action is a quiet Micro link. The Blocks window's head carries
  **TIMELINE** in exactly this slot — a word tracked out at 0.18em, not a chip, because it
  is a place rather than an action.
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
- **Quiet:** bare, Micro, Warm Grey, darkening to ink with an underline on hover. `undo` and
  `dismiss` on a block row share one string, deliberately: neither is a fourth state, and a
  destructive-looking `dismiss` beside a neutral `undo` would read wrong.
- **Focus:** a 2px amber outline at 2px offset, applied globally via `:focus-visible`. Never
  removed, never restyled per component.

### Inputs

**Lines, not boxes.** Transparent background, 1px Hairline Strong bottom border, darkening
to the accent on focus. Numeric fields are right-aligned with tabular figures and carry no
spinner — WebKit reveals its stepper on hover only and eats 14px of a 40px field, which
overflows a column under the pointer and nowhere else. A value written on a line rather than
typed into a chip.

The exception is a **writing surface** — the journal sheet and the workout log — which keeps
its bordered page. Those are pages, not fields.

**The worked-fraction slider** is the one native `range` in the app, because it is dragged
with a thumb on a phone and nothing hand-rolled tracks a finger as well as the platform
does. Its 3px track fills in the **accent, not the drift colour**: this bar is the part you
*worked*, it feeds the amber ring, and the same quantity must not change colour between the
control that sets it and the figure that reports it.

### Chips

Fully rounded, 12×4px, Small. Marked block states only. Adhered and Drifted are filled with
white text; Skipped is a 1px outline with its label in its own colour. Fill-versus-outline
is the entire distinction.

### Navigation

- **Desktop:** no chrome. Three windows under a single masthead, with one quiet word
  (TIMELINE) and one quiet link (The record) as the only ways deeper.
- **Mobile: two panes, and no tab bar.** The bar was removed by the owner's ruling — the
  panes are reached by tapping the window you want, which stands collapsed to a single title
  row when it is not the open one, and by swiping. A horizontal swipe changes pane, requiring
  ≥56px of travel and a 1.6:1 horizontal-to-vertical ratio so a diagonal scroll cannot flip
  it; it never steals a gesture from the journal canvas, an input, or an open dialog.
- **There were three panes until 2026-09-18.** The calendar pane went with its column: the
  phone's Today pane now carries the day's blocks above its checklist, which is where a hand
  marking them already is, so a pane of its own would be a second place to reach for the same
  list. `/stats` is deliberately not a pane — it is a route, and a swipe that navigated the
  browser would be a gesture you cannot undo with the same gesture.
- Removing a navigation control must never strand a screen: `/stats` is reached from
  `StatsLink` and left by the record's own ×, which falls back to `href="/"` when there is no
  in-place close to call.

### Rings (signature component)

Two species share one file and must stay obviously different, or today's adherence reads as
one more quota to fill:

- **Adherence:** **240px, 10px stroke**, amber, the 52px numeral **inside**, with the annular
  bloom behind it. A fine line drawn around a number reads as a mark on a page; a thick arc
  reads as a gauge. It is the largest thing on the screen and the only ring with a bloom.
- **Pillar:** one **segmented donut** per pillar, pillar-hued, **200px at 12px stroke** side
  by side in the Recent window, **216px at 13px** when one is opened, **170px at 11px** on
  the record. The centre prints the pillar %; the parts are listed underneath.

Three states: **filled** (a hued arc), **empty but live** (a solid track, no arc — "0 of 2
days"), and **ghost** (a *dashed* track for a metric with no data source yet). Null never
enters the arc arithmetic; it is guarded before any maths, because coercing null to 0 would
draw a 0% ring for a day that hasn't happened.

**`dashed` is an explicit prop, not inferred from `fill == null`.** Those are two different
statements and conflating them put the app's own "nothing is wired up" dashes on the hero
element every morning: the adherence ring passes null until something is due, which is not
a missing data source. Ghost metrics pass `dashed`; nothing else does.

#### The segmented donut — the drawing rules

**ONE THICKNESS, ONE RADIUS, NO BANDS — the owner's ruling, 2026-09-18, replacing the
three-radius ring** (inner donut, mid band, outer lap) and the arc-riding labels.

- **Arc length is the part's weight.** Health's five weights sum to 1 — Strength 40, Cardio
  15, ASC.ND 15, Steps 15, Calories 15, normalised — so Strength owns most of the circle and
  the ring shows what each part is *worth* as well as how full it is. Career divides the
  circle into **equal** arcs, one per counted goal, because a goal is not worth more than
  another goal for having a nearer deadline.
- The amount of colour around the whole donut IS the pillar's figure. One glance, one shape,
  no arithmetic.
- **`r = (size - stroke) / 2`.** One radius. The SVG's logical box is exactly `size × size`
  with no label pad, drawn at `width="100%"` inside a wrapper capped at `maxWidth: 100%` — so
  a 200px ring in a 150px column scales down as one object instead of clipping or reflowing
  into a different chart. The consuming span needs `max-w-full` too, or a shrink-wrapped
  `inline-flex` reports the ring's full width back to the cap and two rings overlap on a
  390px phone.
- **A gap of 0.012 of the circle** between slices. Small — the slices should read as one ring
  divided, not as separate arcs floating near each other.
- Each slice draws a **track** (dashed when that arc's fill is null) and a **fill** over it,
  `pathLength={1}` with `strokeDasharray="1 1"` and an offset, so the arc animates on
  `.motion-arc` without changing its `d` — which is not animatable.
- **Butt caps, never round:** a round cap adds half a stroke width at each end, which would
  both overstate a small fill and spill into the neighbouring slice. The ring would overstate
  exactly where honesty matters most.
- Slices are real **arc paths, not dashed circles**. A slice that must *also* be dashed
  cannot use `strokeDasharray` for both its dash pattern and its wedge offset.
- **A whole-ring ghost** is one dashed full circle with no arcs read at all — Career with no
  counted goal, whose centre says `no goals` and **never "0%"**. An empty arc list that is
  *not* a ghost draws one plain solid track: "not loaded yet" is not "no source", and dashes
  mean the latter.
- **Shades, not labels.** Each slice takes `segmentShade(hue, i)` — five steps of ±L/±S off
  the pillar's own hue, distinct at a glance and nothing near a rainbow — and the part list
  under the ring wears the same shades at the same indices. A legend that computes its own
  shades is a legend that eventually disagrees with the chart. Five steps is exactly Health's
  five parts; Career's arcs cycle back to step 0 at the sixth goal, which is correct, because
  a sixth goal is not a sixth kind of thing.

**What went, and why it is not coming back.** The mid band and the thin outer lap existed for
Social's recurrence split and for Portfolio's project-hours lap, both of which the pivot
removes. **Overdrive** — the second translucent lap drawn past a threshold — drew past a
threshold Career does not have, and Health's parts are already told in full in the text
beneath. The **arc-riding labels** were solving "which arc is which" for a ring whose parts
are now printed in a list directly under it, in the same shades: three radii and a fan-out
relaxation loop were a lot of geometry to say what five lines of text say better.

The cap that the labels' old rule protected still holds and is still the mechanism: **a part
fills toward a threshold and caps at 1**, so 20 strength sessions fill exactly what 8 do, and
overdoing one part can never fill another. What you see is the truth; what counts is the cap.
The real number is still printed beneath the ring.

### The adherence tracker

**This replaced the seven-day week strip** — the owner's ruling, 2026-09-18. The strip was
four rows in one card (a percentage per column, a 3px bar under each, a stacked productivity
column under that, weekday letters, and a transparent button laid over all four). It said
four things at once, one of which — the score — has since been deleted outright, and the
adherence half of it was seven separate bars the eye had to join up itself.

A `.record-card` in the Recent window. Head: `average` on the left, the figure on the right
in Heading serif, coloured Deep Amber.

- **A line with the area filled under it**, for the **seven days BEFORE today**, always
  anchored to the real today. That anchoring is the strip's own rule and it is worth
  restating: a chart that travelled with the screen could only ever be walked backwards, and
  it would rescale against a different week's high at every step. Fixed, it is a ruler.
- **Y is fixed 0–100**, never scaled to the week's high. Adherence is the one series in this
  app with a real ceiling, and scaling it to itself would make a week of 40s look like a week
  of 100s.
- Geometry: a 280×96 viewBox, 6px side padding, 8px top and bottom, eight slots at 268/7,
  the 0% line and the area's foot on the same y so a day at zero meets the baseline rather
  than floating above it. Drawn at `width="100%"` with the **default** `preserveAspectRatio`
  — `none` would shear the dots into ellipses.
- The **area** is the accent at 0.16 alpha, no stroke. The **line** is 2px accent, round
  joins. Past dots are solid accent at r=3.
- **Today is drawn apart:** a hollow dot (r=3.5, filled in the card's own ground, 1.75px
  accent stroke) on a **dashed** segment (`4 3`), on the line but **not under the area and
  not in the average**. It is a day in progress; the figure only climbs, so averaging a
  morning in with six finished days would drag the week down for no reason other than the
  hour.
- **The viewed day's dot takes a 1.5px ink ring** (r=5.5, unfilled), and its x-label is
  underlined. Stepping the dashboard back must be legible on the chart that steps it.
- **The average is the mean of the seven past days with every zero counted.** A week with two
  days off IS a week with two days off, and dropping them would make the figure a story about
  which days you looked at.
- **Tap targets are eight transparent rects**, full height, each focusable with an Enter/Space
  handler and an aria-label reading the date and the percentage. Tapping one steps the whole
  dashboard to that day.
- **Nothing else.** No tooltips, no gridline numbers, no axis ticks, no productivity, no
  legend, no streak flame, no target line, no comparison.

**CLAUDE.md's "no average" rule is REMOVED by the owner for this one figure.** It survives
everywhere else, and on `/stats` in particular, where a window average would be a verdict on
a quarter rather than a description of a week. Do not read this as licence.

### Floating tasks

The day's tasks are **small cards in the empty space either side of the hero ring**,
alternating left and right, up to six, with a `+N more` card opening the rest in a popover.
No tasks draws **nothing** — no empty rails, no placeholder.

Their tick boxes are **ink, not a pillar hue**, because a task belongs to no pillar. There is
no `not scored` label in this layout: the cards are not a list, they carry no rule and no
heading to hang the word off, and there is nowhere honest to put it. The label survives on
`/habits`, which is where tasks are written.

### Motion

- **Easings:** `--ease-out: cubic-bezier(0.23, 1, 0.32, 1)` for anything entering or
  responding; `--ease-in-out: cubic-bezier(0.77, 0, 0.175, 1)` for something crossing the
  screen. **There is deliberately no ease-in token** — it delays the first moment, which is
  exactly when the eye is watching.
- **Durations, interaction:** `--dur-press` 90ms, `--dur-release` 220ms, `--dur-fast` 180ms,
  `--dur-modal` 240ms, `--dur-data` 280ms. Nothing you *touch* exceeds 280ms.
- **Press is split in two.** One duration in both directions makes a button feel like a
  rectangle changing size; a fast press and a slow recovery makes it feel like an object with
  mass. The press is you, and you are not slow. It lands on the global button rule, so
  Adhered / Drifted / Skipped share one code path and cannot drift apart in feel — honest
  logging preserved by construction rather than by keeping three class strings in step.
- **Durations, spatial:** two, both past the cap and both deliberate. `--dur-panel` 520ms for
  the three windows opening and closing as one layout — the record grows leftward by exactly
  the width the other two give up, and 40ms of difference would read as two things happening
  near each other rather than as one boundary being dragged. It takes `--ease-in-out`, not
  `--ease-out`: everything else in this app is a thing ARRIVING, which wants a fast start;
  a dragged edge accelerates and decelerates at both ends. And `--dur-expand` 630ms for the
  record and a pillar opening — at 280ms a spatial move reads as a cut with a smear on it,
  and the whole point of animating one is that you can follow the object. Both are entered
  deliberately and infrequently, so the cost lands nowhere near the taps that matter.
- **Three travel classes, and nothing animates outside them:** `.motion-data` (280ms
  transform — bars, progress), `.motion-slide` (180ms transform — the record link's arrow),
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
- **The ring FLIP** is the one measured-layout move: a pillar's ring and name are measured
  before and after the open, and the difference is released as a transform. The ring travels;
  the body arrives behind it on `.detail-enter`'s staggered delay.
- **Reduced motion:** gentler, not none. Movement goes; colour and opacity stay. A blanket
  `0.01ms` on everything would also flatten the dialog's `allow-discrete` transitions and
  make modals pop.

*Two motion classes were deleted with their only consumers, and are noted so nobody
re-derives them: `.motion-spark` / `@keyframes spark-rise` belonged to the record link's
14-bar sparkline, and `.pillar-enter` / `.pillar-ghost` to the three-pillar ghost-and-push
machinery. With two pillars the unchosen one simply unmounts, and the record link is now a
word and an arrow.*

### Named Rules

**The Resting-State Rule.** *(violated twice before it was written down)* An element's
RESTING style must be its VISIBLE style, and an entrance may only ever be decoration on top
of that. Never mount something hidden and reveal it from JavaScript.

The failure is specific and it shipped twice: `requestAnimationFrame` does not fire in a
hidden tab, so a component that mounts at `opacity: 0` and releases in a rAF stays invisible
for anyone who opened the app in a background tab — the sparkline shipped blank, and the
record opened as a frozen thumbnail. Both looked fine in a focused window, which is why it
happened twice.

The correct form is `@starting-style`: the browser owns the from-state, the rule owns the
resting state, and if the transition never runs the element is simply already there. It is
also what makes `prefers-reduced-motion` honest — nulling the transition leaves the element
visible instead of collapsed.

**The One Overshoot Rule.** Exactly one easing in this app leaves the 0..1 range:
`--ease-expand`, at **1.08**, used only for the record opening out of the Recent window. The
owner asked for that expansion to feel "bubbly"; bounce and elastic are banned and both bans
are right. A back-curve at 1.5+ is the dated boing the ban is aimed at, and this is a
fraction of it — a drawer settling rather than a ball landing. It was 1.15 and came **down**
when the move was slowed to 630ms: overshoot AMPLITUDE is duration-independent, so a longer
move holds the same bounce on screen half again as long and it stops reading as a settle.
**If a second element ever takes this curve the exception has been misread.** Closing has no
overshoot at all, because opening is the gesture with personality and closing is the system
getting out of the way.

**The Transform-Only Rule.** Animate `transform` and `opacity`. Bars translate or scale,
never `width`/`height`. No element in the app transitions height, width, margin, padding,
top, left, bottom or right — verified in the browser, not assumed. The one thing that
deliberately does not animate is the written log's tab unfold: width is layout, so the stubs
snap and only the title fades.

**The Pressable Rule.** Every interactive element confirms the tap. A control that does not
move on press leaves you unsure it registered.

**The Achromatic Slab Rule.** In a chart whose colours are borrowed from somewhere real —
the calendar — anything that did not come from there is grey. A hue would have to *mean*
something, and there is nothing behind it to mean. `SLAB_NEUTRAL` holds the two: certified
on every surface like the projections (5.19:1 and 3.17:1) and 1.64:1 apart from each other,
which is what lets two adjacent grey slabs read as two things rather than one tall one.

**The Gap-Is-Not-A-Zero Rule.** In any series over time, a day with no entry draws NOTHING.
Not a zero-height bar, not a line segment through it. An unweighed morning is not a morning
that weighed nothing, and a day with no food logged is not a fast. The weight line breaks
into a separate polyline per unbroken run for exactly this reason — and a run of one emits
its point twice, because a single-point polyline draws nothing at all and would leave the
commonest first-week state as an empty box.

*The adherence tracker is the one deliberate exception, and it is not a counter-example: its
zeros are real. A day that earned nothing earned nothing, which is a measured fact about a
day that happened, where an unweighed morning is the absence of a reading.*

**The Nothing-Scrolls-At-Rest Rule.** At 1858×960 — the owner's window — the desktop page
does not scroll and neither does any of the three windows. Things you OPEN may scroll inside
themselves: an expanded pillar, a popover, a dialog. That is the whole permitted set.

Two mechanisms hold it. The Recent window's opened pillar is the one surface allowed to
scroll at rest-plus-one-tap, because it is a window you opened and the detail is what you
came for. The Blocks window collapses **rows that are already MARKED** to a single line
(time · title · state chip) when a day's rows would not fit — and **never an unmarked row**,
which carries the three action chips and whose shortening would make marking cost more. The
honest-logging rule reaches the overflow rule too.

## 6. Do's and Don'ts

### Do:

- **Do** treat the adherence numeral as the only element with real presence. Serif, 52px,
  600, tabular, tracking −0.02em, in a 240px ring. Nothing else may compete.
- **Do** measure every colour against its actual background, in the direction you are using
  it, and record the pair that is on screen. A fill certification is not a text
  certification.
- **Do** reach for a rule before a card, and a hairline before a shadow. A popover is an
  opaque ground and a halo, not a lift.
- **Do** put meta in the margin with `.page-margin`, and use `.section-head` for headings.
- **Do** keep meaning off hue alone — a label, shape or position must carry it too.
- **Do** print the real number beneath any capped ring (`Strength 2 of 8`). The arc caps; the
  text never does.
- **Do** distinguish the three block states by **form** — filled, filled, outlined.
- **Do** make empty states outlined and visible. An unfilled thing must still read, and a
  DASHED one means "no source", which is a different sentence from "none yet".
- **Do** give every animation a `prefers-reduced-motion` path by using one of the three
  travel classes.

### Don't:

- **Don't** build anything in the **Duolingo / Habitica** register. No XP, levels, points,
  badges, mascots, confetti, celebration, or loss-aversion. The streak is a plain count of
  days logged and must never be dramatised.
- **Don't** use red beyond the one floor line. Not for errors, not for drift, not for
  delete. An error stands out by weight — ink at 600 — because there is no alarm colour here.
- **Don't** build a severity ramp. Three shades of worsening grey encode a verdict, and a
  person who feels judged logs inaccurately.
- **Don't** measure, score, rank, or compare output — not between days, not between
  fortnights, not between pillars. The productivity score is gone; do not reinvent it under
  another name.
- **Don't** use a pillar hue as a status colour, or the accent as text.
- **Don't** add an average, a delta, a target line, a smoothing curve or a window-over-window
  comparison to any chart. The tracker's average is a named single exception with one
  consumer.
- **Don't** wrap a section *inside* a window in a panel because it needs separating. Use a
  rule. The four surfaces that earn themselves are listed in §4 and the list is closed.
- **Don't** add a shadow. The count is zero and should stay zero.
- **Don't** give a ring a second radius. One thickness, one radius, arcs by weight — no mid
  band, no outer lap, no overdrive.
- **Don't** use a Google `colorId` as it arrives, or let a projected hue become a fill, a
  text colour or a status mark. See The Foreign Hue Rule.
- **Don't** use `font-medium`, or any weight other than 400 and 600.
- **Don't** use Tailwind's default type scale or an arbitrary `text-[Npx]`.
- **Don't** add a second accent or a free hex colour picker. Pillar hues are editable only
  from the curated palette; the accent, ink, surfaces and block states are fixed.
- **Don't** animate a layout property, or write a transition inline where reduced motion
  cannot override it.
- **Don't** set a filled input where a line will do, or reach for a modal before exhausting
  inline, popover and progressive alternatives.
- **Don't** add a sentence to the screen explaining a surface. TEXT IS DATA: the reasoning
  goes in a comment where the next reader of the code finds it.
