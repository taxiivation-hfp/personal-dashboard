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
| **Drifted** | Did something else during *some or all* of that time |
| **Skipped** | Didn't happen at all |

- Marking is **tap-as-you-go during the day**. The evening review is a catch-up pass
  for anything still unmarked, not the primary path.
- **Drifted** opens an optional short reason field. Optional. Never blocking. Never a
  required field, never a modal you have to dismiss.
- Reasons are stored so the coach can spot patterns over time.

#### A DRIFT CAN BE PARTIAL — the worked fraction

Still three states, and the tallies still count by state: a partial drift is a **drift** on
the record and a drift to the coach. What it also carries is `block_marks.worked_fraction`,
0–1 — how much of the block was actually worked — set on a 5% slider that opens beside the
reason.

**It exists because the block share was already a claim about HOURS** and the only fractions
it could express were 0 and 1. An afternoon whose first forty minutes went as planned was
recorded as if nothing had happened, which understates a day that was genuinely half-lived.

**The rule lives in ONE place: `workedFraction()` in `src/lib/worked.ts`** — import-free, and
also the home of the `BlockState` union, which used to be written out verbatim in three
files. Five readers take it: adherence, productivity, `eventWorkIn`, the Portfolio lap and
the productivity drill-down. Five hand-written copies of one state table would diverge
silently — two screens quietly disagreeing about the same 48 minutes, with no error and no
failing test. **Do not inline this rule anywhere.**

- **The fraction is HOURS, and hours count wherever hours are counted** — the ring, the
  score, and the Portfolio project-hours lap. **The Social ring is untouched**: it counts
  *events*, and half an evening out is not half a social event.
- **NULL is not 0.** Null means nobody was asked; 0 means you said none of it. Both are worth
  nothing, so every drift written before the slider is unchanged — and the distinction is
  kept because the coach is a reader that can use it.
- **100% converts the mark to Adhered**, in `engine.markBlock` and not in the client. At the
  top of the slider the arithmetic is already identical, and a chip reading "Drifted" over a
  block worked end to end is the record holding two names for one fact. `/api/blocks` returns
  the **resulting** state; the screen closes its row on that answer rather than predicting it.
- **The slider never gates the mark.** Tap Drifted → saved instantly at 0 → the row opens.
  One tap is still a complete drift. The honest-logging rule governs a second control exactly
  as it governs the first.
- **The percentage is drawn beside the chip, never inside it** — all three chips must keep
  measuring the same. Its fill is the **accent**, not the drift colour: this is the part you
  *worked*, and it feeds the amber ring, so it wears the ring's hue.
- **Tapping the Drifted chip reopens the row.** A slider you cannot correct is worse than no
  slider.

**Adherence rate is the hero stat**: today's adherence % is the single largest number
on the screen, drawn as a large amber ring with a 7-day strip beneath it.

### The figure CLIMBS from 0, and never falls

`src/lib/adherence.ts`. Two shares, and it is a sum of what has been EARNED, never a
ratio of done-to-due:

| Share | Earned by |
|---|---|
| **50** | blocked hours worked ÷ blocked hours in the day |
| **50** | non-negotiables ticked ÷ (non-negotiables scheduled + one-offs + THE TWO FLOORS), split evenly |

So one hour of an eight-hour day is `1/8 × 50`, and with five habits scheduled a
non-negotiable is one of SEVEN items — 50/7 each. A ONE-OFF non-negotiable scheduled for
the day (see its own section) is one more equal item; it can only ever be added for a day
AHEAD, so the denominator is still a thing the morning knew. `adherenceFor` itself is
unchanged — the tally is assembled in `getDayView` and `/api/adherence`, BOTH of which
must count the one-offs or the strip and the hero disagree about a day.

**STEPS AND CALORIES ARE TWO MORE ITEMS OF THE HABIT SHARE, EARNED FRACTIONALLY** — the
owner's ruling, 2026-08-17; they used to feed adherence nothing at all. Each pays
`clamp(value / floor, 0, 1)` of one item's share — `floorCredit` in adherence.ts, the
`workedFraction` pattern: clamped, test-pinned, imported by the drill-down rather than
restated. Half the step floor is half a share. They are the only fractional items because
they are the only ones that ARE quantities; a tick has no halves. The cap is the ring rule
again — 14,000 steps earns exactly what 7,000 does.

- **Both floors sit in the denominator EVERY day.** Null earns nothing but leaves nothing:
  a denominator that wobbled with a phone battery would change what every other item is
  worth for reasons nothing you did caused. A day the phone never pushed simply has an
  unearned share, like an unticked habit.
- **The figure still only climbs** — both readings are running totals that never fall
  within a day, and the clamp forbids a negative credit.
- The floor constants stay in their homes — `STEPS_FLOOR` in rings.ts, `CALORIE_FLOOR` in
  productivity.ts — and adherence.ts imports them. No copied numbers.
- **KNOWN AND ACCEPTED: every past day re-read lower when this landed** (denominator +2,
  mostly unearned back then) — the same silent history rewrite as retuning
  `CALENDAR_RATES`.
- `habitsDone`/`habitsScheduled` remain the TICK tally. "3 of 5 ticked" must stay a true
  sentence, so the floors are not in it; they reach `pct` and nothing else.
- The productivity score keeps its own BINARY calorie rule. Two measures, two questions,
  deliberately not one arithmetic.

**EVEN HALVES, replacing 70/30 — the owner's ruling.** The old split made the figure mostly
a story about the calendar: a day with nothing scheduled could barely climb however much of
the standing minimum was kept, and a day of long blocks read well with the whole checklist
untouched. Halves say what the app actually believes — the hours you said you would work and
the things you do every day regardless are worth the same, and a day is answered by both.
`BLOCK_SHARE + HABIT_SHARE` must remain 100; a test pins it, and the tests are written
against the constants rather than the numbers so the dial can be turned again.
A day with 8h blocked and 5 items starts at 0 and can only go up.

**This replaced a ratio of adhered-to-due, and the reason is behavioural, not
arithmetic.** That figure fell every time a block came due unmarked, and fell again at an
evening habit cutoff. Watching a number you are trying to earn slide backwards all
afternoon is demotivating in a way that makes people stop looking, and a number nobody
looks at cannot do its job.

Consequences worth knowing, all of them intended:

- **There is no habit cutoff any more.** `app_meta['habit_cutoff']` and `habitsDueOn` are
  gone. An unticked non-negotiable is simply its share not yet earned; nothing has to
  become "due" for the figure to be honest, because nothing is ever held against you.
