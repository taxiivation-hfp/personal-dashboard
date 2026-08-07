# Personal Dashboard — working notes for Claude

## What this app is

A private, single-user daily guide organised around **adherence, not accomplishment**.

The question it answers is **"did I do what I said I'd do?"** — never "how much did I
get done?" The problem being solved is **drift and self-justification**, not
productivity.

**Output and results are deliberately NOT tracked or scored, with one quarantined
exception.** If you find yourself adding something that measures how much was produced or
how good it was, you have misunderstood the product. Working a block badly and working it
brilliantly are the same event here: the block was adhered to.

The exception is the **productivity score** — see its own section below. It measures hours
SPENT, never results produced, and it is fenced off from everything else. Do not read it as
permission to score anything else.

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

### The figure CLIMBS from 0, and never falls

`src/lib/adherence.ts`. Two shares, and it is a sum of what has been EARNED, never a
ratio of done-to-due:

| Share | Earned by |
|---|---|
| **70** | blocked hours worked ÷ blocked hours in the day |
| **30** | non-negotiables ticked ÷ non-negotiables scheduled, split evenly |

So one hour of an eight-hour day is `1/8 × 70`, and one of five non-negotiables is 6.
A day with 8h blocked and 5 items starts at 0 and can only go up.

**This replaced a ratio of adhered-to-due, and the reason is behavioural, not
arithmetic.** That figure fell every time a block came due unmarked, and fell again at an
evening habit cutoff. Watching a number you are trying to earn slide backwards all
afternoon is demotivating in a way that makes people stop looking, and a number nobody
looks at cannot do its job.

Consequences worth knowing, all of them intended:

- **There is no habit cutoff any more.** `app_meta['habit_cutoff']` and `habitsDueOn` are
  gone. An unticked non-negotiable is simply 6 points not yet earned; nothing has to
  become "due" for the figure to be honest, because nothing is ever held against you.
- **Drift is not punished, it just does not add.** The three-state mark still records what
  happened and the coach still reads it. The hero figure stops being the place that holds
  it against you.
- **A day ends wherever it got to.** 60% is not a failure grade; it is sixty points earned.
- Blocks with no duration are excluded from both sides — an all-day event is not eight
  hours of work you failed to do.

## Non-negotiables

Separate from blocks and deliberately simpler: a small plain checklist. **Binary — no
states, no reasons.** The user writes and edits them, and they can be day-of-week
dependent (e.g. laundry on Sundays).

Gym is deliberately **not** one of these. The owner trains "any 4 of 5 weekdays" — a
frequency, which `days_mask` cannot express. On the checklist it would be engineered to
sit unticked once a week, and an item you are designed to fail teaches distrust of the
whole list. Workouts are logged separately, by kind: **Strength / Cardio / Misc**, one
row per SESSION — a day can hold two lifts and a run, and each is its own document.

Each kind opens **its own free-text document** — three separate notes per day, not one
shared field. Saving IS logging; there is no second "did it" toggle to forget. The text is
deliberately unstructured: a workout log is numbers scribbled between sets, and any form
imposed here is a form to fight on a bad day.

**Calories have a FLOOR at 2500**, worth one non-negotiable in the productivity score and
nothing at all in adherence. A floor to reach, never a ceiling to stay under: this is someone
training, for whom under-eating is the failure and there is no upper bound worth drawing. Its
box is DASHED until met — "not yet" rather than "failed", since most of a day is legitimately
spent below the line — and below the floor scores nothing, because partial credit would make
it a target you can half-hit.

A non-negotiable may take a **number** instead of a tick (`habits.input = 'number'`, with
`habits.unit`). Daily weight uses it. The value lives in `habit_entries.value`, which is
already a REAL, so adherence and the rings need no special case — an entry exists or it
does not. Clearing the field clears the day, exactly like unticking.

## Pillar rings — sufficiency, never score

Three rings (Social / Physical / Portfolio) over a **rolling 14-day window**, defined in
`src/lib/rings.ts`. Adherence remains the hero; rings are secondary context.

**The core rule: a ring fills toward a threshold and CAPS.** Its *value* cannot be
improved by doing more — 8 strength sessions and 20 both count as a full ring, and 15k
steps fills the steps ring exactly as much as 7k. Because you cannot win by overdoing one
pillar, the only board that looks good is a well-rounded one. That cap *is* the mechanism.

