# Personal Dashboard

`CLAUDE.md` is the constitution and outranks this file and any design skill. This document
exists so design tooling has strategic context. It does not restate the rules; it points
at them.

Visual specifics — palette values, type scale, component vocabulary, motion tokens — live
in `DESIGN.md`, not here. Where this file touches the visual system it states the
*constraint*, never the value.

## Register

product

## Users

One user. One device pair: a laptop and an iPhone. No second account, no sharing, no
export, no audience.

A student at a desk in Melbourne, opening this between classes and again at 11pm in bed
with the lights off, to answer one question and mark two or three things. Never presented,
never shown to anyone, never used to impress.

The job to be done is small and repeated: **look, learn one thing, mark what's true,
leave.** It is closer to a bathroom scale than to a dashboard.

Used several times a day, every day, for months. **That frequency is the single most
important design fact in this document.** Anything seen dozens of times a day must not be
animated, decorated, or clever — novelty is a liability at the hundredth viewing.

## Product Purpose

A private daily guide organised around **adherence, not accomplishment**. It answers "did I
do what I said I'd do?" — never "how much did I get done?"

The problem being solved is **drift and self-justification**, not productivity. Success is
that the owner keeps logging honestly for months. Nothing else is success: not engagement,
not completion rate, not the number going up.

Output and results are deliberately not tracked or scored. Working a block badly and
working it brilliantly are the same event here — the block was adhered to.

**There is no longer any exception to that.** The productivity score — a per-day points
total that priced hours by their calendar colour — is **gone**, by the owner's ruling of
2026-09-18: *"quantifying productivity is stupid."* See "What is deliberately not tracked"
below; it is the most important thing this revision does, because it closes the one gate in
the fence.

## Brand Personality

**Warm · private · forgiving.**

Closer to a diary than a tool. The interface is addressed to exactly one person who
already knows what everything means, and it never performs for anyone else.

*Licenses:* softer contrast within the accessibility floor, rounder forms, copy written in
the second person and the plain past tense, generous space around anything you have to tap
while tired.

*Forbids:* institutional voice, exclamation marks, encouragement, congratulation, any copy
that would read strangely if the owner were having a bad week. "Forgiving" is not softness
for its own sake — it is the reason honest logging survives.

It also forbids **explaining itself on screen**. TEXT IS DATA: the app shows the data and
the controls that input it, and argues its case in the code. Labels, units, counts, dates,
window scopes, button captions and error messages stay; a sentence describing a surface
does not. When a rule needs defending, it is defended in a comment where the next reader of
that file finds it — which is why this document and `DESIGN.md` are as long as they are.

## The two pillars

**HEALTH and CAREER, and nothing else** — the owner's ruling, 2026-09-18, replacing the
three-pillar Social / Physical / Portfolio set.

- **Health** is the body's fortnight: strength and cardio sessions, the daily ASC.ND
  routine, total steps, total calories. It is weighted — strength owns most of the ring —
  because the parts are not worth the same and a ring that pretended otherwise would be a
  worse description of the intent than no ring.
- **Career** is the work's fortnight, and it fills **from goals**. A goal is a project, its
  subgoals are its subtasks, and only an *active* goal *with a deadline* counts. Each
  counted goal is one equal arc, filled by whether it is **on pace** — progress against the
  share of its own runway that has elapsed. Past its deadline it simply shows actual
  progress and stays in the ring until it is ticked done or dropped. **No red, no "overdue"
  wording**, because the honest-logging rule reaches a goal exactly as it reaches a block.
- Both are named in one place and keyed in another: the database keys are still `physical`
  and `portfolio`, because renaming a live key is churn, and the words a person reads come
  from `PILLAR_NAME`.
- The window is unchanged: **14 days ending on the day being viewed**.
- A pillar fills toward a threshold and **caps**. Twenty strength sessions fill exactly what
  eight do. Because you cannot win by overdoing one part, the only board that looks good is
  a well-rounded one — the cap *is* the mechanism, and the real number is always printed
  beneath the ring so the cap never hides the truth.

**Career has no floor and no zero.** With no counted goals the ring is an empty dashed ghost
labelled `no goals` — never `0%`. A pillar with nothing pointed at it is not a pillar you
are failing at; it is a pillar with no source, and this app's word for that is dashes.

## What is deliberately not tracked

Each of these was removed on purpose, and each has a reason that outlives the removal. A
future pass that adds one back is reversing a decision, not filling a gap.

- **Socialising.** It "comes naturally in between blocks" and is no longer planned or
  tracked. It was a pillar fed from graphite calendar events; graphite is now ignored
  everywhere — not in the block list, not in adherence's hours, not in the hours-by-category
  chart. The `social_capital` row stays in the database (goals, habits and tasks point at
  it) and is filtered out of every listing; the code is parked verbatim under
  `archive/social/`, kept rather than deleted, because the owner asked for it to be kept.
