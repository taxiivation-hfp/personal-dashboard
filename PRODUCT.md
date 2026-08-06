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

## Design Principles

1. **Adherence, never accomplishment.** If a change would create a surface where output
   could be measured, compared, or rewarded, the change is wrong regardless of how good it
   looks.
2. **Honest logging outranks everything.** Marking "drifted" must be exactly as cheap, as
   visually equal and as unpunished as marking "adhered". Every other design goal loses to
   this one, because inaccurate data makes the whole app worthless.
3. **Frequency governs.** Design for the hundredth viewing, not the first. Nothing may make
   the owner wait to read a number they check several times a day.
4. **A cap must never hide the truth.** Where a value caps — the pillar rings — the real
   number is always printed beside it. The visual may compress; the text never does.
5. **Subtraction over addition.** Today is the hero screen and stays minimal. Anything that
   isn't today's adherence goes one tap deeper, or doesn't exist.

## The hierarchy that must survive any redesign

1. **Today's adherence** — the single largest thing on the screen.
2. The day's blocks and non-negotiables — what you actually tap.
3. Pillar rings — secondary context, a balance indicator, never the hero.
4. Goals and skills — one tap deeper in spirit, present but quiet.

## Retheming boundary

The owner may recolour the three pillar hues, from a curated palette only, every value
checked against the page. Everything else — accent, ink, surfaces, and the three block
states — is fixed.

This is a product rule, not a visual preference: one accent is what keeps the page quiet,
the block states must not acquire a severity ramp, and no choice may make the app
unreadable. Do not add a free hex picker. Mechanics live in `DESIGN.md` and `engine.ts`.

## Redesign scope — `redesign` branch, opened 2026-08-06

The visual identity is in play on this branch. What that does and does not mean:

- **Open:** accent and pillar chroma, type family and scale, component vocabulary, density,
  layout and structure. The current system is heavily desaturated — nothing in it exceeds
  0.098 chroma — and the intent is to raise commitment so something on screen has presence.
- **Retained by choice:** a light, warm ground. The scene sentence forces it — most opens
  are in daylight at a desk, and a dark "tool" theme would be category reflex. The app
  should stay recognisably itself.
- **Not a claim being made:** earlier drafts argued the beige was "not the warm-neutral
  reflex" because it predated the design work. Measured, `#f2ede4` is
  `oklch(0.948 0.0131 82.4)` — inside the band that reflex produces. It is kept because it
  was chosen, which is a good enough reason; it is not kept because it is unusual.
- **Everything above this section is unaffected.** Product law, hierarchy and principles
  survive the redesign unchanged.

**Pending action:** `CLAUDE.md`'s *Visual language* section duplicates what belongs in
`DESIGN.md` and currently contradicts this scope. The agreed resolution is to move those
rules into `DESIGN.md`, leaving `CLAUDE.md` holding product and engineering law only. That
edit happens once a visual direction is settled, not before — until then, treat
`CLAUDE.md`'s visual rules as describing the *current* system rather than the target.

## Accessibility & Inclusion

**WCAG AA, measured — plus a hard no-colour-alone rule.**

- Body text ≥4.5:1, strokes and large text ≥3:1, and any hue used as a filled chip must
  also clear 4.5:1 with white on top. Placeholder text is text: it needs the full 4.5:1,
  not a hairline colour.
- **Every colour is measured, not eyeballed.** This caught the Physical pillar hue at
  4.45:1 — a real failure that looked fine.
- **No meaning may be carried by hue alone.** Every pillar-coloured element needs a label,
  shape or position doing the same job. It costs almost nothing here, since the surface is
  already textually labelled, and it survives a palette reset automatically: any new hue
  inherits the constraint.
- **Reduced motion is not optional.** Gentler, not none — colour and opacity still carry
  meaning, so only movement is removed.
- Both targets are personal devices at consistent DPI. Fixed type scale, not fluid.
  Responsive behaviour is structural.