Strength and Cardio count **sessions**, not days — two lifts on a Tuesday are two things
that happened. That is the owner's ruling and it makes the Physical ring easier to fill
than the days rule it replaced; the threshold was deliberately left at 8 anyway. Outreach
and Steps remain per-day capped, which `Metric.perDayCapped` is what actually encodes —
`unit` is only the noun printed in the fact line.

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
- **A metric may have a floor without having a share, and it is drawn OUTSIDE the ring.**
  Misc — bouldering, calisthenic skills — has `required: 1` (one session a fortnight) and
  `weight: 0`. It fills its own mark and never enters the Physical mean.

  As a slice it would have been wrong either way: weighted, it would take circle from the
  metrics that count; at weight 0 it would sit there looking like a slice switched off. As
  a **thin translucent lap around the donut** it reads as an extra, which is exactly its
  standing in the maths. `MetricRing.lap` derives this in `rings.ts` — the registry stays
  the only place that knows what weight 0 means. A ghost is never a lap: "no source yet" is
  a statement about the app and belongs on the ring where the metric would have been.

  Translucent, **not glowing**. A glow is a shadow, and this app ships none.
- **Social events come from the CALENDAR, not a checklist.** Graphite (`colorId: "8"`)
  means a social event — Church, a night out. Two a fortnight. They are already scheduled
  there, and a second place to record them is a second place to forget. Counted in
  `/api/rings` and passed to `getRingCounts`; on a calendar failure the count is left
  UNDEFINED so the ring goes ghost rather than reporting a false zero.
- **Every skill lives under Portfolio**, including ice skating, badminton, calisthenics and
  dancing. They are things being LEARNED, and learning is what Portfolio holds; Physical
  already counts its own work from `gym_sessions`. The `skills` metric counts every
  `skill_time` row regardless of pillar and always did, so this decides where a skill is
  listed and nothing else.
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

**A finished goal must never disappear.** Every screen filters `status != 'done'`, which used
to mean completing something removed it from the app entirely — exactly backwards for an owner
who wants "a clear plan on what I have achieved and what I wanna achieve next". The record
carries both halves: **In flight**, each active goal with its progress and THE NEXT UNTICKED
SUBGOAL, and **Achieved**, finished goals newest first with the date.

`goals.completed_at` is stamped by `updateGoal` when the status becomes 'done' and CLEARED
when it leaves — a live goal claiming a completion date is worse than no date at all. It sat
in the schema unwritten for the app's whole life before that, so goals finished earlier are
undated; they still list, and sort last.

Naming the next step is what makes it a plan rather than an inventory. A goal you cannot name
the next step of is a wish, and a percentage on its own is not something you can act on this
afternoon.


Goal progress is the sum of completed subgoal weights (`src/lib/goals.ts`), derived on
read and never stored. `weight = 0` means AUTO: an equal share of what the explicit
overrides leave behind.

**It feeds nothing else** — not adherence, not the streak, not the rings, not the coach.
That isolation is what stops "did I do what I said I'd do" becoming "how much did I
finish". Goals are never auto-completed at 100%; marking one done is the owner's call.

## Backdating — the log is for catching up as much as keeping up

Workout sessions and weight readings can both be dated. The workout dialog carries a date
capped at TODAY (a session in the future has not happened); weight readings are entered under
the weight chart on the record, where you already are when you notice a gap in it.

**Neither lives on Today.** That screen is for the day in front of you, and a date picker on
it is one more thing between waking up and typing a number.

`/sessions` is the whole gym log — every session ever, newest first, grouped by day, filtered
by kind, deliberately unpaginated. Two lifts on one Tuesday read as one Tuesday with two
entries. It is a COUNT, never a score: no streaks, no personal bests, no volume totals.

## /stats — the record, and the only place history lives

A route, not a fourth pane, reached from the fourth phone tab and from `StatsLink` under
the pillar rings. Today is where you ACT; this is where you look back, and the split is
deliberate — a screen showing both invites reading the past as a verdict on the present.

Four charts, and the order is the argument: **adherence** first because it is the app's
question, **hours** second because it is the sanctioned exception, **weight** and
**calories** last because they are facts about a body rather than about a plan.

`DayChart` is the one primitive, and the FORM follows what the quantity IS:

| Form | For | Why |
|---|---|---|
| **line** | weight | it persists between readings. On the range observed — pinned to zero it is a flat line saying nothing. Broken at every gap; a run of one is drawn as a dot. |
| **bars** | calories, adherence | accumulates then restarts. From ZERO, and a line would imply Tuesday's intake flowed into Wednesday's. |
| **stacked** | hours | bars with composition, split by where the hours went. |

**A day with no entry draws NOTHING** in all three — not a zero-height bar, not a line
through it. Most days in a 90-day window are blank in an app this new, and drawing them as
zeros would report a catastrophe that never happened.

Adherence is the one series with a real ceiling, so it is scaled to 100 rather than to its
own high: scaling it to itself would make a week of 40s look like a week of 100s.

**No average, no delta, no target line, no smoothing, no window-over-window comparison.**
Every one of those is a judgement about a number this app has no business judging.

## The day's title

One line naming what you INTEND the day to be, set in advance and rewriteable whenever.
Today's sits under the date above the adherence ring; the next three days are named inline
on the week strip, where they are read.