- **Drift is not punished, it just does not add — for the part you drifted.** A drifted block
  carrying a worked fraction adds that fraction of itself, so an afternoon half-lived reads
  as half-lived. The three-state mark still records what happened and the coach still reads
  it. The hero figure stops being the place that holds it against you.
- **Nothing can make the figure fall, and no fraction may.** A clamp in `workedFraction`
  is what enforces it: above 1 a block could earn more of the day than it occupies, and
  below 0 *marking* a block would lower the number — the one thing a climbing figure must
  never do. A test pins it.
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
whole list. Workouts are logged separately, by kind: **Strength / Cardio**, one
row per SESSION — a day can hold two lifts and a run, and each is its own document.

**MISC IS GONE.** What it held was bouldering and calisthenic skills, and Calisthenics is a
Portfolio SKILL. Once skills started logging sessions rather than hours the two were the
same document with two places to write it — so it got written in whichever the owner
remembered, and both counts were wrong. One activity, one row. `gym_sessions.kind` still
ACCEPTS `'misc'` at the database level and any surviving row is left alone: nothing writes
it and no metric counts it, so it is inert rather than corrupt. Preserve data; migrate,
never drop.

Each kind opens **its own free-text document** — a separate note per session, not one
shared field. Saving IS logging; there is no second "did it" toggle to forget. The text is
deliberately unstructured: a workout log is numbers scribbled between sets, and any form
imposed here is a form to fight on a bad day.

**Calories have a FLOOR at 2500**, worth one non-negotiable in the productivity score and —
since 2026-08-17 — one fractional item of adherence's habit share (see the adherence
section). A floor to reach, never a ceiling to stay under: this is someone training, for
whom under-eating is the failure and there is no upper bound worth drawing. Its box is
DASHED until met — "not yet" rather than "failed", since most of a day is legitimately
spent below the line. In the PRODUCTIVITY score, below the floor still scores nothing —
a points total you can half-hit is a target by another name; adherence pays the reached
fraction of the floor for the same reason it pays the worked fraction of a block. The
calorie row's STREAK counts a third threshold, `CALORIE_STREAK_FLOOR` (2,000 in
streaks.ts) — "did you log the day", deliberately not "did you eat enough"; see the
streaks paragraph in the non-negotiables section.

**A non-negotiable may carry a DOCUMENT** — outreach and reading, today. `habit_entries.note`,
one per day by that table's own UNIQUE constraint, which is the shape the metric already
counts in: outreach is `perDayCapped: true`, so a second message on a Tuesday is the same
Tuesday. What is counted is consistency at the floor, never volume past it.

**A DOCUMENT ROW IS ONE CONTROL** — the owner's ruling, 2026-08-21, replacing the
tick-box-plus-side-button pair. Tapping the row opens the logger (`NoteLog`), like every
other logging surface here; the roster of which rows do this is `DOC_HABITS` in Today.tsx,
keyed by `system_key` so a rename changes nothing. Three rules follow, all deliberate:

- Writing TICKS the day in the same upsert — saving is logging, no second control to
  forget. And **"Log it" over an empty page IS the tick**: the button never gates on
  words, because a day you did it with nothing to say must still cost one honest tap.
- **Unticking lives INSIDE the dialog**, behind the app's own two-step (never a native
  `confirm()`), because the box that used to retract a day is gone. It deletes the row,
  words and all, and says so before it does.
- **Clearing the note still does not untick** — deleting a sentence you no longer like
  must not quietly retract the day. Two different retractions, named apart.

**READING LOGS PAGES AS WELL AS WORDS.** The reading dialog carries a "Pages read" number
beside the textarea; it lands in `habit_entries.value` next to the note (see
`engine.setHabitNote`'s three-shape `value` contract: undefined leaves it, null clears to
a bare tick, a number sets it — a note edit must never eat a number). KNOWN AND ACCEPTED:
value 1 is ambiguous between "a bare tick" and "one page"; with a ten-page floor that is a
curiosity, not a schema. The row's identity is `system_key='reading'`, stamped by the
latched `system_keys_v2` block in client.ts. Reading notes join the WRITTEN LOG as their
own kind, exactly as outreach notes do.

The Journal row deliberately has no note of its own — a page IS the document, and a note
about it is a second diary.

**EVERY CHECKLIST ROW CARRIES ITS OWN STREAK** — the owner's ruling, 2026-08-21. A plain
count of consecutive done days, the same standing the app-wide streak has: a fact, never a
mechanic — no flames, no badges, and **a streak of 0 draws NOTHING**, because a row that
greets an off week with "0" is a row that scolds, and a list that scolds stops being
ticked honestly. The walk lives in `src/lib/streaks.ts` (pure, tested): days the item is
not scheduled neither count nor break (a Sundays-only item keeps its run through the
week), and the live today gets GRACE — unticked at 2pm is "not yet", never a break.
Streaks are HIDDEN off today, for the app-wide streak's own reason: the days you step back
to are precisely the unmarked ones. **Calories streak on `CALORIE_STREAK_FLOOR` (2,000),
deliberately below the 2,500 floor** — the streak asks "did you log the day", not "did you
eat enough"; a streak pinned to the eating floor would give an honest under-day a reason
not to be logged. Journal's streak rides its own habit entries, which page saves already
tick. Steps has no streak: a streak on a phone battery is not a streak on a person.

### One-off non-negotiables — "Tomorrow, specifically"

The `/habits` section of that name used to EDIT the standing list for one day (a
different name, a different pillar, via `habit_overrides`). The owner's ruling,
2026-08-21: that was the wrong verb — **tomorrow takes ADDITIONS, never edits**. The
override write path, its API route and its editor UI are gone; the `habit_overrides`
table and `habitsForDate`'s COALESCE read stay, so days dressed while the feature lived
still read back as they were worn.

What replaced it: `one_off_habits` — a non-negotiable for ONE day. It appears on that
day's checklist beside the standing items (accent tick, "one-off" suffix), joins the
habit tally as one more equal item, and is gone from the roster the day after. NOT a
task and not a habit: it never carries, has no weekday rule, and IS scored.

- **Only for a day AHEAD — the rule that makes it safe.** `engine.createOneOffHabit`
  refuses today and the past: adherence divides by items scheduled, so an item joining a
  live day would grow the denominator mid-day and the climbing figure could FALL. Added
  tonight, it is part of what tomorrow morning already knows.
- **Unticked after its day, it is an unearned share** — the day ended where it got to. It
  stays tickable from that day's own screen (catching up); `done` is a flag on the row
  because there is no habit for a habit_entry to reference.
- **Removable only while it is still a plan** (`date > today`, enforced in the engine):
  a lived day's denominator is part of its record, and deleting a ticked item would
  lower a day's figure after the fact.
