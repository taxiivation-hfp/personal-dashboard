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
on the screen, drawn as a large amber ring with a 7-day strip beneath it.

**Non-negotiables count toward it too, weighted equally with blocks** — one item is one
item. A habit has no end time, so it becomes due at an evening cutoff
(`app_meta['habit_cutoff']`, default 21:00) rather than at midnight. Before the cutoff an
UNTICKED habit is in neither numerator nor denominator; a TICKED one counts immediately,
because ticking must visibly do something or tap-as-you-go is pointless until 9pm.

The rate is therefore optimistic before the cutoff and settles — usually downward — when
the rest join the denominator. The screen says how many are not yet due, so the movement
is never a surprise.

`app_meta['adherence_habits_since']` bounds this: days before it are computed blocks-only.
Counting habits retroactively would have held untouched non-negotiables against days
already lived under the old rule, which is a lie about the past.

## Non-negotiables

Separate from blocks and deliberately simpler: a small plain checklist. **Binary — no
states, no reasons.** The user writes and edits them, and they can be day-of-week
dependent (e.g. laundry on Sundays).

Gym is deliberately **not** one of these. The owner trains "any 4 of 5 weekdays" — a
frequency, which `days_mask` cannot express. On the checklist it would be engineered to
sit unticked once a week, and an item you are designed to fail teaches distrust of the
whole list. Workouts are logged separately, by kind: **Strength / Cardio / Misc**, one
row per (date, kind), so a day can hold a lift and a run.

Each kind opens **its own free-text document** — three separate notes per day, not one
shared field. Saving IS logging; there is no second "did it" toggle to forget. The text is
deliberately unstructured: a workout log is numbers scribbled between sets, and any form
imposed here is a form to fight on a bad day.

A non-negotiable may take a **number** instead of a tick (`habits.input = 'number'`, with
`habits.unit`). Daily weight uses it. The value lives in `habit_entries.value`, which is
already a REAL, so adherence and the rings need no special case — an entry exists or it
does not. Clearing the field clears the day, exactly like unticking.

## Pillar rings — sufficiency, never score

Three rings (Social / Physical / Portfolio) over a **rolling 14-day window**, defined in
`src/lib/rings.ts`. Adherence remains the hero; rings are secondary context.

**The core rule: a ring fills toward a threshold and CAPS.** Its *value* cannot be
improved by doing more — 8 gym days and 20 both count as a full ring, and 15k steps fills
the steps ring exactly as much as 7k. Because you cannot win by overdoing one pillar, the
only board that looks good is a well-rounded one. That cap *is* the mechanism.

Overdrive (below) draws past the threshold, so 20 days and 8 do not look identical — but
they are worth identically much. The distinction is the whole design: what you see is the
truth, what counts is the cap.

- Thresholds are the owner's **minimums, not stretch goals**, and are configurable in the
  registry so retuning is a one-line change.
- **A pillar may weight its metrics.** Physical is 0.8 Strength / 0.2 Cardio, so eight
  strength days and no cardio reads 80% rather than 50% — the bulk of the intent was met,
  and the empty cardio ring still shows what was skipped.
- **Overdrive is VISUAL ONLY.** Past its threshold a metric ring draws a second
  translucent lap, capped at 2x. It never enters the pillar mean, and that is
  load-bearing rather than fussy: with Strength at 0.8, an uncapped fill of 1.25 would
  give `0.8 x 1.25 + 0.2 x 0 = 100%`, so overdoing strength would exactly cancel skipping
  cardio. The cap stays in the maths; the acknowledgement lives in the pixels. A test
  asserts no amount of strength can fill Physical alone.
- **Some things are tracked but NOT scored.** A metric with a live source and no
  threshold (Misc — bouldering, calisthenic skills) shows a count, draws no ring, and is
  excluded from the pillar mean. It is the "output is not scored" rule made literal: a
  thing you log that is never a target. Do not give it a threshold.
- **The real number is always printed beneath the ring** (`11 of 8 days`). The arc caps;
  the text never does. A cap must never hide the truth.
- **`null` is not `0`.** A metric with no source is a dashed ghost and is excluded from
  its pillar's average. A genuine zero shows a solid empty ring with `0 of 2 days`. While
  the window is still filling, the fact line says `· day 3 of 14`, so a first day cannot
  read as a fortnight of neglect.
