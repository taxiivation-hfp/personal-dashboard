# Personal Dashboard — working notes for Claude

## What this app is

A private, single-user daily guide organised around **adherence, not accomplishment**.

The question it answers is **"did I do what I said I'd do?"** — never "how much did I
get done?" The problem being solved is **drift and self-justification**, not
productivity.

**Output and results are deliberately NOT tracked or scored.** If you find yourself
adding something that measures how much was produced, how good it was, or how it
compares to another day, you have misunderstood the product. Working a block badly and
working it brilliantly are the same event here: the block was adhered to.

## The rules that follow from that

**No gamification.** No XP, no levels, no points, no progression system. These reward
*volume*, which is the exact thing this app refuses to measure. Streaks stay, but as a
plain adherence count — a fact, not a mechanic.

**Honest logging is the highest priority.** Every design decision loses to it. Marking
"drifted" must never feel punishing, because a person who feels judged starts logging
inaccurately, and inaccurate data makes the entire app worthless. No red, no shame
copy, no "you failed" states. Drift is information, not a verdict.

**Subtraction over addition.** Today is the hero screen and stays minimal. Anything
that isn't today's adherence goes one tap deeper, or doesn't exist.

## The central model: three-state time blocks

A calendar block is not done/not-done. It is exactly one of:

| State | Means |
|---|---|
| **Adhered** | Worked the block as planned — *regardless of what got produced* |
| **Drifted** | Did something else during that time |
| **Skipped** | Didn't happen at all |

- Marking is **tap-as-you-go during the day**. The evening review is a catch-up pass
  for anything still unmarked, not the primary path.
- **Drifted** opens an optional short reason field. Optional. Never blocking. Never a
  required field, never a modal you have to dismiss.
- Reasons are stored so the coach can spot patterns over time.

**Adherence rate is the hero stat**: today's adherence % is the single largest number
on the screen, with a 7-day strip beneath it.

## Non-negotiables

Separate from blocks and deliberately simpler: a small plain checklist. **Binary — no
states, no reasons.** The user writes and edits them, and they can be day-of-week
dependent (e.g. laundry on Sundays).

## The coach

Its job is **pattern-spotting on drift**, using the stored reasons. For example:
*"Mandarin has drifted 3 of the last 5 nights — move it earlier?"*

- **Non-judgmental, always.** See the honest-logging rule above.
- **Minimal by default**: roughly one comment a day. It speaks more only when asked.

## Visual language

Light beige, premium, clean.

- Warm beige page background, off-white cards, **muted amber as the single accent**.
- Generous whitespace. One clear visual hierarchy. Restrained colour.
- Big, clean number treatment for the adherence stat.
- **Two font weights only.**
- Motion minimal and functional.

## In scope

- Journal: stylus drawing saved as an **image only**, on a **lined page** template.
  No transcription, no theme extraction, no vision.
- Calories: a **single manual daily total**. No food database, no barcode, no API.
- Render the calendar view (Google OAuth is already connected).

## Explicitly cut — do not build, do not half-build

- Daily digest
- Step tracking / iOS Shortcut
- Twilio escalation calls
- Telegram (deferred; decide later)

## Engineering constraints

- **All rules live transactionally in `src/lib/engine.ts`.** Anything the model must
  not be trusted to get right belongs there, inside a write transaction.
- **Preserve data.** Goals, habit history, gym sessions, journal pages and Google
  tokens are real and irreplaceable. Migrate; never drop.
- **Confirm any migration plan before running it.**
- Stack: Next.js 16 (Turbopack) + React 19 + Tailwind v4 + libSQL. Local file DB;
  a Turso/Fly deploy is deferred until the local MVP is complete.
- SQLite `GLOB` uses `?`/`*` wildcards, not `_` — date CHECKs use `GLOB '????-??-??'`.