- **It feeds adherence and NOTHING else** — not the productivity score (the owner's ask,
  stated literally: "counts towards tomorrow's adherence"), not the rings, not the
  streaks. `/api/adherence` passes only the STANDING tick count to `scoreDay`.

A non-negotiable may take a **number** instead of a tick (`habits.input = 'number'`, with
`habits.unit`). Daily weight uses it. The value lives in `habit_entries.value`, which is
already a REAL, so adherence and the rings need no special case — an entry exists or it
does not. Clearing the field clears the day, exactly like unticking.

## Tasks — one-off, carrying, and deliberately unscored

Separate from non-negotiables and separate again from blocks. A non-negotiable is a standing
weekday rule ("weigh in, every day"); a **task** is a single thing decided for a single day
("book the physio"). Added from `/habits`, dated, defaulting to **tomorrow** — the day you
can still shape, which is the same reason the day title and the habit overrides live there.

**If it is not ticked it carries forward, and the carry is DERIVED, never written.** Where a
task sits is computed from `due` and today (`src/lib/tasks.ts`, import-free and tested); no
nightly job moves anything. That deletes the whole failure class this feature is usually
built with — a cron that runs twice and skips a day, one that misses a night and strands a
task, a phone opened at 2am rolling the day early. Reading a task twice cannot move it twice.

| Column | Means |
|---|---|
| `due` | the day it was FIRST for. Never rewritten — an origin, not a cursor. |
| `done_on` | the day it was ticked, or NULL. Ticking is what fixes a task to a date. |

- A done task belongs to **the day it was done**, which is what keeps a past day's record
  true when you read it back. An outstanding task sits on **today** and on no earlier day —
  the record of a past day must not grow new rows because you did not do something since.
- **It feeds NOTHING** — not adherence, not the rings, not the streak, not the coach. The
  habit share splits over non-negotiables SCHEDULED plus the two floors: a fixed
  denominator known each morning. A carrying backlog joining it would make every other item
  worth less for reasons nothing you did today caused — which is exactly the "item you are
  designed to fail" that keeps the gym off the checklist. The list says `not scored` on
  screen rather than leaving it to be discovered.
- **"carried 3 days" is a fact, not a verdict.** No red, no "overdue", no escalating weight.
  The honest-logging rule covers this list too: a list that starts scolding is one you stop
  writing to.
- The table is `day_tasks`. It is NOT the legacy `tasks` table, which is the pre-redesign
  board and now holds only the old gym history that `migrate.mjs` rescued into
  `gym_sessions`.
- **Its SCORED sibling is the one-off non-negotiable** (see that section): same "one thing
  for one day" shape, opposite contract — a one-off never carries and counts toward its
  day's adherence, a task carries and counts toward nothing. Do not merge them; the
  denominator argument above is exactly why the carrying one must stay unscored.

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
- **Portfolio carries a lap of its own: PROJECT HOURS.** Adhered Basil blocks over the
  fortnight — the same colour and the same adhered-only rule productivity prices at the full
  rate — against 14 hours, an hour a day. `weight: 0`, so it is a thin outer lap and never
  moves Portfolio's fill.

  That weight is the point, not a technicality: **Portfolio's fill stays a statement about
  SKILLS**, so blocking six hours and touching nothing cannot fill the pillar. The lap says
  the hours were there; the donut says what came of them. It is also the first metric
  measured in HOURS rather than in things that happened — skills count sessions because
  turning up is the unit, and project work has no session shape. It is the thing that
  quietly gets none of the week, so the honest question is how much of the week it got.
- **A metric may have a floor without having a share, and it is drawn OUTSIDE the ring.**
  Steps and the Portfolio project-hours lap both do: a threshold of their own at `weight: 0`,
  so each fills its own mark and neither ever enters its pillar's mean. (Misc used to be the
  third and is gone — see the non-negotiables section.)

  As a slice it would have been wrong either way: weighted, it would take circle from the
  metrics that count; at weight 0 it would sit there looking like a slice switched off. As
  a **thin translucent lap around the donut** it reads as an extra, which is exactly its
  standing in the maths. `MetricRing.lap` derives this in `rings.ts` — the registry stays
  the only place that knows what weight 0 means. A ghost is never a lap: "no source yet" is
  a statement about the app and belongs on the ring where the metric would have been.

  Translucent, **not glowing**. A glow is a shadow, and this app ships none.
- **Social events come from the CALENDAR, not a checklist.** Graphite (`colorId: "8"`)
  means a social event — Church, a night out, a farewell. They are already scheduled there,
  and a second place to record them is a second place to forget. Counted in `/api/rings`
  and passed to `getRingCounts`; on a calendar failure the count is left UNDEFINED so the
  ring goes ghost rather than reporting a false zero. ADHERED only: an event you drifted
  from is not a social fortnight you had.
- **EVERY ADHERED SOCIAL EVENT COUNTS TOWARD THE SIX** — standing and one-off alike. The
  metric was fed the RECURRING events only, on the reasoning that a farewell you were invited
  to is not evidence you kept a standing commitment. Measured against a real fortnight that
  reasoning collapsed: five adhered social events, one recurring, ring reading **1 of 6**.
  Most of a social life is one-offs, so the ring could not be filled by socialising — only by
  socialising on a repeat rule. That is the same shape that keeps the gym off the checklist:
  an item you are designed to fail teaches distrust of the whole board. The ring is now fed
  the SAME tally the caption prints, so the two can never disagree about one fortnight.

- **The two Social BANDS still split on RECURRENCE, never on colour.** Inner is the standing
  kind — Church, a weekly night out; the mid band is the one-offs. Both are graphite, and the
  split now decides only what is DRAWN and which drill-down list an event lands in — never
  what is scored.

  It was two colour ids until it was measured, and the lesson is worth keeping: **the
  Calendar API reports only the ELEVEN LEGACY colour ids while the calendar UI's palette is
  wider**, so Graphite and the Birch beside it both arrive as `8`. Across 180 days of the
  owner's calendar, id 8 held Church and Nathan's Farewell side by side and the only id 4
  event was titled "Gym" — so the second constant matched nothing social, the one-off band
  never drew, every one-off quietly filled the inner ring, and a stray Gym block was one
  adhered mark from counting as a night out.

  `CalEvent.recurring` (from Google's `recurringEventId`, present on every instance of a
  series) is what the colours were standing in for. A colour cannot carry this; a repeat
  rule can, and cannot be fooled by a palette the API does not speak.