- **Skills.** Not a current focus, and **a thing that is not a focus must not sit anywhere as
  an unfilled thing** — that is the whole argument, and it is the same one that keeps the gym
  off the checklist. Hidden from the rings, the dashboard, `/colours`, `/sessions` and the
  written log; `/skills` redirects to `/`. Every skill, session and colour is kept in the
  database. Hidden, not deleted.
- **A productivity score.** "Quantifying productivity is stupid." No points are printed
  anywhere, and the arithmetic that produced them is gone rather than merely unrendered.
  What survives is the question the score was a proxy for — **where did the week's hours
  go?** — answered as hours and minutes, stacked by category (Work Projects, Work Uni, Work
  Part Time, Uni), on `/stats` and nowhere else.
- **Task history.** *In flight* and *Achieved* are gone from the record. A finished goal
  still never disappears — it keeps its sticky note on the timeline with a ✓ and its
  completion date — but there is no ledger of tasks done, because a task feeds nothing and a
  list of things you finished is an accomplishment measure with a different name.

Three things that were never built and still must not be: a daily digest, escalation calls,
and sleep tracking. Sleep has no source and no ring; do not add one.

## The hierarchy that must survive any redesign

1. **Today's adherence** — the single largest thing on the screen. A 240px amber ring with a
   52px numeral inside it, and the only ring that catches the lamp.
2. **The day's blocks and the non-negotiables** — what you actually tap. The blocks have a
   window of their own on the desktop and sit directly under the ring on the phone; the
   checklist runs the full width beneath. Marking is the app's one job, and everything about
   it is one tap: a drift saves instantly and *then* opens its editor, so the slider never
   gates the mark.
3. **The two pillar rings** — secondary context, a balance indicator, never the hero. They
   sit side by side in the third window at 200px, comfortably smaller than the adherence
   ring, with their parts listed underneath as plain lines.
4. **Goals and the record** — one tap deeper. Goals live inside the Career ring, which opens
   in place; the record is one quiet link at the foot of the same window. Neither is on the
   surface, and neither is more than a tap away.

**The tasks are the one thing that moved.** They used to be a band under the checklist; they
now float as small cards either side of the hero ring, filling space the layout already had.
That is not a promotion — a task still feeds nothing, still carries, still goes unscored,
and with no tasks the day draws nothing at all where they would have been.

## The screen, and why it is three windows

**Desktop: Blocks | Today | Recent**, left to right, under one masthead, at rest **nothing
scrolls** — not the page, not a window. Things you OPEN may scroll inside themselves.

The leftmost window was the **calendar** — nine days, past and upcoming — and is now
**today's blocks and nothing else** (the owner's ruling, 2026-09-18). Two reasons, and they
compound: a nine-day list cost a screen of scroll to say what the date line already said,
and the day you can act on was the only one of the nine you could do anything with. With it
went the *next up* card and the seven-day week strip. What replaced the strip is the
**adherence tracker** — one line with the area filled under it, the last seven days, today
drawn apart as a hollow dot on a dashed segment, and an average. It says one thing instead
of four.

**Phone: two panes.** *Today* — the date card, the hero ring with its floating tasks, the
day's blocks, then the checklist. *Pillars* — the two rings, the tracker, the record link.
Reached by tapping the collapsed window or by swiping between them.

**There were three panes, and the calendar pane went with its column.** The blocks now sit
inside Today, above the checklist, which is where a hand marking them already is — a pane of
its own would be a second place to reach for the same list. There is no bottom tab bar; that
was removed earlier by the owner's ruling, and nothing has asked for it back.

## Design Principles

1. **Adherence, never accomplishment.** If a change would create a surface where output
   could be measured, compared, or rewarded, the change is wrong regardless of how good it
   looks. There is **no longer a sanctioned exception** — the productivity score was the one
   gate in this fence and the owner closed it. Hours are still counted on `/stats`, but as
   hours: a description of where a week went, with no rate, no total and nothing to beat.
2. **Honest logging outranks everything.** Marking "drifted" must be exactly as cheap, as
   visually equal and as unpunished as marking "adhered". Every other design goal loses to
   this one, because inaccurate data makes the whole app worthless. It reaches further than
   the chips: it is why a partial drift saves before its slider is touched, why a dismissed
   invite is one word on every row, and why the blocks window collapses only rows that are
   already marked when a day overflows.
3. **Frequency governs.** Design for the hundredth viewing, not the first. Nothing may make
   the owner wait to read a number they check several times a day.
4. **A cap must never hide the truth.** Where a value caps — the pillar rings — the real
   number is always printed beside it. The visual may compress; the text never does.