- **A thin ring means neglected, never failed.** The coach may note neglect neutrally and
  must never rate, rank, congratulate, or compare fortnights — same prohibition it runs
  under for adherence.
- No XP, no levels, no points, no ring streaks, no fortnight-over-fortnight comparison.

## Goals — the one sanctioned accomplishment measure, quarantined

Goal progress is the sum of completed subgoal weights (`src/lib/goals.ts`), derived on
read and never stored. `weight = 0` means AUTO: an equal share of what the explicit
overrides leave behind.

**It feeds nothing else** — not adherence, not the streak, not the rings, not the coach.
That isolation is what stops "did I do what I said I'd do" becoming "how much did I
finish". Goals are never auto-completed at 100%; marking one done is the owner's call.

## The coach

Its job is **pattern-spotting on drift**, using the stored reasons. For example:
*"Mandarin has drifted 3 of the last 5 nights — move it earlier?"*

- **Non-judgmental, always.** See the honest-logging rule above.
- **Minimal by default**: roughly one comment a day. It speaks more only when asked.

## Visual language

Light beige, premium, clean.

- Warm beige page background, off-white cards, **muted amber as the single accent**.
- **Pillar hues are owner-editable at `/colours`, from a CURATED palette only.** Every
  value is checked against the beige page, so no choice can make the app unreadable, and
  `engine.setPillarColor` refuses anything outside it. The accent, the ink, the surfaces
  and the three block states are NOT editable — one accent is what keeps the page quiet,
  and the block states deliberately avoid a severity ramp. Do not add a free hex picker.
- Generous whitespace. One clear visual hierarchy. Restrained colour.
- Big, clean number treatment for the adherence stat.
- **Two font weights only** — 400 and 600. No 500, no `font-medium`. A third weight is a
  bug, not a choice.
- **Eight type steps, documented in `globals.css`.** 11 / 12 / 13 / 14 / 15 / 16 / 28 / 52.
  If something needs to stand out, use weight or space, not a ninth size.
- **Every colour is measured, not eyeballed.** Body text ≥4.5:1, strokes and large text
  ≥3:1, and any hue used as a filled chip must also clear 4.5:1 with white on top. That
  last one is what caught `--color-physical` at 4.45.
- Motion minimal and functional, and it runs on tokens: `--ease-out`, `--dur-press` …
  `--dur-data`, all capped at 280ms. **There is deliberately no ease-in token** — it
  delays the first moment, which is exactly when the eye is watching.
- Animate `transform` and `opacity` only. Bars use `scaleX`, never `width`.
- `themeColor` in `layout.tsx` must track `--color-bg`, or the iPhone status bar contradicts
  the app.

## In scope

- Journal: a page is either a **stylus drawing saved as an image** or **typed text**, both
  on the same ruled **A4 portrait (1:1.414)** sheet. `kind` is the discriminator
  everywhere — a text entry stores `image = ''`, so never test emptiness to tell them
  apart. No transcription in either direction, no theme extraction, no vision. Deleting a
  page asks first.
- Calories: a **single manual daily total**. No food database, no barcode, no API.
- Render the calendar view (Google OAuth is already connected).

## Planned, source pending

- **Steps.** The `steps` metric exists in `src/lib/rings.ts` with `sourceReady: false`, so
  it renders as a dashed ghost ring and is EXCLUDED from the Physical pillar's average —
  never counted as a zero, which would read as failure no behaviour could fix. Threshold
  is 7k/day, 12 qualifying days of 14. Wiring a source (an iOS Shortcut POSTing one
  number to `/api/health`) is separate work and is not started.
- **Sleep is not planned.** It has no source and no ring. Do not add one.

## Explicitly cut — do not build, do not half-build

- Daily digest
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
- **Tests: `npm test`.** `node --test` on Node 24, which strips TypeScript natively — zero
  dependencies. `src/lib/rings.ts`, `goals.ts` and `dates.ts` are import-free on purpose so
  they run under it; keep them that way. `PillarKey` lives in `rings.ts` and is re-exported
  from `queries.ts` for the same reason.
- **libSQL returns aggregates as BigInt.** `bigint / number` throws. Every aggregate goes
  through `num()` at the query boundary.
- The rolling window is `addDays(anchor, -13)` .. anchor, `BETWEEN` both ends. The anchor
  comes from the date being VIEWED, never a server-side `todayISO()`.