- **Every skill lives under Portfolio**, including ice skating, badminton, calisthenics and
  dancing. They are things being LEARNED, and learning is what Portfolio holds; Physical
  already counts its own work from `gym_sessions`. The `skills` metric counts every
  `skill_time` row regardless of pillar and always did, so this decides where a skill is
  listed and nothing else.
- **A SKILL LOGS SESSIONS, NOT HOURS**, and a session is a free-text document — the same
  object a workout is, written on the same surface, with the first line as its title via the
  same `src/lib/sessions.ts`. Portfolio stopped being a stopwatch: three quick-add chips
  could only say how LONG, and what is worth recording is what you worked on.

  The table is still `skill_time` — renaming a live table is churn for a noun — but
  `minutes` is now NULLABLE and nothing writes it. Every hour ever logged is still in it,
  because preserving data outranks a tidy schema; `NULL` means "a session", a number means
  "logged under the old hours model", and both count as exactly one session. `client.ts`'s
  `ensure()` widens the column on boot by rebuilding the table when it finds it still
  `NOT NULL`, since SQLite cannot alter nullability.

  Sessions are ROWS, so a skill may hold several on one day — two sittings at the piano are
  two sessions, the ruling gym already runs under. That also finally matches what the metric
  always DECLARED: `perDayCapped: false`, `unit: "sessions"`. It was being counted
  `DISTINCT (skill_id, date)`, the exact label-versus-counter drift the registry warns about.
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

### TODAY ITSELF MOVES — and it is still not a date picker

Everything else is marked where it happens, and until now that meant only where it happens
TODAY. "I did it but forgot to log it" had no answer, which is the one gap that makes a
person start guessing at yesterday — and a guessed log is exactly the drift this app exists
to catch.

So the whole screen takes a day. `data.date` was already threaded through every fetch and
every write on it; what was missing was any way for that value to be a day the server had
not rendered. Three ways in, and NONE of them is a calendar control:

- **‹ › at the end of the date line.** The date is a heading that happens to be steppable,
  not a dial — hence the arrows at the end of the line rather than flanking it.
- **A tap on any column of the week strip**, which is where a hand already reaches to read
  the last seven days. One transparent button per column, laid OVER all four rows: those
  rows line up by a percentage gap, and turning one of them into controls would have made
  it a different height from its neighbours and pulled the alignment apart.
- **`?date=` on the front door**, clamped to today and validated. For a reload — the screen
  writes the day back with `replaceState` as you move — and for the journal's
  "open that day".

**The screen never shows a day it cannot write.** The swap is ATOMIC: the whole day arrives
at once and the control you pressed carries the wait. Moving the date line first and letting
the checklist catch up would put one date at the top of the screen and another day's ticks
underneath it, and a tick made in that window is a tick against the wrong list.

**A standing bar says so while you are back there** — `Catching up. Everything marked here
lands on Tuesday 11 August — 1 day back.` on `--color-recorded`, the token the calendar
column already gives a past day. Every control below it looks exactly as it does on a live
day, which is the point and also the risk. No warning hue: catching up is the feature
working, not a mistake.

**Never past today.** Nothing to log about a day that has not happened.

**The week strip stays anchored to TODAY**, with the viewed day underlined and the real today
still in ink. A strip that travelled with the screen could only be walked backwards — forward
would be off its right edge — and it would rescale its columns against a different week's high
at every step. Fixed, it is a ruler.

Two things stand down on a past day, and both would otherwise write to the wrong place:
**`StepsRefresh`'s button** (the Shortcut pushes to whatever day the SERVER calls today, so
the count on screen would never move) and its **staleness dressing** (dashed-and-ink means
"the phone has stopped pushing", which says nothing true about a Tuesday three weeks gone).
The age still prints. `NextUp` already returned null off today.

The three date pickers — workout, food, weight — now take the REAL today as their cap rather
than the viewed day. Capping at the screen's day would have made yesterday unreachable from
last Tuesday, which is the control quietly becoming narrower than the sentence beside it.

**`today` is re-read when the app comes back to the front.** It is resolved on the server,
which is the right place to resolve it once — but a value resolved once is wrong after
midnight, and this app lives on a phone home screen. At 00:10 a stale value means no
catching-up bar, a forward arrow disabled against a day that now exists, and a live Steps
button that would write into a row not on screen. Nothing MOVES when it rolls over: the day
you were looking at is still the day you were looking at, it has just stopped being today.

**Two figures are hidden rather than relabelled off today**, because they are facts about the
present that no past day can answer: Today's **streak** (`getStreak` counts the run ending on
the day it is asked about, and the days you step back to are precisely the unmarked ones, so
it would almost always read 0 in a card captioned "seven days to today"), and `StepsRefresh`'s
button. Everything else on the record says which window it means — `adherence to 2 Aug`,
`hours worked, 7 days to 2 Aug` — since four figures ending on the viewed day while three of
their labels claim to mean "now" is the record lying about a fortnight ago.

**Anything uncontrolled must be keyed by the DATE as well as its row.** The numeric
non-negotiable field is `defaultValue`, deliberately, so a background refresh cannot pull a
figure out from under a cursor. React only writes `defaultValue` to the value *attribute*,
which a browser ignores once the field has been typed in — so with a key that is the same on
every day, stepping back left this morning's weight sitting in a row whose tick and label had
already become yesterday's, and blurring it overwrote a real reading. A dated key makes the
day change a remount, which is the one thing that re-seeds an uncontrolled field.

**A weight reading can be CORRECTED or REMOVED, for any past day.** It always overwrote in
place — `habit_entries` is `UNIQUE (habit_id, date)` and `setHabitValue` upserts on that
pair, so a second reading for a day has never been a second row — but nothing on screen said
so, and a scale misread as 92.4 instead of 82.4 is a permanent kink in a line you will later
trust. `WeightEntry` now PREFILLS the reading for the chosen date and says `editing 3 Aug`,
Save becomes Update, and Delete appears only where there is something to delete. Deleting
asks first, in the app's own two-step — never a native `confirm()`, which in a standalone
PWA is a system sheet dropped on the page. Under the control sit the recent readings, each
one a tap that selects its date, because reaching a bad reading used to mean recognising its
date off the chart's axis and typing it in from memory.

`/sessions` lists BOTH logs — Strength / Cardio / **Skills** — because a skill session became
the same object a workout is. Two pages would mean two searches, and a search that sees half
your sessions is one you stop trusting. They stay different tables; the page merges them and
opens the right dialog for the row. A new SKILL session cannot be written from there, and the
control says so instead of failing quietly: "which skill" has no answer on a page listing all
of them, and on the board it is answered by the row you tapped.

`/sessions` is the whole gym log — every session ever, newest first, grouped by day, filtered
by kind, deliberately unpaginated. Two lifts on one Tuesday read as one Tuesday with two
entries. It is a COUNT, never a score: no streaks, no personal bests, no volume totals.