**It is an intention, not a record, and it is connected to nothing.** It feeds no rate, no
ring, no streak and no score. That isolation is the whole point: the moment naming a day
"thesis push" becomes something you can succeed or fail at, it stops being a plan and turns
into one more verdict. Rewriting one is normal, not revisionism.

## Productivity — the second sanctioned measure, and the narrower one

A per-day points total, drawn on the 7-day strip. A DELIBERATE EXCEPTION to "output is
never scored", and the exception is narrow.

**It scores hours SPENT, never results produced.** A block worked badly and a block worked
brilliantly score identically, because the only inputs are duration and the event's
calendar colour. Nothing about quality, or what was finished, or how much was produced
enters it. The rule it bends is "no comparison between days"; the rule it keeps is the one
that matters — that the app never judges the quality of your work.

Why it exists, in the owner's words: high adherence doesn't mean a productive day if you
didn't schedule a productive day. Both numbers matter.

- **UNCAPPED, and comparative within the visible week** — the exact inverse of the ring
  rule. 1,125 is a valid reading. It must therefore NEVER be drawn as a ring, or as
  anything else that implies a target.
- **It feeds nothing** — not adherence, not the rings, not the streak, not the coach. The
  quarantine is enforced by data flow, not by discipline: the score exists only on
  `/api/adherence` and never on `DayView`, which is what the coach reads.
- **On the week strip the two are SEPARATE ROWS, not a shared box.** Adherence is a 3px
  horizontal bar under its own printed percentage; productivity is the stacked column below
  the rule, in the colours those hours had in the calendar. They stopped sharing a box
  because one of them has a fixed axis and the other cannot have one — a percentage drawn
  over an uncapped score invites a comparison neither can support.
- **The strip ENDS ON TODAY.** Seven days, today last, no future columns. The calendar
  column is what says what tomorrow holds; a strip reserving three empty columns for it
  spent a third of its width on days that had not happened.
- **A gym hour scores ONCE, from the calendar.** Grape (`colorId "3"`) is Gym at half rate.
  `scoreDay` has no `workouts` input at all — deleted rather than zeroed — because paying
  for the logged `gym_sessions` row as well would count the same hour twice and reward
  writing a session up rather than doing it. A session you did but never scheduled scores
  nothing here; the Physical ring still counts it, and that is the ring's job.
- **Non-negotiables stay in the score even though adherence counts them too.** Not a double
  count: adherence and productivity are two different questions asked of the same day, and
  ticking a non-negotiable is a true answer to both.
- **No productivity number is ever printed.** The bar's height is the whole claim. Printing
  an uncapped score with no ceiling beside it invites a comparison it cannot support — and
  it is the shortest path back to a scoreboard.
- The one slab that is not calendar time — non-negotiables — is ACHROMATIC
  (`SLAB_NEUTRAL` in `eventColor.ts`). A hue there would have to mean something, and there
  is no calendar colour behind it to mean it.
- **Adherence remains the hero** — the 176px amber ring, not the strip.
- **No week-over-week comparison, no best-week marker, no target line, no delta.** It is
  graphite on paper: a record, not a scoreboard.
- **It does not reopen gamification.** No levels, no thresholds, no milestones, no streaks
  on it. If it ever acquires one, this exception has been misread.
- `src/lib/productivity.ts` holds the one tuning knob — the colour→rate table — following
  the `rings.ts` METRICS precedent. Anything unlisted scores zero.

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
- **Three windows, separated by HUE and not by lightness.** Today / Calendar / Pillars sit
  on `--color-surface-1` (warm near-white), `-2` (cool paper with a lilac cast) and `-3`
  (gold). The calendar window used to BE the green that now belongs to today's row alone —
  which meant the live row was the same colour as the ground it sat on. Warm past, green
  today, pale future: the day you can still act on is the only one with a hue. Lightness was tried first and failed: contrast ratio measures luminance only, so
  three tones a point apart in L measured 1.03–1.07:1 against each other and read as one
  surface. Separating on hue at nearly equal lightness is visible and costs no contrast.
  The ramp is built UPWARD from `--color-bg`; darkening the page instead drops `--color-muted`
  to 4.10:1 and `skipped` to 3.97:1, both failures.
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
- `themeColor` in `layout.tsx` must track **the topmost painted surface** — now
  `--color-bar`, the masthead band — or the iPhone status bar contradicts the app.

## In scope

- Journal: a page is either a **stylus drawing saved as an image** or **typed text**, both
  on the same ruled **A4 portrait (1:1.414)** sheet. `kind` is the discriminator
  everywhere — a text entry stores `image = ''`, so never test emptiness to tell them
  apart. No transcription in either direction, no theme extraction, no vision. Deleting a
  page asks first.
- Calories: a **running total for the day, entered as you go** — 400 in the morning and 800
  later reads 1200. Stored as a log so a mistyped entry is removed rather than retyped, and
  the total is derived on read. Still no food database, no barcode, no API.
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