5. **Subtraction over addition.** Today is the hero screen and stays minimal. Anything that
   isn't today's adherence goes one tap deeper, or doesn't exist. This pass was mostly
   subtraction, and the app is better for it.

## Anti-references

**Duolingo / Habitica.** Streaks as a mechanic, XP, levels, mascots, confetti,
loss-aversion nudges, anything that makes the app a thing you can lose at. The mechanics
are already banned in `CLAUDE.md`; this names the *feel*, so future work can't drift toward
it by degrees. The streak that exists here is a plain count of days logged — a fact, not a
score, and it must never be dramatised.

Constitutional anti-references, from `CLAUDE.md` rather than from preference:

- **Red, shame copy, "you failed" states.** Marking "drifted" must never feel punishing.
- **Severity ramps.** The three block states are distinguished by form, not by a
  three-shades-of-worse gradient, which would encode judgement in the palette itself.
- **Output measurement of any kind.** No volume, quality, or day-over-day comparison.

Apple Fitness / Whoop, Notion / Linear, and Calm / Headspace were offered as anti-references
and deliberately **not** selected. Their absence is a decision, not an oversight — don't
add them later without asking.

## Retheming boundary

The owner may recolour the **two** pillar hues, from a curated palette only, every value
checked against the page. Everything else — accent, ink, surfaces, and the three block
states — is fixed.

This is a product rule, not a visual preference: one accent is what keeps the page quiet,
the block states must not acquire a severity ramp, and no choice may make the app
unreadable. Do not add a free hex picker. Mechanics live in `DESIGN.md` and `engine.ts`.

Social's hue left the token set with its feature; the swatch itself is still in the curated
palette and can be chosen for either pillar. A colour is not the thing it was used for.

## Decisions that reversed earlier ones

Kept because a reversal is the most expensive thing to rediscover, and the easiest to undo
by accident.

**2026-09-18 — the Health & Career pivot.** Three pillars became two; Social was removed
from every screen and every calculation and parked. Skills were hidden. The productivity
score was deleted. The calendar window became the blocks window, and the week strip became
the adherence tracker. `/stats` lost *In flight* and *Achieved*. **CLAUDE.md's "no average"
rule was removed by the owner for exactly one figure** — the tracker's seven-day mean — and
survives everywhere else, `/stats` in particular, where a window average would be a verdict
on a quarter.

**2026-08-07 — a productivity score, and three windows.** The score was admitted as a
quarantined exception to "output is never scored"; it has since been removed outright, and
the exception with it. The three windows have stayed. The 2026-08-06 pass had removed every
card for a ruled page, and the columns returned as three tonal surfaces — but the ruled
vocabulary survives *inside* each one. The no-cards rule was aimed at eleven identical
rectangles within a column, which is a different claim from three windows onto three views
of a day.

**Visual identity is settled, not in play.** An earlier `redesign` branch opened the accent,
the pillar chroma, the type family and the density. What came out of it is what shipped: a
light warm ground kept by choice (most opens are in daylight at a desk, and a dark "tool"
theme would be category reflex), one amber accent, five type steps, two weights. Product
law, hierarchy and principles were unaffected then and are unaffected now.

**Still pending:** `CLAUDE.md`'s *Visual language* section duplicates what belongs in
`DESIGN.md`. The agreed resolution is to move those rules into `DESIGN.md`, leaving
`CLAUDE.md` holding product and engineering law only. Until that happens, `DESIGN.md` is the
authority on a visual question and `CLAUDE.md` on everything else.

## Accessibility & Inclusion

**WCAG AA, measured — plus a hard no-colour-alone rule.**

- Body text ≥4.5:1, strokes and large text ≥3:1, and any hue used as a filled chip must
  also clear 4.5:1 with white on top. Placeholder text is text: it needs the full 4.5:1,
  not a hairline colour.
- **Every colour is measured, not eyeballed, against the ground it is actually printed on.**
  This caught the Physical pillar hue at 4.45:1 — a real failure that looked fine — and it
  is why the tracker's average records its ratio on the card it sits in rather than on the
  window behind the card.
- **No meaning may be carried by hue alone.** Every pillar-coloured element needs a label,
  shape or position doing the same job. It costs almost nothing here, since the surface is
  already textually labelled, and it survives a palette reset automatically: any new hue
  inherits the constraint. The segmented rings are the live case — all of one pillar's arcs
  are shades of one hue, so the mapping is carried by a list printed under the ring in the
  same shades and in the same order, never by colour.
- **Reduced motion is not optional.** Gentler, not none — colour and opacity still carry
  meaning, so only movement is removed.
- Every graphical control must be reachable without a pointer. The tracker's dots are eight
  focusable targets with dates and percentages in their labels, not decorations with a click
  handler.
- Both targets are personal devices at consistent DPI. Fixed type scale, not fluid.
  Responsive behaviour is structural.