### The first line of a session is its TITLE

`src/lib/sessions.ts`, pure and import-free, shared by all four surfaces that show a session:
the log dialog's history pane, `/sessions`, the Physical pillar's drill-down and its chips.

**DERIVED ON READ, never stored.** The note stays ONE document and the dialog stays ONE
textarea — the first line is an ordinary line you can rewrite or delete. Splitting the text
into a title and a body on save would turn the log into a form, which is the one thing this
document refuses to be. Nothing migrates, and a stored split could never go stale because
there isn't one.

**A stored `gym_sessions.title` wins, and its note is left whole.** That column is only ever
filled by the rescued Discord history, where the title is a separate fact rather than the
note's first line — promoting the first line as well would eat a real set out of the body.

**The dialog's own textarea is deliberately exempt.** Titles are for LISTS. In the editor the
document is the document.

### Searching the log

On `/sessions` only, and it **composes** with the kind chips rather than replacing them.

- **The result is the matching LINE**, with its 1-based line number, grouped under the
  session it came from. Searching a training log is asking "where did I last do this and what
  did I lift" — the answer is the line. Clicking opens the whole session.
- **A phrase, not tokens.** Case-insensitive substring on the raw query. `incline db` finds
  that pair together; `incline bench` does not find them ten lines apart. Predictable beats
  clever on a record you are trying to trust.
- **`SEARCH_PAGE` (10) sessions, then the rest on request.** Filtered in memory, not fetched:
  `/api/gym/history` is deliberately unpaginated so the whole log is already there. The
  staging is about the READING — a keyword like "bench" can match half the log.

### A session can be MOVED, and editing one never clones it

`saveWorkout` sets the date rather than matching on it: `SET note=?, date=? WHERE id=? AND
kind=?`. The old `AND date=?` in the WHERE meant an edit whose date differed matched nothing
and fell through to the INSERT — writing a **second** row at the new date and leaving the
first. Two sessions, one a ghost, and the Physical ring counting both.

**The dialog opens on the SESSION's own date when editing**, and on the screen's when writing
a new one. It tells them apart by whether it was given a workout — which is why `Workout`
carries `date` everywhere now, including from `workoutsOn`.

## THE WRITTEN LOG — the record's second half

`/stats` is two tabs now: **Stats** and **Log**, chosen in the masthead with the same chip
idiom as the 30 days / 3 months / a year control beside them. One expansion, two questions —
"what do the numbers say" and "what did I write" — and the window control hides on the Log,
which is a continuous scroll with no window to set.

Everything the owner writes lived on a different screen from everything else they wrote:
journal pages on `/journal`, workouts on `/sessions`, skill sessions in a pillar drill-down,
drift reasons nowhere at all. `src/lib/dayLog.ts` (pure, tested) merges them by day and
`/api/log` pages them.

- **A FILE-EXPLORER GRID, since 2026-08-17** — the owner's ruling, replacing the two-shape
  scroll (journalled-day card / chip row) that spent a screen of height per day. FULL WIDTH
  of the record, never a reading column: a grid is not prose. Every day is a TILE under
  month dividers wearing the archive's chapter names. On a day with a page the page IS the
  tile — the archive's ruled miniature, always at the tile's full width. A page-less day is
  CARD STOCK, deliberately never a blank sheet: a sheet-shaped tile on a day with no page
  would claim a page exists. The date under a tile is its filename — which is how the
  journal's "a page must never be identified by 3px type" rule is answered here: a tile
  chooses a DAY, not a page, and the date is what names a day.
- **ATTACHMENTS ARE TABS, NOT DOTS** — each carries its own TITLE on its kind's colour
  (the pillar hues, chip-test certified for white text); DRIFT stays unfilled, ink on a
  hairline over panel, because this app does not colour a plan not happening. On a
  journalled tile they sit FOLDED into the card's right edge as closed binder stubs, and a
  pointer unfolds them OVER the neighbouring cards — sanctioned overlap, the owner's
  ruling. The unfold is not animated (width is layout; this app animates transform and
  opacity only); the title fades in. On card stock they run the tile's width, capped at
  four then `+n`.
- **ONE TAP OPENS THE DAY** as the journal-reader SPREAD — the workout dialog's two-pane
  document: the page at reading size in the main pane (typed pages grow past A4; drawings
  shown whole, never cropped — a thumbnail may cover, a reader may not), and "That day's
  logs" beside it, each under its tab with its body unfolded. A page-less day's logs take
  the whole dialog. Read-only; the link into the journal is the only way out to an editor.
- **PAGED BY DAY, never by row.** A row limit would cut a Tuesday in half and the next page
  would open mid-session.
- **A day with nothing written never appears.** An empty fortnight costs one thin month
  rather than fourteen tiles saying you wrote nothing — the same ruling that makes a blank
  day draw nothing on the charts. Only an EMPTY page ends the scroll; a short page is not
  the end.
- **IT OWNS NOTHING.** A reader, with no editing: a journal page opens in the journal, where a
  page can actually be rewritten. Two places that can change one row eventually disagree.
- Entry order within a day is fixed in one place: journal, gym, skill, outreach, reading,
  drift. The journal leads because it is about the day as a whole; a drift reason is a
  footnote to one block of it. Reading joined when its row became a logger — what a book
  left behind is written record, and a log that showed half the documents is one you stop
  trusting.

## /stats — the record, and the only place history lives

A route, not a fourth pane, reached from the fourth phone tab and from `StatsLink` under
the pillar rings. Today is where you ACT; this is where you look back, and the split is
deliberate — a screen showing both invites reading the past as a verdict on the present.

Five charts, and the order is the argument: **adherence** first because it is the app's
question, **hours** second because it is the sanctioned exception, **weight**, **calories**
and **steps** last because they are facts about a body rather than about a plan.

`DayChart` is the one primitive, and the FORM follows what the quantity IS:

| Form | For | Why |
|---|---|---|
| **line** | weight | it persists between readings. On the range observed — pinned to zero it is a flat line saying nothing. Broken at every gap; a run of one is drawn as a dot. |
| **bars** | calories, adherence, steps | accumulates then restarts. From ZERO, and a line would imply Tuesday's intake flowed into Wednesday's. |
| **stacked** | hours | bars with composition, split by where the hours went. |

**A day with no entry draws NOTHING** in all three — not a zero-height bar, not a line
through it. Most days in a 90-day window are blank in an app this new, and drawing them as
zeros would report a catastrophe that never happened. It bites hardest on steps: the source
is a phone that can simply be left on a desk, and a day it never reported is not a day
nobody walked.

`DayChart`'s `marker` — the dotted red floor line, the app's only red — now serves **two**
quantities: calories at 2,500 and steps at 7,000. Both already wear a dashed checklist box
and print `/floor` beside their figure, so the line says on the chart what the row already
says. That is the whole permitted set, and the rule that keeps it small is DIRECTION: a
floor is a line you climb to, so a day under it reads "not yet". A ceiling or a goal is a
line you can be found wanting against, and this app draws none.

Adherence is the one series with a real ceiling, so it is scaled to 100 rather than to its
own high: scaling it to itself would make a week of 40s look like a week of 100s.

**Two charts and two figures open their workings**, and only where there is a derivation
worth showing. Hours opens the productivity breakdown — the SAME `ProductivityLog` the Today
strip opens, so the record can never explain an hour differently from the screen it was marked
on. Adherence opens what did and did not add, blocks AND non-negotiables, since adherence is
an even split and a sheet showing only the calendar would explain half a figure while
appearing to explain all of it. The hours FIGURE opens where the window's hours went, summed
from the series the chart already holds — in MINUTES, never points, because the score stays
quarantined off the record. Weight, calories and steps open nothing: behind those days is a
single number, and a control opening an empty sheet is worse than no control.

**The second column is "didn't add", never "failed".** Nothing in this app's arithmetic
subtracts.

**The weight line is CONTINUOUS, and the bridge is drawn differently.** A faint dashed
polyline joins every reading across the gaps, under the solid measured runs. Weight is the
only series that earns even the inference — a body HAS a weight on a morning nobody wrote one
down, where an unlogged day's intake is not a number that quietly existed. Bars stay broken.

**No average, no delta, no target line, no smoothing, no window-over-window comparison.**
Every one of those is a judgement about a number this app has no business judging.

## The month's chapter

The masthead reads **"The Book of Nero: <name>"**, and the second half is editable in place —
one row per month in `chapters`, keyed `'YYYY-MM'`. A NAME, not a number: "Chapter 8",
"August", "The Thesis Month" are all valid and none is derivable from a date, so deriving one
would mean the app deciding what the eighth month of a life is called. Clearing it DELETES the
row, so "unnamed" has exactly one representation.

The journal's month dividers print it **alongside** the month rather than instead of it: a
chapter names a stretch of life, "August 2026" is where it sits in a record you scan by date,
and losing the second to gain the first trades navigation for atmosphere. Edited only on
Today — the archive is what has already been written.

**It feeds nothing**, exactly like the day's title below, and for the same reason.

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
- **The strip ENDS ON TODAY**, and stays there even when the screen has stepped back — see
  Backdating. Seven days, today last, no future columns. The calendar
  column is what says what tomorrow holds; a strip reserving three empty columns for it
  spent a third of its width on days that had not happened.
- **A gym session scores ONCE, from the LOGGED SESSION, at a FLAT 50** —
  `POINTS_PER_SESSION`. Grape (`colorId "3"`) is deliberately absent from `CALENDAR_RATES`,
  so a gym block on the calendar is worth nothing on its own. One of the two pays, never
  both: paying for the scheduled hour as well would buy the same training twice.

  **It is the one thing here not priced by the clock, and that is the owner's ruling.**
  Three hours under a bar is not more productive than two — an hourly rate says it is, which
  is a claim about training this app has no business making, and it would pay for dawdling
  between sets while docking a session that was efficient. A session happened or it did not.
  So a two-hour session and a forty-minute one score identically, and a day with two lifts
  and a run scores three of them.

  This REVERSES the arrangement that shipped first (an hour of Grape at half rate, with the
  `workouts` input deleted). The double-count guard is unchanged; only which side of it pays
  has swapped. The consequence is the mirror of the old one: a session you SCHEDULED but
  never wrote up scores nothing, which is consistent with `workedFraction` paying only for
  blocks you marked — both ask you to say what happened. The Physical ring reads the same
  logged row, and that is the ring's job, not a second payment.

  The slab takes `SLAB_GYM` — Grape's projection, free now that no blocked time can draw it.
  Not achromatic: grey belongs to the ticked things, and two grey slabs cannot be told apart
  at eighty pixels tall.
- **A PARTIALLY WORKED BLOCK PAYS ITS WORKED SHARE**, at its colour's rate — two hours of
  Basil drifted at 40% is 48 minutes at the full rate. Consistent with everything above:
  this file prices HOURS, and 48 of those minutes were hours. The disqualifications come
  FIRST and hold at any fraction — an unlisted colour and an all-day event earn nothing
  however much of them you worked.

  A segment's `minutes` are therefore the minutes **worked**, not the minutes scheduled,
  because those are the minutes that earned the points and a breakdown must not disagree
  with the bar it explains. The forfeited remainder is accounted for in the drill-down's
  **"didn't count"** list, which is now keyed on *minutes that earned nothing* rather than
  whole blocks — a partial drift appears in both halves of that screen, correctly.
- **Non-negotiables stay in the score even though adherence counts them too.** Not a double
  count: adherence and productivity are two different questions asked of the same day, and
  ticking a non-negotiable is a true answer to both.
- **No productivity number is ever printed ON THE STRIP.** The bar's height is the whole
  claim there. Printing an uncapped score with no ceiling beside it invites a comparison it
  cannot support — and it is the shortest path back to a scoreboard.
- **Tapping a column opens its WORKINGS** — `ProductivityLog`, fed by `/api/productivity`.
  This is the other half of that bargain, and the reason the rule above can stay: the bar
  is a shape you glance at, and the arithmetic is one deliberate tap away. A drill-down you
  opened on purpose is an explanation; a number sitting on a chart is a score. The total is
  printed HERE and nowhere else, because a breakdown that withholds what it adds up to is
  not a breakdown.

  **"Didn't count" is the half that earns the screen.** Everything above it is already
  visible on the bar; this is not. A day full of scheduled hours can score nothing — an
  unmarked block pays nothing, skipped and drifted pay nothing, and a colour absent from
  `CALENDAR_RATES` pays nothing — and every one of those is invisible in a stack. It is
  stated without scolding: an unmarked block is information about the log, not a verdict.

  `ProductivitySegment` carries `minutes` and `rate` so the workings come from `scoreDay`
  itself. A breakdown computed anywhere else would eventually disagree with the bar it
  exists to explain, and a disagreeing explanation is worse than none.
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
- **FIVE CATEGORIES, and the split exists to answer "where did the week go".** The point is
  to see whether an hour went to the portfolio, to uni, or to the till:

  | Category | Colour | Rate |
  |---|---|---|
  | **Work Projects** | Basil `10` | 100/h — the only full rate |
  | **Work Uni** | Banana `5` | 75/h |
  | **Work Part Time** | Lavender `1` **and** Tomato `11` | 50/h |
  | **Uni** (the timetable) | default, no colour | 50/h |
  | Social | Graphite `8` | **nothing** |
  | Gym | Grape `3` | **nothing** — flat per logged session |

  Work Projects is the only full rate because it is the work nobody scheduled and nobody is
  paying for, which is exactly why it is the first thing a bad week deletes. Social scores
  nothing at all: seeing people is a pillar, and paying it productivity points would make an
  evening out a thing you can be more or less productive AT.

- **ONE CATEGORY MAY OWN TWO COLOURS, and the stack merges by CATEGORY not by colour.**
  Work Part Time owns Lavender and Tomato because the calendar genuinely holds both, and
  re-colouring a year of history is a worse trade than a two-row table. `scoreDay` therefore
  keys its slabs by label and carries a `label` on every segment, so no screen looks a name
  up and none can call one slab two things. A segment's `colorId` is the category's
  CANONICAL colour — the first id listed for it — not necessarily any one event's.
- **CHANGING THIS TABLE REWRITES HISTORY, silently.** The score is recomputed from the live
  calendar on every read, so adding a colour makes every past adhered block of that colour
  start scoring, and removing one makes them stop. There is no stored score to migrate and
  no warning on screen. Retune deliberately.

## The coach — REMOVED

There is no coach. `src/lib/coach/`, `/api/coach`, `/api/coach/note`, `CoachNote.tsx` and the
`coach_messages` table are all deleted, by the owner's ruling. `ANTHROPIC_API_KEY`,
`COACH_MODEL` and `COACH_EFFORT` are dead config.

Comments elsewhere still say a thing is "quarantined from the coach" or "stored so the coach
can spot patterns". Those stay true as history and as the REASON a boundary exists — the
productivity score is fenced off from `DayView` by data flow, and that fence is worth keeping
whatever reads it next. **Drift reasons are kept**: their reader is now the owner, and they
surface in the written log below.

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
- **There is no bottom tab bar.** Removed by the owner's ruling — the panes are reached by
  tapping the window you want, and swiping, which is what was actually used. `PhoneSwipe`
  stays. Removing a navigation control must never strand a screen: `/stats` is reached from
  `StatsLink` and left by the record's own ×, which falls back to `href="/"` when there is no
  in-place close to call.
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

## The journal is READ and REWRITTEN, not only written

It was write-only, and for typed pages literally so. Every list in the app carries a
140-character `preview` — deliberately, since a year of handwriting as data URLs in one
response is the whole reason `[id]/image` exists — but that was the ONLY thing a typed page
ever showed. There was no way through to the rest of it, and a drawing "opened" as a raw PNG
in a browser tab, which is the file rather than the page.

**`GET /api/journal/[id]` is where the full `body` lives, and the only place.** A drawing's
bytes still are not in it; `[id]/image` serves those as a real image with a cache header, and
re-encoding the same PNG as base64 inside JSON would be the same page again at four thirds
the size.

**`PATCH /api/journal/[id]` rewrites a page, and `kind` CANNOT CHANGE.** That is enforced in
`updateJournalEntry` against the STORED kind rather than trusted to the caller: turning a
drawing into words would drop the only copy of some handwriting, and the reverse would leave
words in a row nothing reads again. Nothing is stamped — an "edited" mark would be the app
looking over the owner's shoulder at their own diary — and there is no habit tick to do,
since a page already existing is what ticked it.

- **A typed page reopens with its words**, on the same surface it was written on. Save
  instead of Save page; a second screen for correcting a sentence would be a second place
  the journal lives.
- **A handwritten page reopens with its ink UNDER THE PEN.** Only a flat PNG was ever
  stored, so there are no strokes to pop: Undo and Clear take back what you add NOW, and the
  note above the canvas says so rather than leaving it to a tap that does nothing. The base
  is drawn FITTED, never stretched — pages saved before the A4 rule are whatever shape the
  dialog happened to be, and filling the canvas with one would squash the owner's own hand
  and then flatten the squash in permanently on the next save.
- **`/journal` is a LIST, not a shelf.** The unit is a page: the page in miniature, the day
  it belongs to, and the line it opens with. The opening line is what tells two Tuesdays
  apart and a thumbnail cannot carry it — which is why a contact sheet was the wrong shape
  here even though it photographs better. Months as chapters, newest first, both ways.
- **Delete lives in the reader**, where the page is legible, instead of hanging off a
  thumbnail nobody could read. Still the app's own two-step, never a native `confirm()`.
- **Leafing is BY DATE and the words say so** — `‹ older` / `newer ›`. `pages` runs newest
  first, so a pair of bare arrows would have made the direction something you learn by
  pressing one.

### The ruled sheet — one page, four sizes

`.sheet` in `globals.css`, wrapped by `Sheet.tsx`. A4 portrait ruled into **eighteen lines
whatever the sheet measures**, everything derived from its own WIDTH in `cqw`.

The ruling used to be a 34px constant shared by hand between the canvas and the typed page,
which meant it only looked right at the one size the writing dialog happens to be — and at
thumbnail size the archive drew **no lines at all**, so a typed page on the shelf was a scrap
of paper and a handwritten one was a page. A thumbnail is a small PAGE, not a page with tiny
lines. The canvas derives its own ruling from canvas width by the same two numbers, so a page
ruled in a PNG matches one ruled in CSS at any size on any display.

**The reading sheet GROWS**; the writing and thumbnail sheets are fixed A4 and clip, because
that is what running out of paper looks like. A fixed reader with an inner scrollbar would
have slid the words across their own rules. `--paper` is a real physical colour and not a
surface token: a page in a beige app is still paper.

**No rules under a drawing** — the PNG carries its own, and a second set would be two pages
showing at once.

**The WRITING surface paints its own ruling** rather than sitting over the shared layer, and
`background-attachment: local` is the reason: a textarea scrolls its content inside a box
that does not move, so a layer pinned behind it leaves every line past the seventeenth
sitting off its rule. One `--rule-bg` declaration, two consumers.

**The page's type is FLUID, and that is the one place in the app where it may be.** The five
type steps govern the app's own voice — labels, rows, controls, captions. A journal page is
not the app speaking; it is an artefact, and its text is a property of the paper the same way
handwriting is. Sizing it in `cqw` is what makes a thumbnail the page in miniature instead of
a full-size page cropped to a stamp. The cost is that a thumbnail's words are texture rather
than words, so **wherever a thumbnail is a CHOICE, the opening line is printed beside it** —
the archive and the day's chooser both do. A page must never be identified by 3px type.

**Saving a drawing is gated on the saved page having arrived.** A canvas that looks like it
is adding to a page and is really holding a blank one is the only control in this app that
can destroy something irreplaceable: Save flattens what is on screen and PATCHes it over the
row. So `JournalCanvas` tracks whether its base image loaded, refuses to save until it has,
and says which of "fetching", "ready" and "could not be loaded" is true.

## Steps — the one figure this app does not write

LIVE. An iOS Shortcut POSTs the day's count hourly to `/api/health`, which upserts
`health_logs` — one row per day, a later push REVISING rather than accumulating. That route
is the phone's one way in and is the only entry in `proxy.ts`'s `MACHINE_ROUTES`,
authenticating with `x-app-secret` because a Shortcut cannot hold a session cookie. **Do
not change how that push works**; everything below is additive to it.

`STEPS_FLOOR` (7,000) is exported from `rings.ts`, derived from the metric — the checklist
row, the chart's floor line and the ring read the same constant, and there is deliberately
no second `METRICS.find` anywhere.

**THE RING COUNTS TOTAL STEPS, NOT QUALIFYING DAYS** — `SUM(steps)` over the fortnight
against `STEPS_FLOOR x WINDOW_DAYS` (98,000), derived rather than written down so retuning
the daily line moves the fortnight target with it. It used to count days that reached 7k,
which made it a CONSISTENCY measure: 6,900 steps scored what 0 did, and a 20k Saturday
scored what 7,001 did. Steps ACCUMULATE, and nothing about a body cares which date they
fell on.

Known and accepted: this is the one metric where a big day can carry several quiet ones.
That is a real change of meaning, which is why the daily floor stays drawn on the checklist
row and on the chart — those still ask about consistency. `weight: 0`, so it draws as a
thin outer lap and a phone sensor can never move the Physical mean.

Steps also earn a fractional item of ADHERENCE's habit share — `floorCredit(steps,
STEPS_FLOOR)`, see the adherence section. The phone stays the only writer; adherence is
one more reader of the same row, and a day it never pushed reaches the maths as null,
never as a zero nobody measured.

- **The count is READ-ONLY everywhere.** The phone is the instrument, and a hand-typed step
  count is a number nobody measured. The step dialog therefore has no entry control — the
  one way it differs from the weight dialog it is otherwise copied from.
- **Its AGE is always printed** (`StepsRefresh`, beside the count). A figure between a
  minute and an hour old that does not say which is a number you act on wrongly; past two
  hours — two missed hourly pushes — the label goes DASHED and ink. Stale is said in FORM,
  never in colour: dashed is already this app's word for "not yet", and a warning hue on a
  step count would be the app grading a body. `sinceLabel` in `dates.ts` is pure and tested.
- **On iOS that label is a BUTTON that runs the Shortcut.** `window.location.href =
  "shortcuts://run-shortcut?name=…"`, assigned in an `onClick` — never an `<a href>`, which
  a standalone PWA can silently swallow. The name must match the Shortcuts app EXACTLY;
  there is no id, no fuzzy match and no error to catch. iOS is FEATURE-DETECTED via
  `"standalone" in navigator` — a WebKit-on-iOS property that exists nowhere else — not by
  reading a UA string, which iPadOS lies in by design. Elsewhere the same label renders as
  plain text: nothing to tap on a laptop, but the age is still worth knowing.
- **Coming back re-reads it.** Tapping the button means LEAVING the app, so
  `visibilitychange` (with `focus` as the desktop fallback) re-pulls the count, throttled to
  5s so the pair a single return fires is one read. A second read follows 2.5s later,
  because iOS hands the screen back before the Shortcut's POST has crossed the network and
  one read would show the old number — which is the "I assume it failed" the button exists
  to prevent.
- It goes through `GET /api/health/steps`, a SIBLING path and not a GET on `/api/health`:
  that path's exemption from the session gate is an exact-path match, so a GET hung off it
  would serve the health record to anyone who asked. It is also tiny, where re-reading
  Today would re-read the Google Calendar on every glance at the screen.
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
- Stack: Next.js 16 (Turbopack) + React 19 + Tailwind v4 + libSQL.

### THE LIVE DEPLOYMENT IS VERCEL + TURSO — `taxiivation-dashboard.vercel.app`

Read this before touching anything deploy-shaped, because the repo still LOOKS like a Fly
app and it is not one. `fly.toml`, `Dockerfile` and `docs/deploy.md` describe a Fly + Turso
deploy that was written first and never became the live one, and this line used to say the
deploy was "deferred". None of them mention Vercel. There is no `vercel.json` and no
`.vercel/` in the tree either, so nothing in the repo pointed at the real host.

That cost real time on 2026-08-14: Connect on the live site sent the owner's browser to
localhost, and the obvious suspect was `fly.toml`'s `GOOGLE_REDIRECT_URI` — a file Vercel
never reads. The variable was simply unset on Vercel, and `google.ts` fell back to a
hardcoded localhost default. **Deployment config is not documentation; if the tree and the
truth disagree, believe neither until you have checked the host.**

- **Local dev is a FILE database** (`DATABASE_URL=file:./data/dashboard.db`); production is
  **Turso**. They are two different databases and they do not sync. The gym backlog that
  `scripts/import-strength.mjs` imported lives in Turso — that importer refuses to
  `--commit` against a `file:` URL for exactly this reason. A local screen showing four
  sessions is not evidence that anything was lost.
- **`scripts/db-copy.mjs` WIPES ITS TARGET.** It is a one-way mirror of the local file onto
  Turso, not a merge. Running it from a dev box replaces production with local data. Do not
  run it to "sync"; there is no sync.
- **Env vars must be set in the VERCEL project**, not in `fly.toml` and not in
  `.env.local` — neither is read by the live app.
- SQLite `GLOB` uses `?`/`*` wildcards, not `_` — date CHECKs use `GLOB '????-??-??'`.
- **Tests: `npm test`.** `node --test` on Node 24, which strips TypeScript natively — zero
  dependencies. `src/lib/rings.ts`, `goals.ts` and `dates.ts` are import-free on purpose so
  they run under it; keep them that way. `PillarKey` lives in `rings.ts` and is re-exported
  from `queries.ts` for the same reason.
- **libSQL returns aggregates as BigInt.** `bigint / number` throws. Every aggregate goes
  through `num()` at the query boundary.
- The rolling window is `addDays(anchor, -13)` .. anchor, `BETWEEN` both ends. The anchor
  comes from the date being VIEWED, never a server-side `todayISO()`.

<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->
