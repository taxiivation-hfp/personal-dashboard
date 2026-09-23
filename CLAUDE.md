# Personal Dashboard — working notes for Claude

## What this app is

A private, single-user daily guide organised around **adherence, not accomplishment**.

The question it answers is **"did I do what I said I'd do?"** — never "how much did I
get done?" The problem being solved is **drift and self-justification**, not
productivity.

**Output and results are NOT tracked or scored, anywhere, with no exception.** If you find
yourself adding something that measures how much was produced or how good it was, you have
misunderstood the product. Working a block badly and working it brilliantly are the same
event here: the block was adhered to.

**THE PRODUCTIVITY SCORE IS GONE — the owner's ruling, 2026-09-18: "quantifying productivity
is stupid."** No points are printed anywhere, and there is no quarantined exception left to
read as permission. What survived is the honest half of the question the score was a proxy
for — **where did the week's hours go** — answered in hours and minutes on `/stats`, which is
a duration you actually spent rather than a number the app invented. See "Hours worked" below.

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
- Reasons are stored, and their reader is the owner: they surface in the written log.

### NOT EVERY CALENDAR EVENT IS A BLOCK — and ONE function decides

`isBlockEvent` in `src/lib/adherence.ts`, asked by `buildBlocks`, which is where every
reader of blocks gets them: the day's list, adherence on Today and on the tracker, hours
worked, the drill-downs. Two kinds of event are not blocks:

- **An ALL-DAY entry.** It is a condition of the day, not eight hours of work you failed to
  do. Excluded from both sides of the block share.
- **A GRAPHITE event — Google's `colorId "8"` (`GRAPHITE_COLOR_ID`) — the owner's ruling,
  2026-09-18.** Graphite used to mean a social event and fed the Social ring. Social is gone,
  socialising "comes naturally in between blocks", so an event in that colour is not
  something to mark, not blocked hours in adherence, and not hours worked. **KNOWN AND
  ACCEPTED: every past day re-reads without them** — a fortnight of Church and nights out has
  left the denominator, so those days read differently than they did. That is the same silent
  history rewrite as retuning the hours table, and it was accepted with the rule.

  The Events API reports only the eleven legacy colour ids, so the Birch beside Graphite in
  the calendar UI's wider palette arrives as `8` too. Measured on the owner's calendar, and
  accepted with the rule.

One place decides this because two would eventually disagree about a Tuesday, with no error
and no failing test — the same failure `worked.ts` exists to prevent.

#### A DRIFT CAN BE PARTIAL — the worked fraction

Still three states, and the tallies still count by state: a partial drift is a **drift** on
the record. What it also carries is `block_marks.worked_fraction`, 0–1 — how much of the
block was actually worked — set on a 5% slider (`WORKED_STEP`).

**It exists because the block share was already a claim about HOURS** and the only fractions
it could express were 0 and 1. An afternoon whose first forty minutes went as planned was
recorded as if nothing had happened, which understates a day that was genuinely half-lived.

**The rule lives in ONE place: `workedFraction()` in `src/lib/worked.ts`** — import-free, and
also the home of the `BlockState` union, which used to be written out verbatim in three
files. Four readers take it: adherence, the hours-by-category maths, the hours drill-down
route, and `dismissalWouldErase` beside it. Four hand-written copies of one state table would
diverge silently — two screens quietly disagreeing about the same 48 minutes, with no error
and no failing test. **Do not inline this rule anywhere.**

- **The fraction is HOURS, and hours count wherever hours are counted** — the adherence ring
  and the hours-by-category chart. It reaches no pillar ring: Health counts sessions, days and
  totals, and Career counts goals, so neither has an hour in it.
- **NULL is not 0.** Null means nobody was asked; 0 means you said none of it. Both are worth
  nothing, so every drift written before the slider is unchanged — and the distinction is
  kept because it is a real difference about what was answered.
- **100% converts the mark to Adhered**, in `engine.markBlock` and not in the client. At the
  top of the slider the arithmetic is already identical, and a chip reading "Drifted" over a
  block worked end to end is the record holding two names for one fact. `/api/blocks` returns
  the **resulting** state; the screen closes its row on that answer rather than predicting it.
- **The slider never gates the mark.** Tap Drifted → saved instantly at 0 → the editor opens.
  One tap is still a complete drift. The honest-logging rule governs a second control exactly
  as it governs the first.
- **The percentage is drawn beside the chip, never inside it** — all three chips must keep
  measuring the same. Its fill is the **accent**, not the drift colour: this is the part you
  *worked*, and it feeds the amber ring, so it wears the ring's hue.
- **Tapping the Drifted chip reopens the editor.** A slider you cannot correct is worse than
  no slider.

#### THE DRIFTED EDITOR IS A POPOVER, not an inline expansion

The owner's ruling, 2026-09-18, replacing the row that grew a panel underneath itself. The
blocks window has a fixed height and nothing in it may scroll at rest (see the dashboard
section), and a row that doubles its own height pushes the rest of the day off the bottom of
the window at exactly the moment you are working down it.

`src/components/DriftPopover.tsx`, mounted once after the list for whichever row is open,
positioned from the row's own `getBoundingClientRect()`: to the right of it, flipped left when
it would overrun, then clamped to the viewport. It re-aims on resize and closes on a scroll of
the owning `.window` — a fixed box aimed at a box that moves has to answer both.

- **Outside click and Escape COMMIT, then close.** A slider left at 40% and dismissed with
  Escape must not lose the 40%. `skip` is the same path with a word on it.
- Not a `<dialog>`: a modal backdrop over a list you are marking as you go is the wrong
  contract. `role="dialog"` and an `aria-label` naming the block instead.
- It prints the block's title, because a popover beside a list must say which row it belongs
  to.

#### EVERY BLOCK ROW HAS A DISMISS CONTROL

The owner's ruling, 2026-09-18 — for invites and anything never meant to be done. It writes
the existing `dismissed` state, which `/api/blocks` and adherence already honour by dropping
the block from **both** sides of the block share. It sits beside `undo`, in the same quiet
treatment, on **every** row, marked or not: an invite you were never going to do is usually an
unmarked one.

**A DISMISSAL NEVER TAKES BACK WORKED TIME** — `engine.markBlock` reads the prior mark and
refuses, returning the state that stands. Dismissing a row that earned hours is the one move
that could make the climbing figure FALL, which is the thing it must never do
(`dismissalWouldErase` in worked.ts holds the arithmetic). So dismissing an adhered row is a
no-op and the row simply does not change. **Do not special-case it and do not print an
error**: `mark()` already trusts the server's resulting state, and a row that does not move is
the honest outcome. Unmarked, skipped and zero-fraction drifts dismiss as before.

**Adherence rate is the hero stat**: today's adherence % is the single largest number on the
screen, drawn as a 240px amber ring with the day's tasks floating around it.

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
must count the one-offs or the tracker and the hero disagree about a day.

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
- **BOTH FLOOR CONSTANTS LIVE IN `rings.ts` NOW** — `STEPS_FLOOR` (7,000) and `CALORIE_FLOOR`
  (2,500). The calorie floor moved there from productivity.ts with the pivot, because rings.ts
  must stay import-free and the Health ring now reads it; `productivity.ts` re-exports it — a
  re-export, never a copy — for the calorie screens that have always imported it from there.
  New code imports both from `rings.ts`. No copied numbers.
- **KNOWN AND ACCEPTED: every past day re-read lower when this landed** (denominator +2,
  mostly unearned back then) — the same silent history rewrite as dropping graphite.
- `habitsDone`/`habitsScheduled` remain the TICK tally. "3 of 5 ticked" must stay a true
  sentence, so the floors are not in it; they reach `pct` and nothing else.

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
  as half-lived. The three-state mark still records what happened. The hero figure stops
  being the place that holds it against you.
- **Nothing can make the figure fall, and no fraction may.** A clamp in `workedFraction`
  is what enforces it: above 1 a block could earn more of the day than it occupies, and
  below 0 *marking* a block would lower the number — the one thing a climbing figure must
  never do. A test pins it. The dismissal guard above is the same rule defended at a
  different door.
- **A day ends wherever it got to.** 60% is not a failure grade; it is sixty points earned.
- Blocks with no duration are excluded from both sides — an unknown span cannot be weighed,
  and counting it as zero hours would make the block unearnable.

## Non-negotiables

Separate from blocks and deliberately simpler: a small plain checklist. **Binary — no
states, no reasons.** The user writes and edits them — rename in place, remove behind the
app's own two-step, both on `/habits`.

**THE WEEKDAY PICKER IS GONE** — the owner's ruling, 2026-08-24. A standing non-negotiable
is an every-day thing; something needed on one specific day is a ONE-OFF (see "Tomorrow,
specifically"), which already carries its own date. `habits.days_mask` and
`habitsForDate`'s mask read both STAY — a habit masked while the picker lived keeps its
days, and the streak walk still skips unscheduled days — but nothing writes the mask any
more and new habits are always every-day (127).

Gym is deliberately **not** one of these. The owner trains "any 4 of 5 weekdays" — a
frequency, which `days_mask` cannot express. On the checklist it would be engineered to
sit unticked once a week, and an item you are designed to fail teaches distrust of the
whole list. Workouts are logged separately, by kind: **Strength / Cardio**, one
row per SESSION — a day can hold two lifts and a run, and each is its own document.

**MISC IS GONE.** What it held was bouldering and calisthenic skills, and Calisthenics is a
skill. Once skills started logging sessions rather than hours the two were the same document
with two places to write it — so it got written in whichever the owner remembered, and both
counts were wrong. One activity, one row. `gym_sessions.kind` still ACCEPTS `'misc'` at the
database level and any surviving row is left alone: nothing writes it and no metric counts
it, so it is inert rather than corrupt. Preserve data; migrate, never drop.

Each kind opens **its own free-text document** — a separate note per session, not one
shared field. Saving IS logging; there is no second "did it" toggle to forget. The text is
deliberately unstructured: a workout log is numbers scribbled between sets, and any form
imposed here is a form to fight on a bad day.

**Calories have a FLOOR at 2500** (`CALORIE_FLOOR`, whose home is `rings.ts`), worth one
fractional item of adherence's habit share and one of the Health ring's five parts. A floor to
reach, never a ceiling to stay under: this is someone training, for whom under-eating is the
failure and there is no upper bound worth drawing. Its box is DASHED until met — "not yet"
rather than "failed", since most of a day is legitimately spent below the line. The calorie
row's STREAK counts a third threshold, `CALORIE_STREAK_FLOOR` (2,000 in streaks.ts) — "did you
log the day", deliberately not "did you eat enough"; see the streaks paragraph below.

**A non-negotiable may carry a DOCUMENT** — Outreach, Read and ASC.ND, today.
`habit_entries.note`, one per day by that table's own UNIQUE constraint, which is the shape
the metrics already count in. What is counted is consistency at the floor, never volume past
it.

**THREE HABITS JOINED ON 2026-08-24/25** — the owner's ask, seeded by the latched
`habits_aug24_v1` block in client.ts: **Calendar** (plain tick), **Vitamins** (plain tick) and
**ASC.ND** (`system_key='ascnd'`) — a DOCUMENT habit on the outreach/reading model: its row
opens `NoteLog`, saving is what ticks, and its notes join the written log as their own kind
(`ascnd` in dayLog.ts, tab labelled "ASC.ND"). All three are ordinary rows otherwise — they
join the habit tally, and they streak like everything else. **Their pillars were re-filed by
the pivot**: ASC.ND is Health, Calendar is Career. See the checklist colours below.

**A DOCUMENT ROW IS ONE CONTROL** — the owner's ruling, 2026-08-21, replacing the
tick-box-plus-side-button pair. Tapping the row opens the logger (`NoteLog`), like every
other logging surface here; the roster of which rows do this is **`DOC_HABITS`, exported from
`src/components/NoteLog.tsx`** — it lives beside the dialog it configures, keyed by
`system_key` so a rename changes nothing. Three rules follow, all deliberate:

- Writing TICKS the day in the same upsert — saving is logging, no second control to
  forget. And **"Log it" over an empty page IS the tick**: the button never gates on
  words, because a day you did it with nothing to say must still cost one honest tap.
- **Unticking lives INSIDE the dialog**, behind the app's own two-step (never a native
  `confirm()`), because the box that used to retract a day is gone. It deletes the row,
  words and all, and says so before it does.
- **Clearing the note still does not untick** — deleting a sentence you no longer like
  must not quietly retract the day. Two different retractions, named apart.

**ASC.ND's placeholder is "What did you do?"** — the owner's own wording, 2026-09-18. The
routine is stretching, skincare and posture: things you DO rather than work on, and the old
verb read as a question about a project.

**READING LOGS PAGES AS WELL AS WORDS.** The reading dialog carries a "Pages read" number
beside the textarea; it lands in `habit_entries.value` next to the note (see
`engine.setHabitNote`'s three-shape `value` contract: undefined leaves it, null clears to
a bare tick, a number sets it — a note edit must never eat a number). KNOWN AND ACCEPTED:
value 1 is ambiguous between "a bare tick" and "one page"; with a ten-page floor that is a
curiosity, not a schema. The row's identity is `system_key='reading'`, stamped by the
latched `system_keys_v2` block in client.ts; the pivot renamed it to **Read** and the key is
why the rename cost nothing. Reading notes join the WRITTEN LOG as their own kind, exactly as
outreach notes do.

The Journal row deliberately has no note of its own — a page IS the document, and a note
about it is a second diary.

**THE CHECKLIST'S TICK COLOUR IS THE HABIT'S PILLAR** — the owner's ruling, 2026-09-18,
replacing "everything unassigned wears the accent". A tick box is the one place a pillar
touches a daily gesture, so it should say which pillar it serves:

| Tone | Rows |
|---|---|
| **Health — Moss** `--color-physical` | ASC.ND, Weight, Vitamins, Steps, Calories |
| **Career — Plum** `--color-portfolio` | Outreach, Calendar |
| **Neutral — warm grey** `--color-neutral` | Journal, Read, Tidy room (pillar NULL) |
| **Accent — amber** | one-off non-negotiables, and only those |

Every row resolves through `habitTone` in Today.tsx — `toneColor(pillar, colors[pillar])`, or
the neutral token when there is no pillar — so the owner's `/colours` choice reaches the
boxes. **Steps and Calories stopped hard-coding `var(--color-physical)`** and take the Health
tone like the rest; `CalorieInput` receives it as a `tone` prop for the same reason. The
one-off branch is separate and stays amber: a one-off belongs to no pillar and is the only row
that is not a standing rule.

**Two renames landed with the pivot**: `Read 10 pages` → **Read**, `One outreach message` →
**Outreach**. Both are one-word row labels on a two-column checklist, and both rows already
say what they count in the dialog they open.

**EVERY CHECKLIST ROW CARRIES ITS OWN STREAK** — the owner's ruling, 2026-08-21. A plain
count of consecutive done days. The walk lives in `src/lib/streaks.ts` (pure, tested): days
the item is not scheduled neither count nor break (a legacy Sundays-only item keeps its run
through the week), and the live today gets GRACE — unticked at 2pm is "not yet", never a
break. Streaks are HIDDEN off today: the days you step back to are precisely the unmarked
ones. **Calories streak on `CALORIE_STREAK_FLOOR` (2,000), deliberately below the 2,500
floor** — the streak asks "did you log the day", not "did you eat enough"; a streak pinned
to the eating floor would give an honest under-day a reason not to be logged. Journal's
streak rides its own habit entries, which page saves already tick.

**THE STREAK WEARS A FLAME** — the owner's ruling, 2026-08-24, revising the earlier
no-flames stance ("disregard all previous MD files that say no glows or shadows", stated
for this feature). One shared component, `StreakFlame.tsx`: a 🔥 beside the count, its
colour a CONTINUOUS hue walk from light yellow at day 1 to purple at day 30 —
`streakHue()` in streaks.ts, the ONE home of that interpolation, test-pinned at both ends
and clamped past them. The pill behind it takes a slight tint and a soft glow in the same
hue (`.streak-flame` in globals.css — a sanctioned, deliberately narrow exception to the
no-shadows rule: streak pills only; nothing you MARK may catch light). What survives the
revision: **a streak of 0 still draws NOTHING** — a row that greets an off week with "0"
scolds — and there is still no "don't break it" copy anywhere.

**STEPS STREAK NOW TOO** — same ruling ("every non-negotiable should be streakable"),
reversing "a streak on a phone battery is not a streak on a person". `DayView.stepsStreak`
walks health_logs against `STEPS_FLOOR` (7,000) — the same floor the row's box ticks on,
so the streak and the tick can never disagree about a day — with today's usual grace. The
phone stays the only writer; a day it never pushed breaks the run like any unearned day.

**There is no app-wide streak flame on Today any more.** It lived in the head of the week
strip's card and went with the card (see the dashboard section). `days logged in a row`
survives as a figure on `/stats`, which is where a figure about a run of days belongs.

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
- **It feeds adherence and NOTHING else** — not the rings, not the streaks.
  `/api/adherence` passes only the STANDING tick count to the maths.

A non-negotiable may take a **number** instead of a tick (`habits.input = 'number'`, with
`habits.unit`). Daily weight uses it. The value lives in `habit_entries.value`, which is
already a REAL, so adherence and the rings need no special case — an entry exists or it
does not. Clearing the field clears the day, exactly like unticking.

## Tasks — one-off, carrying, and deliberately unscored

Separate from non-negotiables and separate again from blocks. A non-negotiable is a standing
weekday rule ("weigh in, every day"); a **task** is a single thing decided for a single day
("book the physio"). Added from `/habits`, dated, defaulting to **tomorrow** — the day you
can still shape, which is the same reason the day title is edited where it is.

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
- **It feeds NOTHING** — not adherence, not the rings, not the streak. The habit share splits
  over non-negotiables SCHEDULED plus the two floors: a fixed denominator known each morning.
  A carrying backlog joining it would make every other item worth less for reasons nothing you
  did today caused — which is exactly the "item you are designed to fail" that keeps the gym
  off the checklist.
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

### THE TASKS FLOAT AROUND THE HERO RING

The owner's ruling, 2026-09-18, replacing the full-width band under the checklist.
`src/components/FloatingTasks.tsx` owns the hero row: the adherence ring and its caption
arrive as `children` and sit in the middle, and the day's tasks are small cards on two rails
either side of it. The band was a rule and a heading spent on a couple of sentences while the
whole area either side of a 240px ring stayed empty.

- **Up to six cards** (`MAX_CARDS`). Past that the sixth slot becomes a `+N more` card opening
  the rest in a `.popover`, so the band's height is the same whether the day holds six tasks
  or twenty. Ticking inside the popover works in place and does not close it — "clear three of
  these" is one gesture, not three.
- **Slots alternate, left first** (even index left, odd right), so the first task lands on the
  side the eye reaches first and a single task never sits alone on the right.
- **THE BAND'S ORDER IS `due` THEN `id`, NOT `tasksFor`'s done-last.** Done-last is right for
  a list you scroll and wrong for six fixed slots: ticking calls `refresh()`, the server hands
  back the same tasks re-sorted, and every card behind the one you ticked shifts a slot — past
  six, the card you just ticked leaves the band and reappears inside the popover while a
  hidden task takes its place. That is the exact hazard the drift popover was written against:
  a list you are marking as you go must not move under you. Cutting the slots on keys that do
  not move when `done` flips makes a tick read as confirmation, in place. Done-last survives
  where it belongs: `/habits`, and the popover's own list, both of which are lists rather than
  slots.
- **No tasks → nothing is drawn** — no rails, no heading, no "nothing due" line. An empty
  frame is furniture claiming a feature is in use; the honest drawing of an empty list is a
  centred ring.
- **The `not scored` label is lost here, deliberately.** The flag exists because a list that
  looks like the scored one and isn't is worse than no list — but these are not a list any
  more, they carry no rule and no heading to hang the word off, and there is nowhere honest to
  put it. It survives on `/habits`, which is where tasks are written and where "does this
  count" is actually asked. Nothing about the contract moved.
- The card wears **ink**, never a pillar hue: a task belongs to no pillar.

## Pillar rings — TWO pillars, sufficiency, never score

**HEALTH and CAREER — the owner's ruling, 2026-09-18, replacing Social / Physical /
Portfolio.** Defined in `src/lib/rings.ts` (import-free, tested) and `src/lib/career.ts`.
Adherence remains the hero; the rings are secondary context in the Recent window.

- **Physical is displayed as HEALTH, Portfolio as CAREER. THE DATABASE KEYS DO NOT CHANGE** —
  they are still `physical` and `portfolio`, because renaming a live key is churn across
  goals, habits, tasks and every stored colour. The names people read come from
  **`PILLAR_NAME` in rings.ts and only from there**; `pillars.name` is kept in step by the
  migration, but nothing prints it — a name that lives in two places is a name that eventually
  says two things.
- **Colours: Health = Moss `#467c6c`, Career = Plum `#7d5a72`.** The live Physical colour was
  Rust `#9a6448`, which sits on top of the amber accent; the migration moves it. `/colours`
  still edits both, from the curated palette only.
- **The rolling window is unchanged**: 14 days ending on the day being VIEWED, both ends
  inclusive.

**SOCIAL IS GONE, AND ITS CODE IS PARKED, NOT DELETED.** Socialising "comes naturally in
between blocks" and is no longer planned or tracked. The `pillars` row `social_capital` STAYS
in the database — goals, habits and tasks reference it — and is filtered out of every listing
by `isPillarKey`, the one gate between a stored string and a `PillarKey`. The Social code (the
`outreach` and `social_events` metrics, the `calendar_social` source, the graphite counting and
event lists in `/api/rings`, `socialBands` and the mid band, `CalEvent.recurring`'s only use)
is parked **verbatim under `archive/social/`** — outside `src`, not compiled, in
`tsconfig.json`'s `exclude` and behind Tailwind's `@source not`, one file per source file with
its original line ranges, under a README saying what it was and why it was parked. **The owner
asked for it to be kept, not deleted.** Do not re-import it, and do not tidy it away.

### A RING IS A SEGMENTED DONUT OF ONE THICKNESS

No outer laps, no mid band, no overdrive drawing — all three went with the three-pillar board.
The circle is split into arcs sized by weight with a small gap between them (`SegmentedRing` in
`PillarRing.tsx`); each arc draws a faint track and a fill of `arcLength × fill`, and the
centre prints the pillar %. One radius, one stroke. Both pillar rings are smaller than the hero
adherence ring.

**The core rule survives intact: a part fills toward a threshold and CAPS.** Eight strength
sessions and twenty fill Strength identically, and a fortnight of 200k steps fills the Steps
arc exactly as much as 98k does. Because you cannot win by overdoing one part, the only ring
that looks good is a well-rounded one. That cap *is* the mechanism, and it is load-bearing in
the arithmetic rather than decorative: `weightedFill` consumes the CAPPED fills, so an uncapped
Strength could otherwise cancel an empty Cardio arc outright.

- Thresholds are the owner's **minimums, not stretch goals**, and live in the registry so
  retuning is a one-line change.
- **`null` is not `0`.** An arc whose SOURCE did not answer is a dashed GHOST and is EXCLUDED
  from the pillar's mean — counted as 0 it would cap the pillar below full forever, which no
  behaviour could fix. Its fact line prints `—`, never "0 of 14", which would be a zero the
  source did not say. A genuine zero is a solid empty arc with a real number beside it.
- **The real number is always printed beside the arc, and it never caps.** `11 of 8` is a true
  sentence. A cap must never hide the truth.
- **A thin ring means neglected, never failed.** No XP, no levels, no points, no ring streaks,
  no fortnight-over-fortnight comparison.

### HEALTH — five parts, `HEALTH_METRICS`

| Part (label) | Weight | Fill | Source |
|---|---|---|---|
| Strength | 40 | strength sessions ÷ 8 | `gym_sessions` kind strength, per SESSION |
| Cardio | 15 | cardio sessions ÷ 2 | `gym_sessions` kind cardio |
| ASC.ND routine | 15 | days ticked ÷ 14 | habit `system_key='ascnd'` |
| Steps | 15 | SUM(steps) ÷ 98,000 | `health_logs` — `STEPS_FLOOR × WINDOW_DAYS`, DERIVED |
| Calories | 15 | SUM(kcal) ÷ 35,000 | `calorie_entries` — `CALORIE_FLOOR × WINDOW_DAYS`, DERIVED |

- Strength and Cardio count **sessions, not days** — two lifts on a Tuesday are two things
  that happened (`perDayCapped: false`). That is the owner's ruling, and the threshold was
  deliberately left at 8 when it landed.
- **STEPS AND CALORIES ARE FORTNIGHT TOTALS — the owner's ruling, both.** One big day covers
  quiet ones; an unlogged day adds 0. That is a real change of meaning from a consistency
  measure, and it is exactly why the DAILY floors stay drawn on the checklist rows and on the
  charts, where consistency is still the question. The fortnight targets are DERIVED as
  `floor × WINDOW_DAYS` rather than written down, so retuning a daily line moves the fortnight
  with it. `perDayCapped: false` on both: de-duplicating by date would throw away every step
  after a day's first row.
- **The cap is per part.** A 40k-step Saturday fills Steps and nothing else, and no amount of
  strength reaches 100 while cardio sits empty. A test pins it.
- The ASC.ND habit is a HEALTH habit — the owner's daily stretching / skincare / posture
  routine. It is counted by `system_key`, so a rename changes nothing.
- **Health, opened** (tap the ring): the five parts as rows, each with an 18px marker ring in
  that arc's own shade — the marker takes the ARC's index, so the legend and the donut can
  never disagree. `Strength 2 of 8`, `Cardio 2 of 2`, `ASC.ND routine 11/14`,
  `Steps 84k of 98k`, `Calories 29k of 35k`. Strength and Cardio open the fortnight's sessions
  and carry a `Log` pill; Steps opens its dialog; the `every session logged →` link sits under
  the list. **No goals section, no skills section.**

### CAREER — goals, paced against their own deadlines

`src/lib/career.ts`, pure (its only imports are `dates.ts` and `rings.ts`, both import-free)
and tested. **Career fills from GOALS and only from goals.** A goal is a project; its subgoals
are shown as **subtasks**. Calendar blocks are not linked to goals, the Basil "project hours"
lap is gone, and skills are not part of Career.

**WHICH GOALS COUNT: status `active`, AND a deadline, AND created on or before the day being
viewed.** Each counted goal is **ONE EQUAL ARC**.

```
expected = clamp((today − created) ÷ (deadline − created), 0, 1)
fill     = min(1, progress ÷ expected)          — and 1 when expected ≤ 0
Career % = the MEAN of the counted arcs
```

`progress` is the existing `goals.ts` rule — the sum of done subgoal weights, derived on read
and never computed here. The edge cases are the rule, not exceptions to it:

- **`expected ≤ 0` → fill 1.** A goal created today has nothing expected of it yet, so it
  cannot be behind. The same holds for a goal whose deadline is on or before its creation day:
  no span to divide, so nothing is expected until that deadline passes.
- **Past the deadline, `expected` is 1**, so the arc shows actual progress. It stays in the
  ring until it is ticked done or dropped. **No red, no "overdue" wording** — a thin arc is
  information, not a verdict.
- **A goal that did not exist yet is not in a past day's ring.** Without that filter the
  created-today rule would also apply to every day before the goal was written down, so
  stepping back a week would show Career filled by work that had not been decided on — a past
  day growing a figure out of something done since, which is the backdating rule this app
  already runs under for tasks. A goal with an unreadable `created_at` is KEPT rather than
  hidden: it is a thing the owner wrote down, and it should not vanish from a ring because its
  stamp is corrupt.
- **Goals are not versioned otherwise.** A past day shows TODAY's progress against the pace
  that day expected. That is stated in `/api/rings` and is the only honest thing available —
  nothing records what a goal's progress was on a Tuesday.
- Arcs sort by soonest deadline, then oldest goal. The mean is summed from the fills rather
  than through the weights, so `1/3 + 1/3 + 1/3` can never read 99.99%.

**NO COUNTED GOALS IS NOT 0%.** `fill` is null and the ring is drawn as an empty DASHED ghost
whose centre reads **"no goals"**. Nothing is being neglected; there is nothing in the ring.
A "0%" there would be the app inventing a failure out of an empty board.

**CAREER IS REBUILT ON THE CLIENT, and that is load-bearing rather than an optimisation.**
Today.tsx runs the same `buildCareerRing` against its own `goals` state, so ticking a subtask
moves the donut that same beat, with no round trip and no window in which the list and the ring
disagree. The `portfolio` entry `/api/rings` returns is ignored on that screen. One function,
two callers, no second opinion.

**Career, opened**: every ACTIVE goal, with or without a deadline — the RING counts only the
dated ones, but a goal with no deadline is still a goal you are working on. Title, the deadline
or `no deadline`, the percentage, a progress bar, tickable subtasks, and a **mark done** pill
(status `done`, which stamps `completed_at` server-side; the goal then leaves the active list,
which is correct and intended). An `edit →` link to `/goals`.

**EVERY GOAL IS A CAREER GOAL.** `GOAL_PILLAR` in engine.ts files every new goal under
`portfolio` — in the engine rather than in a client, so a screen that still sends a pillar
cannot file one anywhere else (a `pillar` field from an older client is IGNORED, not refused,
so an old form does not break). The pillar picker on `/goals` is gone.

### SKILLS — hidden, and every row kept

Skills are not a current focus and must not sit anywhere as an unfilled thing — the owner's
ruling, 2026-09-18. Hidden from the rings, the dashboard, `/colours`, `/sessions` (no skill
chip, no skill rows) and the `/stats` Log (no skill entries). `/skills` REDIRECTS to `/` — a
redirect rather than a deletion, because the address is bookmarkable and removing a route must
never strand a screen.

**All skill data is kept**: every `skills` row, every `skill_time` session and every stored
hue. `queries.ts` still reads them, and `SkillsEditor.tsx` and `SkillLog.tsx` are still on
disk, unimported and compiling. Do not delete them, and do not "finish the job".

## Goals — the record, and the one thing they now feed

Goal progress is the sum of completed subgoal weights (`src/lib/goals.ts`), derived on
read and never stored. `weight = 0` means AUTO: an equal share of what the explicit
overrides leave behind.

**A GOAL MAY BE A COUNT INSTEAD OF A CHECKLIST** — the owner's ruling, 2026-09-20,
OVERRULING the note on `/api/goals`'s POST that `target_count` was deliberately unwired
because "a count of completed items was an output measure this app no longer scores". What
reverses it: a counter is a **compression of a checklist, not a new measure**. "NeetCode,
1 of 150" and 150 subgoals with one ticked are the same claim about the same commitment,
and only one of them fits on a screen. It still rates nothing about HOW anything was done,
which is the line this app actually draws.

- `goals.target_count` (already in the schema, unused since the app was built) and
  `goals.done_count`. **`goalProgress()` in goals.ts is the ONE place** that picks which
  rule applies, so `career.ts`, the timeline card, the tracker and the ring take a 0–1
  number without knowing which kind of goal made it — which is why gaining counted goals
  changed none of them.
- **A COUNT AND SUBGOALS ARE EXCLUSIVE.** Weighing a tally against a checklist would need a
  second rule about what each is worth, and two rules about one number is how two screens
  end up disagreeing about the same goal. A counted goal's extra prose goes in `goals.target`.
- **The tally is set ABSOLUTELY, never as a delta** (`engine.setGoalCount`, clamped 0..target
  server-side). A retried tap or a double-fired pointer must not advance it twice — the same
  reasoning `day_tasks` runs under, where reading a task twice cannot move it twice.
- One control, `GoalCount.tsx`, on `/goals` AND the Career drill-down. The timeline card
  prints `18 of 50` where `next · <subtask>` goes.
- **What must never be built on it: no streak on a count, no per-week chart, no total across
  goals.** The number fills one goal's own arc against its own deadline and reaches nothing
  else. The moment it grows a second reader it has become the volume measure this app
  refuses.

**A GOAL NOW FEEDS THE CAREER RING, and nothing else** — not adherence, not the streak, not
the hours. That is the one connection the pivot made, and it is narrow by construction: what
the ring reads is whether a goal is ON PACE against a date the owner set, never how much was
produced. Goals are never auto-completed at 100%; marking one done is the owner's call.

**A goal carries an optional DEADLINE** (`goals.deadline`, `YYYY-MM-DD`, nullable, carrying
the same `GLOB '????-??-??'` CHECK every other date column has; `engine.ts` validates it
properly). A goal without one lists on `/goals` and under Career, but takes no arc of the ring
until it has one. An empty field CLEARS it back to null.

`goals.completed_at` is stamped by `updateGoal` when the status becomes 'done' and CLEARED
when it leaves — a live goal claiming a completion date is worse than no date at all. It sat
in the schema unwritten for the app's whole life before that, so goals finished earlier are
undated; they still list, and sort last.

**`/stats` HAS NO In flight AND NO Achieved** — the owner's ruling, 2026-09-18, removing both
sections and the task lists beside them. Goals are read and edited where they are worked: in
the Career drill-down, on `/goals`, and on the timeline, where a finished goal now stays on the
line with a tick rather than being listed a third time on a screen you visit to read charts.
**There is no task history anywhere.**

`/goals` is the edit surface the Career drill-down links to: a deadline field on every goal and
on the create form, a quiet `mark done` / `reopen` beside `drop`, and **"subtask"** wording
throughout. A done goal's card keeps rendering with its title muted and its completion date
where the deadline field was.

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
- **A tap on a dot in the adherence tracker**, which is where a hand already reaches to read
  the last week. Eight transparent full-height rects, one per slot, each focusable with an
  Enter/Space handler and an aria-label naming the day and its figure. This is the gesture the
  old week strip's overlay buttons had, and the one thing about that card worth keeping.
- **`?date=` on the front door**, clamped to today and validated. For a reload — the screen
  writes the day back with `replaceState` as you move — and for the log's "open that day".

**The screen never shows a day it cannot write.** The swap is ATOMIC: the whole day arrives
at once and the control you pressed carries the wait. Moving the date line first and letting
the checklist catch up would put one date at the top of the screen and another day's ticks
underneath it, and a tick made in that window is a tick against the wrong list.

**A standing bar says so while you are back there** — `Catching up. Everything marked here
lands on Tuesday 11 August — 1 day back.` on `--color-recorded`, the token this app gives a
past day. Every control below it looks exactly as it does on a live day, which is the point and
also the risk. No warning hue: catching up is the feature working, not a mistake.

**Never past today.** Nothing to log about a day that has not happened.

**THE ADHERENCE TRACKER STAYS ANCHORED TO THE REAL TODAY**, with the viewed day's dot ringed
in ink and its label underlined. A chart that travelled with the screen could only be walked
backwards — forward would be off its right edge — and it would rescale its plot against a
different week's high at every step. Fixed, it is a ruler. (The week strip was fixed for
exactly this reason; the strip is gone, the reason is not.)

Two things stand down on a past day, and both would otherwise write to the wrong place:
**`StepsRefresh`'s button** (the Shortcut pushes to whatever day the SERVER calls today, so
the count on screen would never move) and its **staleness dressing** (dashed-and-ink means
"the phone has stopped pushing", which says nothing true about a Tuesday three weeks gone).
The age still prints.

The three date pickers — workout, food, weight — take the REAL today as their cap rather
than the viewed day. Capping at the screen's day would have made yesterday unreachable from
last Tuesday, which is the control quietly becoming narrower than the sentence beside it.

**`today` is re-read when the app comes back to the front.** It is resolved on the server,
which is the right place to resolve it once — but a value resolved once is wrong after
midnight, and this app lives on a phone home screen. At 00:10 a stale value means no
catching-up bar, a forward arrow disabled against a day that now exists, and a live Steps
button that would write into a row not on screen. Nothing MOVES when it rolls over: the day
you were looking at is still the day you were looking at, it has just stopped being today.

**Today's streak is hidden off today.** `getStreak` counts the run ending on the day it is
asked about, and the days you step back to are precisely the unmarked ones, so it would almost
always read 0. Everything else on the record says which window it means — `adherence to 2 Aug`,
`hours worked, 7 days to 2 Aug` — since figures ending on the viewed day while their labels
claim to mean "now" is the record lying about a fortnight ago.

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
trust. `WeightEntry` PREFILLS the reading for the chosen date and says `editing 3 Aug`,
Save becomes Update, and Delete appears only where there is something to delete. Deleting
asks first, in the app's own two-step — never a native `confirm()`, which in a standalone
PWA is a system sheet dropped on the page. Under the control sit the recent readings, each
one a tap that selects its date, because reaching a bad reading used to mean recognising its
date off the chart's axis and typing it in from memory.

**THE WEIGHT DIALOG'S CHART DRAWS THE OBSERVED RANGE** — the owner's ruling, 2026-08-24,
REVERSING the fixed 0–100kg axis it shipped with. Same 30-day window and same domain
arithmetic as the record page's weight chart, so the two share their Y endpoints and can
never disagree about the same month. The STEPS dialog and the record's Steps card both also
print the fortnight's SUM (`sum` over the last `WINDOW_DAYS`, null — not 0 — when the
phone pushed on none of them): the same figure the Health ring's Steps arc counts, stated as
data.

`/sessions` is the whole gym log — every session ever, newest first, grouped by day, filtered
by kind (**Strength / Cardio only**), deliberately unpaginated. Two lifts on one Tuesday read
as one Tuesday with two entries. It is a COUNT, never a score: no streaks, no personal bests,
no volume totals. It briefly listed skill sessions alongside, which was right while a skill
session was the same object a workout is; **skills are hidden now**, so there is no skill chip,
no skill rows and no `/api/skills/history` fetch, and `?kind=` accepts only the two workout
kinds — an unrecognised value falls through to NO filter rather than to an empty page, because
`?kind=skill` was a real link from the record's old skills figure.

### The first line of a session is its TITLE

`src/lib/sessions.ts`, pure and import-free, shared by every surface that shows a session:
the log dialog's history pane, `/sessions`, and the Health drill-down's fortnight list and its
chips.

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
first. Two sessions, one a ghost, and the Health ring counting both.

**The dialog opens on the SESSION's own date when editing**, and on the screen's when writing
a new one. It tells them apart by whether it was given a workout — which is why `Workout`
carries `date` everywhere now, including from `workoutsOn`.

## THE WRITTEN LOG — the record's second half

`/stats` is two tabs: **Stats** and **Log**, chosen in the masthead with the same chip
idiom as the 30 days / 3 months / a year control beside them. One expansion, two questions —
"what do the numbers say" and "what did I write" — and the window control hides on the Log,
which is a continuous scroll with no window to set.

Everything the owner writes lived on a different screen from everything else they wrote:
journal pages on `/journal`, workouts on `/sessions`, drift reasons nowhere at all.
`src/lib/dayLog.ts` (pure, import-free, tested) merges them by day and `/api/log` pages them.
It is deliberately a READER: it writes nothing, adds no table, and stores no copy — a combined
log with its own copy would be a second record to keep in step, and the two would eventually
disagree about a day.

- **A FILE-EXPLORER GRID, since 2026-08-17** — the owner's ruling, replacing the two-shape
  scroll (journalled-day card / chip row) that spent a screen of height per day. FULL WIDTH
  of the record, never a reading column: a grid is not prose. Every day is a TILE under
  month dividers wearing the archive's chapter names. On a day with a page the page IS the
  tile — the archive's ruled miniature, always at the tile's full width. A page-less day is
  CARD STOCK, deliberately never a blank sheet: a sheet-shaped tile on a day with no page
  would claim a page exists. The date under a tile is its filename — which is how the
  journal's "a page must never be identified by 3px type" rule is answered here: a tile
  chooses a DAY, not a page, and the date is what names a day.
- **ATTACHMENTS ARE TABS, NOT DOTS** — each carries its own TITLE on its kind's colour;
  DRIFT stays unfilled, ink on a hairline over panel, because this app does not colour a plan
  not happening. On a journalled tile they sit FOLDED into the card's right edge as closed
  binder stubs, and a pointer unfolds them OVER the neighbouring cards — sanctioned overlap,
  the owner's ruling. The unfold is not animated (width is layout; this app animates transform
  and opacity only); the title fades in. On card stock they run the tile's width, capped at
  four then `+n`.
- **A KIND'S TAB WEARS ITS PILLAR** — `KIND_PILLAR` in DayLog.tsx: gym and ascnd → Health,
  outreach → Career, and **journal and reading → NEUTRAL** (`--color-neutral`, the same warm
  grey a habit with no pillar takes on the checklist, so a tab and a tick row can never
  disagree about what "no pillar" looks like; white on it measures 4.62:1, clearing the chip
  test). Drift is absent from the map on purpose: it belongs to a calendar block, and its tab
  is unfilled. **There is no `skill` kind** — `LogKind` has not had one since the pivot, and
  every skill session is kept in `skill_time`, untouched.
- **ONE TAP OPENS THE DAY** as the journal-reader SPREAD — the workout dialog's two-pane
  document: the page at reading size in the main pane (typed pages grow past A4; drawings
  shown whole, never cropped — a thumbnail may cover, a reader may not), and "That day's
  logs" beside it, each under its tab with its body unfolded. A page-less day's logs take
  the whole dialog.
- **PAGED BY DAY, never by row.** A row limit would cut a Tuesday in half and the next page
  would open mid-session.
- **A day with nothing written never appears.** An empty fortnight costs one thin month
  rather than fourteen tiles saying you wrote nothing — the same ruling that makes a blank
  day draw nothing on the charts. Only an EMPTY page ends the scroll; a short page is not
  the end.
- **IT STILL OWNS NOTHING — BUT IT OPENS EVERYTHING.** The owner's ruling, 2026-09-03:
  `/journal` is GONE (the route redirects here), and every entry in the day reader opens
  ITS OWN dialog — a page in the journal reader (rewrite, add sheets, delete, leaf), a gym
  session in the workout dialog, a document habit in NoteLog. The one-row-one-writer rule
  survives because those dialogs ARE the writers the entries always had; the log stores no
  copy and invents no second write path. A DRIFT stays read-only — its reason belongs to a
  calendar block, marked where the day is lived. After a write the log re-reads the loaded
  span in place (`DayLog.reloadSpan`) rather than resetting the scroll.
- **The log is URL-addressable**: `/stats?view=log` opens the written half (the journal's
  old front door redirects there), and `&month=YYYY-MM` anchors the scroll at that month's
  end — the timeline's month bubbles land on it. The stats charts stay anchored to today;
  a month is a place in the LOG, not a new stats anchor.
- **Entry order within a day is fixed in ONE place** (`ORDER` in dayLog.ts): **journal, gym,
  outreach, reading, ascnd, drift.** The journal leads because it is the only entry about the
  day AS A WHOLE. Sessions follow in the order the body did them; then the document habits, in
  the checklist's own order (outreach, reading, then ASC.ND, seeded after the others). Drift
  reasons come last because they are the smallest and most incidental: a line explaining why an
  afternoon went elsewhere is a footnote to a day, not its opening. Within a kind, by id —
  insertion order, so two lifts on one Tuesday read in the order they were written. A screen
  sorting these itself would be a second opinion about the same day.

## /stats — the record, and the only place history lives

A route, not a pane, reached from **`StatsLink` under the adherence tracker** in the Recent
window and left by the record's own × (which falls back to `href="/"` when there is no
in-place close to call). Today is where you ACT; this is where you look back, and the split
is deliberate — a screen showing both invites reading the past as a verdict on the present.

`StatsLink` PREVIEWS NOTHING. It drew a fourteen-bar adherence sparkline, on the argument that
showing the fortnight it leads to earned the height a plain link would have cost. The Recent
window answered that argument itself: the tracker card two inches above it is a real adherence
chart with a real average on it, so the sparkline had become a second, smaller, mute drawing of
the same series — and the one that could be misread, having no axis and no figure. It also
stopped fetching, which is the part worth knowing: a link that opened a network request on
every day you stepped to was paying for a picture nobody needed.

**Four figures**: `adherence, last 7 days` · `hours worked, last 7 days` (opens where the
window's hours went) · `Health, past fortnight` (gym sessions in the window, linking to
`/sessions`) · `days logged in a row`. There is no skills figure, and the pillar is named
**Health**, not "physical".

**The fortnight**: TWO rings, Health and Career, drawn with the same `SegmentedRing` the
dashboard uses — including the dashed "no goals" ghost, so the record and the board cannot say
different things about an empty board. **Every metric**: Health's five parts and Career's
counted goals, each with its pillar name, its label, its real fact and a bar at its fill.

Five charts, and the order is the argument: **adherence** first because it is the app's
question, **hours** second, **weight**, **calories** and **steps** last because they are facts
about a body rather than about a plan.

`DayChart` is the one primitive, and the FORM follows what the quantity IS:

| Form | For | Why |
|---|---|---|
| **line** | weight | it persists between readings. On the range observed — pinned to zero it is a flat line saying nothing. Broken at every gap; a run of one is drawn as a dot. |
| **bars** | calories, adherence, steps | accumulates then restarts. From ZERO, and a line would imply Tuesday's intake flowed into Wednesday's. |
| **stacked** | hours | bars with composition, split by where the hours went. |

A stacked segment carries **`minutes`** — renamed from `points` with the score. There is no
second magnitude to carry beside it any more, so the old `minutes` side-channel went with it.
The Hours card passes `format={asTime}`, the chart's one formatting hook, so a tooltip and a
legend read `3h 20m` rather than a bare number.

**A day with no entry draws NOTHING** in all three — not a zero-height bar, not a line
through it. Most days in a 90-day window are blank in an app this new, and drawing them as
zeros would report a catastrophe that never happened. It bites hardest on steps: the source
is a phone that can simply be left on a desk, and a day it never reported is not a day
nobody walked.

`DayChart`'s `marker` — the dotted red floor line, the app's only red — serves **two**
quantities: calories at 2,500 and steps at 7,000. Both already wear a dashed checklist box
and print `/floor` beside their figure, so the line says on the chart what the row already
says. That is the whole permitted set, and the rule that keeps it small is DIRECTION: a
floor is a line you climb to, so a day under it reads "not yet". A ceiling or a goal is a
line you can be found wanting against, and this app draws none.

Adherence is the one series with a real ceiling, so it is scaled to 100 rather than to its
own high: scaling it to itself would make a week of 40s look like a week of 100s.

**Two charts and two figures open their workings**, and only where there is a derivation
worth showing. Hours opens the day's breakdown — the SAME route the hours chart is drawn from,
so the record can never explain an hour differently from the figure above it. Adherence opens
what did and did not add, blocks AND non-negotiables, since adherence is an even split and a
sheet showing only the calendar would explain half a figure while appearing to explain all of
it — in **parts**, never "points": adherence is two 50-part shares, not a score. The hours
FIGURE opens where the window's hours went, summed from the series the chart already holds.
Weight, calories and steps open nothing: behind those days is a single number, and a control
opening an empty sheet is worse than no control.

**The second column is "didn't count", never "failed".** Nothing in this app's arithmetic
subtracts.

**The weight line is CONTINUOUS, and the bridge is drawn differently.** A faint dashed
polyline joins every reading across the gaps, under the solid measured runs. Weight is the
only series that earns even the inference — a body HAS a weight on a morning nobody wrote one
down, where an unlogged day's intake is not a number that quietly existed. Bars stay broken.

**No delta, no target line, no smoothing, no window-over-window comparison** anywhere on this
screen. Every one of those is a judgement about a number this app has no business judging.
**ONE AVERAGE EXISTS IN THE WHOLE APP** — the adherence tracker's — by the owner's explicit
ruling of 2026-09-18, REPLACING the blanket "no average" rule this file used to carry. It is
scoped to that card, to seven days, and to a week you can still act on. **Do not read it as
licence to average a quarter**, which is what a window average on this screen would be.

## The month's chapter

The masthead reads **"The Book of Nero: <name>"**, and the second half is editable in place —
one row per month in `chapters`, keyed `'YYYY-MM'`. A NAME, not a number: "Chapter 8",
"August", "The Thesis Month" are all valid and none is derivable from a date, so deriving one
would mean the app deciding what the eighth month of a life is called. Clearing it DELETES the
row, so "unnamed" has exactly one representation.

The log's month dividers print it **alongside** the month rather than instead of it: a
chapter names a stretch of life, "August 2026" is where it sits in a record you scan by date,
and losing the second to gain the first trades navigation for atmosphere. Edited only on
Today — the archive is what has already been written.

**It feeds nothing**, exactly like the day's title below, and for the same reason.

## The timeline — the year on one canvas, and the floating windows over it

The owner's ask, 2026-09-03. A horizontal roadmap: every month from **July 2025** to a
rolling **12 months ahead**, one circle each on one hairline, opening parked on the
current month. Reached by the **TIMELINE** word in the **Blocks window's head** — its entry
point moved there with the calendar column's deletion; `/?view=timeline` reopens it settled
(replaceState keeps the URL in step, same contract as `?date=`).

**IT IS A PAN-AND-ZOOM CANVAS, NOT A SCROLLING STRIP** — the owner's revision the same
day ("scrolling should let us zoom; it should be like a whole canvas"). One WORLD of
fixed geometry (`src/lib/timeline.ts`: width from the month count, `WORLD_H` 1000, the
line at `LINE_Y` 500) is drawn under one view `{x, y, s}`; the viewport is a window onto
it. **The wheel ZOOMS about the cursor** (a sideways trackpad swipe pans; shift-wheel
pans), **a drag on the ground PANS**, **two fingers PINCH**; − / TODAY / + at the top
right step the zoom and jump home. The maths is pure and test-pinned — `zoomAbout` (the
point under the cursor stays put), `clampView` (the world can be shoved about but never
lost: its box always overlaps the viewport, with slack), `centreOn` — and the range is
`MIN_SCALE` 0.3 to `MAX_SCALE` 2.5. The view lives in a ref and is written straight onto
the world's transform, so a pan re-renders nothing. The wheel listener is a NATIVE
non-passive one: React's `onWheel` is passive and cannot stop the page scrolling under
the canvas. `touch-action: none` on the viewport for the same reason. The extension-
driven browser could not synthesise a wheel event, so the wheel path was verified with a
dispatched `WheelEvent` and the pinch path is reasoned from Pointer Events — **the first
thing to check on the tablet is that two fingers pinch and one finger pans.**

**THE GESTURE.** The three windows are SHOVED DOWN out of sight — they do not collapse or
fade, they fall, gathering speed ("ease in, fast out", the owner's words: the departure
curve, the one move that may accelerate) — and the timeline fades in on the page ground
behind them. A small fixed bar at the foot, "RETURN TO DASHBOARD", reverses it. The state
machine lives in Today.tsx (`tl`: closed → falling → open → prep → rising); the `prep`
beat exists because the way back needs one painted frame with the windows still
translated, or they snap home instead of travelling. Once fallen the row is
`display:none` so 110vh of translated window never extends the page's scroll. (`calEpoch`
went with the calendar column — there is no longer a scrolled column to re-key and
re-centre on landing.)

- **Months and groups are DERIVED** (`src/lib/timeline.ts`, pure, tested): Jul–Nov term,
  Nov–Feb summer break, Feb–Jun term, Jun–Jul winter break, repeating. **Term numbers
  INCREMENT** — Jul 2025 opened Term 3, Feb 2026 was Term 4, Jul 2026 Term 5, two a year
  forever; break names repeat. Adjacent groups SHARE their boundary month's circle, and
  the brackets (up from the start circle, across, down to the end circle) alternate
  above/below the line so two meeting on one circle never collide. Terms up, breaks down.
- **TWO TEXTS ARE STORED on the chapters model** (empty write deletes the row): a month's
  note (`timeline_notes`) and a group's name (`timeline_groups`, keyed by the group's
  CANONICAL start month — `TimelineGroup.key` — so the rolling edge clipping a bracket
  never orphans its name). `/api/timeline`: GET + a `kind`-discriminated POST.
- **THE FLOATING WINDOWS are `timeline_windows`** — the owner's revision, 2026-09-03,
  replacing `timeline_positions` (which placed EVERY in-flight goal whether wanted or
  not; it is kept, never dropped, and read once on boot into the new table). Two kinds
  in one table, added by **+ GOAL** and **+ NOTE** at the top left, each landing at the
  viewport's centre (nudged past anything already there):
  - a **GOAL window** (`kind='goal'`, `goal_id`) — one of the board's own goals, placed
    BY CHOICE. The picker lists active goals not yet on the line. The row stores which
    and where; the card reads title, progress and the next unticked subtask from Today's
    `goals` state, so no second copy of a goal exists anywhere. × forgets only the
    placement — one tap, nothing is lost.

    **A GOAL NOTE CARRIES A TICK BOX** — the owner's ruling, 2026-09-18. Ticking marks the
    goal done (status `done`, `completed_at` stamped); **the note STAYS on the line**,
    showing `✓ done` and the completion date, and unticking returns it to active. A
    finished goal is a thing you want to see on your year, not one the board deletes — which
    is the argument `/stats`'s Achieved list used to make, now made in the one place a year is
    actually looked at. The tick cannot start a drag: `cardDown` already bails on
    `a, button, input, textarea`. **Do not touch the pan/zoom maths.**
  - a **TEXT window** (`kind='text'`, `text`, `color`) — a few of the owner's words
    (`WINDOW_TEXT_MAX` 500: a sticky, not a page) with a tint. **Tap opens the editor**
    (a tap is a release within `TAP_SLOP`; further is a drag); the draft commits when the
    editor CLOSES — outside tap, Escape, or unmount — never on blur alone, because a
    focused element removed from the DOM does not reliably blur. **The tint is from
    `WINDOW_TINTS`, a CURATED set** — the pillar palette mixed 72% to white, keyed by
    name so a hex retune moves every note, refused in the engine otherwise (the /colours
    rule: no free hex picker). **Everything printed on a tint is INK**: muted grey fails
    4.5:1 on any tint dark enough to read as a colour, so the editor's controls are ink
    and the swatches carry no words. Removing asks first, in the app's own two-step,
    because the words go with it; an empty window goes on one tap.
  - **Positions are WORLD pixels** from a fixed origin at Jul 2025 and the world's top,
    so nothing re-anchors as months roll in. Drag deltas are divided by the scale. The
    write fires ONCE, on release. `/api/timeline/windows`: POST adds, PATCH moves /
    rewrites / recolours (absent field = leave it; `color: null` = paper), DELETE
    removes; every answer is the whole store.
- **The month's circle and name open that month's LOG** (`/stats?view=log&month=`); the
  note under them edits in place. Two targets, two verbs, deliberately separate elements.
- **Escape inside any editor on the canvas stops propagating**, or the timeline's own
  Escape (RETURN TO DASHBOARD, a window listener in Today.tsx) would fire on the same key.
- **IT FEEDS NOTHING** — no figure on it enters adherence, the rings or the streak. It is a
  place to look at the year. Ticking a goal there is not an exception: the tick writes the
  GOAL's status, and the Career ring reads the goal, not the line.

**THE HORIZON IS 24 MONTHS, not 12** — raised 2026-09-20 when the career roadmap landed. Its
PR deadlines run to the ACS skills assessment in Jul 2028, and a month note is keyed by a
month, so a horizon at Sep 2027 would have left the last and highest-stakes year of the plan
as rows pointing at circles the canvas never drew. The timeline tests are written against
`MONTHS_AHEAD` rather than the month it currently lands on, so the dial can be turned again.

### THE TWO ROADMAPS — `roadmap.md` and `healthroadmap.md`

Seeded by `scripts/seed-roadmap.mjs` (dry run by default, `--commit` to write, idempotent by
inspection and never overwriting). The owner's ruling, 2026-09-20, is the SPLIT:

- **CAREER → TWO goals and eight sticky notes** — the owner's ruling, 2026-09-23, revising
  the ten goals the first seeding made. What separates them is whether the thing has a
  **finish line a pace can be measured against**. SQL is 50 problems by 30 September and
  Algorithms is 150 by 31 January: a count, a date, and an answer to "am I on track". Both
  are COUNTED goals (18/50, 1/150) and both take an arc.

  The other eight are standing practices and open-ended programmes — *"DDIA, a chapter a
  week, forever"*, *"meetups, weekly, ongoing"*, *"many small builds, you pick what"*.
  Giving those a deadline invented a finish line the roadmap never claimed, and each then
  took an equal arc and diluted the two that could actually be behind. They are TEXT WINDOWS
  now, on **Plum** (Career's hue to paper, as the health tiers are Moss), **above the line**
  where their goal cards were, in roadmap order from the month being lived.

  **Their goals are DROPPED, never deleted** (`RETIRED_GOALS` in the seed script, listed by
  name so it can only touch the eight rows it is pointed at). `listGoals` already filters
  `dropped`, so they leave every screen while the row and all 49 subtasks stay on the record.
  Their goal cards on the line ARE deleted: a card pointing at a dropped goal renders as
  nothing, which is a dead row rather than a card.

  **The career band is 200 characters per note, and that is measured, not styled.** On the
  timeline's landing view world y maps to screen y − 212; the masthead's bottom is at screen
  74 and the line is at world 500, so a card must start below world 286 and end above 500.
  A text window is almost exactly as many pixels tall as it has characters at `CARD_W`, so
  200 characters is a ~200px card in a ~204px band. Lengthen one and it sits under the
  masthead on the first screen the owner sees.
- **HEALTH → the timeline, and ONLY the timeline.** Health's ring is five fixed parts with no
  goals in it and that does not change. The tiers are a sequence GATED BY EACH OTHER rather
  than by a calendar, so they are free-floating text windows (one Moss tint, below the line,
  from the month being lived and running right) and carry no dates — pinning them to months
  would invent a schedule the document deliberately refuses to give.
- **The deadline table is MONTH NOTES**, not goals: dates the owner does not control, with no
  subtasks. A missed 485 lodgement is a visa problem, not a thin arc.
- Credentials for the live seed live in **`.env.seed`**, which `next dev` does not read and
  which is named explicitly in `.gitignore` (it matches none of the `.env*` patterns there).

## The day's title

One line naming what you INTEND the day to be, set in advance and rewriteable whenever. It
sits under the date on the Today window's header card, on whichever day the screen is standing
on. (It used to also be named inline for the next three days on the week strip; that card is
gone, and with it the only surface that named a day you were not looking at.)

**It is an intention, not a record, and it is connected to nothing.** It feeds no rate, no
ring and no streak. That isolation is the whole point: the moment naming a day "thesis push"
becomes something you can succeed or fail at, it stops being a plan and turns into one more
verdict. Rewriting one is normal, not revisionism.

## Hours worked — where the week went, and it is NOT a score

`src/lib/productivity.ts` — the file keeps its name because `/api/productivity` and the
drill-down import it; what it measures is hours. **THE SCORE IS GONE**, the owner's ruling,
2026-09-18. No rate per hour, no flat figure per gym session, no points per non-negotiable, no
total. Every printed number here is a DURATION.

What survives is the question the score was a proxy for, in the owner's words: **high
adherence doesn't mean a productive day if you didn't schedule a productive day.** So the
record still answers where the hours went, in four categories.

- **It feeds NOTHING** — not adherence, not the rings, not the streak. It never reaches
  `DayView`, and that quarantine is enforced by data flow rather than by discipline.
- **WHAT COUNTS AS AN HOUR WORKED is decided here and nowhere else** (`workedMinutes`): a
  block in one of the four categories below, scaled by `workedFraction` — adhered is all of
  it, a partial drift its worked share, unmarked / skipped / dismissed nothing — with a usable,
  non-negative duration. Graphite never gets this far: it is dropped when blocks are built.
  Grape (gym) is simply not a category — training is logged as sessions, and an hour under a
  bar is not an hour of work.
- **FOUR CATEGORIES, and the split exists to answer "where did the week go".** The point is to
  see whether an hour went to the portfolio, to uni, or to the till.

  | Category | Colour |
  |---|---|
  | **Work Projects** | Basil `10` — the work nobody scheduled and nobody is paying for |
  | **Work Uni** | Banana `5` — their own study in their own time |
  | **Work Part Time** | Lavender `1` **and** Tomato `11` — the hours sold for money |
  | **Uni** | the calendar's DEFAULT colour — the timetable |

  Anything NOT listed is not an hour worked, and that is deliberate: an unrecognised colour
  must never silently join a category, because the failure would be invisible — a week would
  simply read longer than it was with nothing on screen to say why.
- **ONE CATEGORY MAY OWN TWO COLOURS, and everything merges by LABEL, not by colour.** Work
  Part Time holds Lavender and Tomato because the calendar genuinely holds both, and
  re-colouring a year of history is a worse trade than a two-row table. A category shows itself
  in its CANONICAL colour — the first id listed for it — not necessarily any one event's.
- **Minutes are accumulated exactly per category and rounded ONCE each.** A 50-minute block at
  35% is 17.5, and rounding per block would let the slabs drift from what they sum to. The
  day's total is then the sum of those rounded slabs, so **a stack can never disagree with the
  figure it explains**.
- **CHANGING THIS TABLE REWRITES HISTORY, silently.** Hours are recomputed from the live
  calendar on every read, so adding a colour makes every past adhered block of that colour
  start counting, and removing one makes them stop. There is no stored figure to migrate and
  no warning on screen. Retune deliberately.
- **The day's drill-down** (`ProductivityLog`, fed by `/api/productivity`) prints the day's
  total in hours and minutes, one row per category with its swatch, and **"didn't count"** —
  the half that earns the screen. Everything above it is already visible on the bar; this is
  not. A day full of scheduled hours can come to nothing — an unmarked block counts nothing,
  skipped and drifted count nothing, and a colour absent from the table counts nothing — and
  every one of those is invisible in a stack. It is stated without scolding: an unmarked block
  is information about the log, not a verdict.
- The slab that is not calendar time is ACHROMATIC (`SLAB_NEUTRAL` in `eventColor.ts`). A hue
  there would have to mean something, and there is no calendar colour behind it to mean it.
- **No week-over-week comparison, no best-week marker, no target line, no delta.** It is
  graphite on paper: a record, not a scoreboard. If this ever acquires a threshold, a
  milestone or a streak, the pivot has been undone.

## The coach — REMOVED

There is no coach. `src/lib/coach/`, `/api/coach`, `/api/coach/note`, `CoachNote.tsx` and the
`coach_messages` table are all deleted, by the owner's ruling. `ANTHROPIC_API_KEY`,
`COACH_MODEL` and `COACH_EFFORT` are dead config.

Comments elsewhere still say a thing is "quarantined from the coach" or "stored so the coach
can spot patterns". Those stay true as history and as the REASON a boundary exists — hours are
fenced off from `DayView` by data flow, and that fence is worth keeping whatever reads it next.
**Drift reasons are kept**: their reader is now the owner, and they surface in the written log.

## The dashboard — three windows, and nothing scrolls at rest

Layout D, "Today vs recent" — the owner's chosen mockup, 2026-09-18. Desktop is ≥ `64rem`,
targeted at the owner's Chrome window, about **1858 × 960 CSS px**. **AT REST NOTHING
SCROLLS** — not the page, not a window. Things you OPEN (an expanded pillar, a popover, a
dialog) may scroll inside themselves, and the opened pillar is the only thing in the app
allowed to scroll at rest-plus-one-tap. Full width: there is no `max-w-*` cap on the masthead
or the content.

Three windows, left to right, separated by HUE and not by lightness:

| # | `data-panel` | Surface | `--panel-grow` | `--panel-min` |
|---|---|---|---|---|
| 1 | `blocks` | `--color-surface-2` (lilac) | `1` | `15rem` |
| 2 | `today` | `--color-surface-1` (warm) | `1.7` | `26rem` |
| 3 | `pillars` | `--color-surface-3` (gold) | `1.25` | `17rem` |

`order-1 / order-2 / order-3` in that same order. **Source order stays today → blocks →
pillars**, so the phone's document leads with the day's work.

### BLOCKS (replacing the Calendar window)

Section head **Today's blocks** (on a past day, `Blocks on Thu 6 Aug`) with the **TIMELINE**
button on its right — a word tracked out, not a chip, because it is a place rather than an
action.

`BlockList` keeps its **THREE-LINE rows** — time margin, serif title, state line, Adhered /
Drifted / Skipped chips. **The owner rejected one-line rows**; do not shorten an unmarked row.
Every row carries `undo` and `dismiss` in the same quiet treatment, on the same line.

**THE OVERFLOW RULE — and it replaces "a full day costs scroll".** The 2026-09-03 ruling that
the calendar column list EVERY block, scrolling if it had to, was a ruling about a column that
could scroll. This window cannot. So when a day's rows would not fit, rows that are already
MARKED collapse to ONE line — time · title · state chip, the drifted chip still a button that
opens the popover — while **UNMARKED ROWS ALWAYS STAY FULL**, because they carry the three
action chips and shortening them would make marking cost more, which the honest-logging rule
forbids. Nothing is hidden and there is no "+n more": the truth the old ruling protected is
intact, and what gives is height on rows whose work is already done. BlockList measures this
itself against its own `.window` through a `ResizeObserver` — nothing passes it a budget — and
bails out below `lg`, where the page scrolls anyway, and on a zero-height measurement, which is
the phone's second, hidden instance.

**DELETED with this window**: `CalendarColumn` (the nine-day view — past and upcoming days are
no longer drawn anywhere), the `NextUp` card, `calEpoch`, and the `center=` adherence fetch.
Calendar not connected: the existing connect prompt, trimmed to `Nothing on the calendar
today.` / `Nothing on the calendar on Thursday 6 August.` — the sentence under it explained how
the app works, and TEXT IS DATA.

### TODAY

- The header card: the date line with ‹ ›, and the day's title editable in place.
- **The hero adherence ring, 240px**, a 52px numeral, and one caption line:
  `3.5h of 6h blocked · 6 of 10 ticked`, with `N to mark` beneath when anything is unmarked.
  It stays the largest ring on the screen.
- **The day's tasks float around it** — see "The tasks float around the hero ring".
- **The checklist** below, two columns across the window, per-row streak flames as before.
- The catching-up bar on a past day, which costs the hero band one step of its gap.
- **REMOVED: the "seven days to today" card** — the per-day percentages, the 3px adherence
  bars, the productivity stacks, the weekday letters, the legend and the app-wide streak flame.
  It said four things at once, one of which (the score) the owner has since deleted outright,
  and its adherence half was seven separate bars the eye had to join up itself. Its one good
  gesture — tap a column to go to that day — survives on the tracker's dots.

### RECENT

- **Top: the HEALTH and CAREER rings side by side** (200px, stroke 12), each name centred
  under its ring and its part list under the name — Health's five parts, or one line per
  counted goal for Career (the title in serif, then `60% · due 30 Sep`). **No caption line
  anywhere**: `pillarCaption` is gone with the three-pillar board.
- **Middle: the ADHERENCE TRACKER.**
- **Foot: a plain `The record →` link.**
- **Tapping a ring opens that pillar INSIDE this window.** The other ring, the tracker and the
  record link simply unmount while it is open; × returns. The chosen ring travels on the
  existing FLIP (measure before, measure after, release a transform) and the body arrives on
  `.detail-enter` with its stagger. No ghosts and no push — that machinery went with the third
  pillar, and so did `.pillar-enter` / `.pillar-ghost`.

### THE ADHERENCE TRACKER

`src/components/AdherenceTracker.tsx`. A line chart with the area filled under it, for the
**7 days BEFORE today**, always anchored to the REAL today. It says ONE thing: what the last
week looked like.

- **TODAY IS DRAWN APART** — a HOLLOW dot joined by a DASHED segment. On the line, **not**
  under the area, and **not in the average**. It is a day in progress; the figure only climbs,
  so averaging a morning in with six finished days would drag the week down for no reason
  other than the hour.
- **THE AVERAGE is the mean of the seven past days, every zero counted**, printed 28px serif
  in `--color-accent-deep` — one step darker than the area it sits on, because a figure printed
  over a tint of its own colour has to be darker than that tint to read. Label: `average`. A
  week with two days off IS a week with two days off, and dropping them would make the figure a
  story about which days you looked at.
- **Y IS FIXED 0–100**, never scaled to the week's high.
- **The frame is drawn before the days land**, so the card does not change height under the
  tracker: this column has no scroll to give, and a late reflow would push the record link off
  the bottom of the window. Fewer than 8 days renders the frame and `—`.
- X labels: weekday narrow letters, then the word **`today`**. The viewed day's label is
  underlined and its dot takes a 1.5px ink ring.
- **Tapping a day switches the dashboard to that day** (`goToDay`, the atomic swap and the
  catching-up bar).
- **HOVERING A DAY READS THAT DAY** — the owner's ruling, 2026-09-23, the one amendment to
  the rule below. It is NOT a tooltip and must not become one: no floating surface, no
  shadow, nothing drawn over the chart. The card already HAS a figure slot with a label
  above it, so pointing at a column simply re-addresses that slot — the label becomes the
  date and the numeral becomes that day's percentage, in **INK** rather than the average's
  amber, so the two readings can never be mistaken for each other. Leaving returns it to the
  average, and the pointed-at dot grows rather than changing colour. **Focus does the same
  as hover**: the columns are already focusable for the tap, and a keyboard should not get a
  lesser chart.
- **NOTHING ELSE.** No gridline numbers, no axis ticks, no productivity, no legend, no
  streak flame, no target line, no comparison.

### Phone (< 64rem)

**TWO panes**, `PhoneTab = "today" | "pillars"`, opening on Today:

- **Today** — the date card, the hero ring with its floating tasks, **the blocks list**, then
  the checklist.
- **Pillars** — the two rings, the tracker, the record link.

**There is no calendar pane.** It went with the column: the Today pane carries the day's blocks
above its checklist, which is where a hand marking them already is, so a pane of its own would
be a second place to reach for the same list. The BLOCKS window is `hidden lg:flex`, and its
content renders a SECOND time inside Today's pane under `lg:hidden` — two `BlockList` instances
mount, only one is ever visible, both read the same `data.blocks` and call the same `refresh`.

Tab state is component state rather than a route, so a reload returns you to Today rather than
wherever you wandered. **Stats is deliberately not a pane**: it is a route, and a swipe that
navigated the browser would be a gesture you cannot undo with the same gesture.

## Visual language

Light beige, premium, clean.

**TEXT IS DATA — the owner's ruling, 2026-08-24.** The app shows the data and the
controls that input it, and explains itself in the CODE, not on the screen. The explainer
copy that used to sit under charts, figures and lists is REMOVED, app-wide. What stays on
screen: labels, units, counts, dates, window scopes ("last 30 days"), button captions,
error/confirm messages, and the one honesty flag ("not scored" beside tasks on `/habits`).
When adding a surface, do not add a sentence describing it — put the reasoning in a comment
where the next reader of the code finds it. The removed arguments all still hold; they simply
live in the modules that implement them.

- Warm beige page background, off-white cards, **muted amber as the single accent**.
- **Pillar hues are owner-editable at `/colours`, from a CURATED palette only.** Every
  value is checked against the beige page, so no choice can make the app unreadable, and
  `engine.setPillarColor` refuses anything outside it. The accent, the ink, the surfaces
  and the three block states are NOT editable — one accent is what keeps the page quiet,
  and the block states deliberately avoid a severity ramp. Do not add a free hex picker.
  `/colours` lists exactly two pillars, Health and Career, and no skills section.
- **Three windows, separated by HUE and not by lightness.** Blocks / Today / Recent sit on
  `--color-surface-2` (cool paper with a lilac cast), `-1` (warm near-white) and `-3` (gold).
  Lightness was tried first and failed: contrast ratio measures luminance only, so three tones
  a point apart in L measured 1.03–1.07:1 against each other and read as one surface.
  Separating on hue at nearly equal lightness is visible and costs no contrast. The ramp is
  built UPWARD from `--color-bg`; darkening the page instead drops `--color-muted` to 4.10:1
  and `skipped` to 3.97:1, both failures.
- Generous whitespace. One clear visual hierarchy. Restrained colour.
- Big, clean number treatment for the adherence stat. `.stat-hero` already carries serif,
  weight 600 and tabular figures — never add `font-serif` or `tabular-nums` beside it. Use it
  for every number that is a FIGURE rather than a row value: the pillar %, the tracker average,
  a sheet's total.
- **There is no bottom tab bar.** Removed by the owner's ruling — the panes are reached by
  tapping the window you want, and swiping, which is what was actually used. `PhoneSwipe`
  stays. Removing a navigation control must never strand a screen: `/stats` is reached from
  `StatsLink` and left by the record's own ×, which falls back to `href="/"`.
- **Two font weights only** — 400 and 600. No 500, no `font-medium`. A third weight is a
  bug, not a choice.
- **FIVE type steps, documented in `globals.css`**, named by role rather than by value —
  `text-body`, never `text-15`: **micro 12 / small 14 / body 16 / heading 28 / hero 52**, in
  rem so a reader's browser setting still counts. This replaced an eight-step scale whose
  middle was a lie: 12/13/14/15 carried 98 of 110 usages at ratios of 1.07–1.08, which is four
  ways of saying the same thing rather than a hierarchy, while the documented 11 and 16 steps
  were used six times between them. Five steps at 1.14–1.17 through the text range is the
  product band, and the two display steps stand well clear of it. If something needs to stand
  out, use weight or space, not a sixth size.
- **Every colour is measured, not eyeballed.** Body text ≥4.5:1, strokes and large text
  ≥3:1, and any hue used as a filled chip must also clear 4.5:1 with white on top. That
  last one is what caught `--color-physical` at 4.45, and Moss at 4.45 before it was darkened.
- **The tokens the pivot moved**, all in `@theme`:
  - `--color-physical: #467c6c` — **HEALTH**, Moss. 4.02 on bg, 4.68 with white.
  - `--color-portfolio: #7d5a72` — **CAREER**, Plum, was Iris `#67609b`. 5.09 on bg, 5.93
    with white. `TONE_HEX.portfolio` in `PillarRing.tsx` MUST move with it, and says so.
  - `--color-neutral: #7b746a` — a non-negotiable with NO pillar (Journal, Read, Tidy room),
    and the written log's journal/reading tabs. Deliberately the SAME VALUE as
    `--color-drifted` rather than a ninth invented grey: that grey is already certified both
    ways, which is what a tick box needs (a filled box with a WHITE tick, so it must pass the
    4.5:1 chip test as well as the 3:1 mark floor). **Two names for one value, kept apart**
    because one is a BLOCK STATE and the other is the absence of a pillar; renaming either must
    not silently move the other.
  - `--color-accent-deep: #7a5322` — the tracker's average numeral, and nothing else. NOT a
    second accent: it is `--color-accent` one step down in lightness, the same move
    `segmentShade` makes on a pillar hue. 6.47:1 on the `.record-card` ground it is actually
    printed on, which is the pair that had to be measured — not the gold window behind the card.
  - `--color-social` is **DELETED**. Its feature is parked; nothing reads it.
- **`.popover`** — the app's third floating surface after the dialog and the timeline's cards,
  used by the drift editor and the `+N more` task list. **NO SHADOW**: the only light this app
  ships is the window bevel, the ring bloom and the streak pill's glow, and a popover is not
  worth a fourth exception. What separates it from whatever it overlaps is an OPAQUE ground
  plus the window's own three-step bevel and a 2px halo in the page colour — a cut-out rather
  than a lift. It reads as "in front" because it interrupts what is behind it, which is the
  honest cue and costs no new colour. Positioning is the caller's: the class sets no top/left.
- **`.today-mark` is KEPT although nothing uses it.** Its only consumer was the calendar
  column. It is the app's one gradient, and re-deriving the mask, the stops and the measured
  ratios would cost more than the twenty lines. `.motion-spark`, `.pillar-enter` and
  `.pillar-ghost` were deleted with their consumers, which is the ordinary rule; the gradient
  is the stated exception, and its comment says so.
- Motion minimal and functional, and it runs on tokens: `--ease-out`, `--dur-press` …
  `--dur-data`, all capped at 280ms. **There is deliberately no ease-in token** — it
  delays the first moment, which is exactly when the eye is watching. The timeline's fall is
  the one sanctioned departure curve, written inline for that one gesture.
- Animate `transform` and `opacity` only. Bars use `scaleX`, never `width`.
- `themeColor` in `layout.tsx` must track **the topmost painted surface** — now
  `--color-bar`, the masthead band — or the iPhone status bar contradicts the app.
- **Four chart sites deliberately keep `var(--color-physical)`**: `StepsLog`, `WeightLog`,
  `CalorieLog` and `StepsChart`. These are charts of a **body**, not a pillar tick, and the
  token *is* Health's default. The pivot moved the checklist BOXES, which is what the ruling
  names, and not these. Each site carries a one-line comment saying so; do not "finish the
  job".

## In scope

- Journal: a page is either **handwriting — a SCROLL of ruled A4 sheets, each saved as an
  image, written with a STYLUS ONLY (a finger scrolls)** — or **typed text** on one ruled
  **A4 portrait (1:1.414)** sheet. See "The handwritten page is a scroll of sheets" below.
  `kind` is the discriminator everywhere — a text entry stores `image = ''`, so never test
  emptiness to tell them apart. No transcription in either direction, no theme extraction,
  no vision, **no PDF**. Deleting a page asks first.
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
- **A handwritten page reopens with its ink UNDER THE PEN** — every sheet of it, loaded
  as the canvas's base (`base={{ id, sheets, rev }}`, see the scroll section below). Only
  flat PNGs are ever stored, so there are no strokes to pop: Undo and Clear take back what
  you add NOW. The reason lives in `JournalCanvas`'s header comment and not on the screen
  (TEXT IS DATA) — the status line says only "Pen writes · finger scrolls". Neither they
  nor Save act while a stroke is still down: the live stroke is already in the sitting
  list, and popping or flattening it mid-move would leave ink on screen that is in no
  list. A base sheet is drawn FITTED, never stretched — pages saved before the A4
  rule are whatever shape the dialog happened to be, and filling the canvas with one would
  squash the owner's own hand and then flatten the squash in permanently on the next save.
- **`/journal` IS GONE — the archive folded into the written log**, the owner's ruling,
  2026-09-03. The route redirects to `/stats?view=log`, JournalArchive.tsx is deleted, and
  the log's day reader now opens `JournalReader` (which fetches the whole archive itself
  when handed no list, so leafing still walks every page). Two shelves for one set of
  pages meant two places to look. The chooser's "past pages" link on Today points at the
  log now.
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

**The reading sheet GROWS**; the TYPED writing sheet and the thumbnail are fixed A4 and clip,
because that is what running out of paper looks like. A fixed reader with an inner scrollbar
would have slid the words across their own rules. **The HANDWRITING surface grows too, but
by whole sheets** — one A4 canvas per sheet, appended as the ink reaches down (see the scroll
section below); the typed sheet is unchanged. `--paper` is a real physical colour and not a
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
the log's tiles and the day's chooser both do. A page must never be identified by 3px type.

**Saving a drawing is gated on the saved page having arrived — EVERY sheet of it.** A canvas
that looks like it is adding to a page and is really holding a blank one is the only control
in this app that can destroy something irreplaceable: Save flattens what is on screen and
PUTs it over the sheet's row. So `JournalCanvas` tracks each base sheet as loading, ready or
failed, refuses to save until all of them are ready, and says which is true.

### The handwritten page is a scroll of sheets

The owner's ruling, 2026-08-25, in three parts. The geometry and the growth rule live in
`src/lib/sheets.ts` (pure, tested); the save sequence in `src/lib/journalSave.ts` (pure,
tested, transport injected — `fetchSender` in `journalSend.ts` is the one the app uses).

**1. WRITING IS STYLUS-ONLY; A FINGER SCROLLS.** `pointerType === 'pen'` draws (and a mouse,
since a desktop has no stylus); a touch is never captured and never prevented, so the
browser scrolls the page with it. The device is a Galaxy Tab S6 Lite with an S Pen, on Chrome
for Android — where a stylus ALSO travels the touch pipeline, so `touch-action: pan-y` on the
scroller would let the browser take a vertical pen stroke as a scroll and cancel the pointer.
What stops that is a non-passive `touchstart` listener on the column that calls
`preventDefault()` while a pen is down: `pointerdown` fires before `touchstart` for the
same contact, so the pen has already said it is down by the time the touch arrives. The same
guard keeps a palm that lands mid-stroke off the scroller (the scroller also flips to
`touch-action: none` while a stroke is down, belt and braces). Not yet tested on the tablet —
only with a mouse in Chrome on Windows; the pen and palm paths are reasoned from the Pointer
Events order, and the first thing to check on the device is that a vertical pen stroke draws
rather than scrolls. Nothing on screen explains this beyond the status line's "Pen writes ·
finger scrolls": TEXT IS DATA.

**2. THE PAGE IS AN ENDLESS SCROLL.** It was one fixed A4 canvas, and a page that ran past
its eighteenth line ran out of paper. The owner writes through the day and comes back to a
half-written page at night, so the page GROWS: one A4 sheet to start, and one more appended
whenever the lowest ink on the LAST sheet passes `GROW_AT` (two thirds) of its height — paper
has to be there before the pen arrives, or the last lines of every sheet are written against
a wall. Sheets are never removed. On screen it is ONE continuous ruled scroll: no seam, no
gap, no border between sheets, in the editor and in every reader. `JournalDrawing.tsx` is the
one component that knows a page is several images; the journal reader and the record's spread
both use it, so a scroll cannot be drawn two ways. Thumbnails stay `[id]/image` — the top of
the page, which is what a page looks like on a shelf.

**3. NO PDF. The record IS the scroll**, kept as PNG sheets. Sheet 0 stays in
`journal_entries.image` — so every page ever written is already a valid one-sheet scroll and
nothing migrates — and sheets 1.. are rows of `journal_sheets`, keyed `(entry_id, seq)`,
CONTIGUOUS by construction: `saveJournalSheet` refuses a seq past `1 + count` (a gap) and
refuses a text page outright. A page's sheet count is `1 + COUNT(journal_sheets)`, served as
`sheets` on `GET /api/journal/[id]` and on the log's entries; `GET/PUT
/api/journal/[id]/sheet/[seq]` is one sheet's bytes. An export could be built from these
rows one day; none is built now, because the owner's use is reopening half-written pages
and adding to them, and a PDF is a thing you stop writing on.

The split into sheets is ENGINEERING, not design, and the reasons are worth keeping:

- **Vercel caps a request body at ~4.5 MB**, and the journal routes at 4 MB. One ever-taller
  PNG would stop saving a few screens down, silently and permanently; a sheet at a time never
  will.
- **A browser caps a canvas's area, and a phone caps it low.** A sheet is one A4 at
  `min(devicePixelRatio, MAX_DPR)` — 2x — which is always under the limit, however long the
  page gets.
- **Only the sheets you TOUCHED are written back** (`sheetsToSave`). Adding a line to the
  bottom of a ten-sheet page sends one sheet, not ten.

**The save is SEQUENTIAL and a half-save is recoverable, never duplicated.** `saveDrawing`
POSTs sheet 0 to create a new page (the same request a one-sheet page always made) and PUTs
the rest against the id it got back; a page being added to PUTs every sheet, sheet 0
included. In order, never in parallel: the engine refuses gaps, and a failure must leave a
contiguous prefix on the record. When it stops it throws `SaveError { id, saved }` — for
EVERY failure, the transport rejecting included: a network drop is `fetch` throwing, and a
raw TypeError escaping the loop took the created id with it, so the retry POSTed a second
page for the day. Both parents REthrow it to the canvas, which marks sheets saved only on a
resolved promise — so the ink stays dirty and the next Save re-sends exactly what did not
land. `JournalPanel` keeps the id of a half-created page as `draftId` so that retry is PUTs
against the page that exists, never a second POST and a second page for the day; it is
reset whenever the drawing dialog opens or closes, because a new sitting is a new page.

**A half-save has still CHANGED THE RECORD, and the reader must not forget that.**
`JournalReader` marks itself stale when a write begins (`staleRef`) and clears it only when
a re-read of the page lands; leaving the editor and re-entering it both re-read first while
it is set. Retrying in place after a partial save is fine — the canvas re-PUTs everything
dirty — but closing used to leave the reader holding the old sheet count and the old `rev`,
so "Add to it" handed the editor a base a sheet short: it grew a BLANK sheet where the
record already held an inked one, and the next Save flattened that over it. The re-read is
deliberately deferred to the moment the editor is left rather than done in the catch: it
needs the connection that most likely just dropped, and a `rev` moved while the sheets
cannot be fetched would wall the canvas over ink a retry a minute later would have saved.

`rev` — part of the canvas's `base` and every sheet URL's cache-buster — is a TIMESTAMP,
unique per mount, never a counter from 0. The reader is unmounted on close and the sheet
route is served `private, max-age=3600`, so a counter meant a page saved, closed and
reopened asked for `?v=0` again and got the PRE-save sheet from the browser's cache — shown
as the page, and loaded as the canvas's base, so the next line was flattened over the old
ink and PUT back over the only copy. (The PUT's URL carries no query, so the browser's own
invalidation never reaches the cached `?v=` entry.) A failed sheet save is reported ONCE, by
the canvas beside its Save button; the reader's own `error` line is the typed page's.

**Typed pages are untouched.** One sheet, one textarea, `PATCH` as before.

## Steps — the one figure this app does not write

LIVE. An iOS Shortcut POSTs the day's count hourly to `/api/health`, which upserts
`health_logs` — one row per day, a later push REVISING rather than accumulating. That route
is the phone's one way in and is the only entry in `proxy.ts`'s `MACHINE_ROUTES`,
authenticating with `x-app-secret` because a Shortcut cannot hold a session cookie. **Do
not change how that push works**; everything below is additive to it.

`STEPS_FLOOR` (7,000) is exported from `rings.ts`, derived from the metric — the checklist
row, the chart's floor line, the adherence credit and the Health ring all read the same
constant, and there is deliberately no second lookup anywhere.

**THE RING COUNTS TOTAL STEPS, NOT QUALIFYING DAYS** — `SUM(steps)` over the fortnight
against `STEPS_FLOOR × WINDOW_DAYS` (98,000), derived rather than written down so retuning
the daily line moves the fortnight target with it. It used to count days that reached 7k,
which made it a CONSISTENCY measure: 6,900 steps scored what 0 did, and a 20k Saturday
scored what 7,001 did. Steps ACCUMULATE, and nothing about a body cares which date they
fell on.

Known and accepted: this is a metric where a big day can carry several quiet ones — as it now
is for Calories, which the pivot moved to the same rule. That is a real change of meaning,
which is why the daily floor stays drawn on the checklist row and on the chart; those still
ask about consistency.

**STEPS IS ONE OF HEALTH'S FIVE PARTS NOW, at weight 15** — the owner's ruling, 2026-09-18,
REPLACING "`weight: 0`, so it draws as a thin outer lap and a phone sensor can never move the
Physical mean". There are no laps left to draw it on: a ring is one thickness and everything in
it is a slice with a share. The old argument was about a sensor moving a figure about effort;
what settles it now is that the board is five capped parts, so a phone left on a desk costs 15
of 100 with the other 85 untouched — the same standing an unlogged fortnight of cardio has. The
cap keeps that honest in both directions: a 40k Saturday fills Steps and reaches nothing else.

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
- **Preserve data.** Goals, habit history, gym sessions, skill sessions, journal pages and
  Google tokens are real and irreplaceable. Migrate; never drop.
- **Confirm any migration plan before running it.**
- Stack: Next.js 16 (Turbopack) + React 19 + Tailwind v4 + libSQL.

### The pivot's migration — `pivot_health_career_v1`

Idempotent and LATCHED, in `client.ts`'s `ensure()`, following the `habits_aug24_v1` pattern:
applied once, so a later rename or re-filing is never overruled on the next boot. One
`batch()`, so a failure part-way leaves nothing applied and nothing latched and the next boot
tries again. **No deletes.** Placed LAST, after the seed and the aug24 block, so a brand-new
database lands here too — the seed deliberately inserts the PRE-pivot pillars and filing, and a
fresh instance reaches the same state through the same statements a migrated one did.

- `pillars`: `physical` → name `Health`, colour `#467c6c`; `portfolio` → name `Career`,
  colour **`COALESCE(color, '#7d5a72')`**. Career's colour is FILLED, never written over: the
  spec names a colour only for `physical` (the live Rust sat on top of the amber accent and had
  to go), but Career is Plum by the same ruling and `pillars.color` is NULLABLE — a null would
  draw Career in the CSS fallback on any database but the owner's. COALESCE fills the hole and
  never overrules a hue the owner picked from the palette.
- `habits`: ASC.ND → Health · Outreach → Career, renamed **`Outreach`** · `Calendar`
  (pillar NULL) → Career · reading → renamed **`Read`**, pillar NULL · journal → pillar NULL ·
  `Tidy room` → pillar NULL.
- **Matched by `system_key` where one exists**, so a habit the owner renamed is still found;
  by exact name otherwise. `Calendar` carries the `pillar_id IS NULL` predicate because the
  ruling puts that condition there and nowhere else; `Tidy room` is applied flatly, because the
  block is LATCHED and a pillar predicate would be a one-shot match that leaves the row
  coloured forever on a database where it had already been re-filed.
- A habit's pillar only sets its tick colour — no figure reads it — so **nothing here changes
  adherence or any history**.
- `goals.deadline` is added above with the other idempotent column adds, not inside the latched
  block: `ALTER TABLE goals ADD COLUMN deadline TEXT CHECK (deadline IS NULL OR deadline GLOB
  '????-??-??')`. A nullable ADD COLUMN cannot lose a row, so it needs no migrate.mjs block and
  no backup step — the same reasoning `worked_fraction` was added under. Every existing goal
  simply has no deadline and stays out of the Career ring until one is set.
- The `social_capital` pillar row is NOT touched and NOT deleted.
- **`scripts/migrate.mjs` is not mirrored with this block.** `ensure()` runs on every boot and
  a fresh database reaches the same state; flagged here rather than changed.

### THE LIVE DEPLOYMENT IS VERCEL + TURSO — `taxiivation-dashboard.vercel.app`

Read this before touching anything deploy-shaped, because the repo still LOOKS like a Fly
app and it is not one. `fly.toml`, `Dockerfile` and `docs/deploy.md` describe a Fly + Turso
deploy that was written first and never became the live one. None of them mention Vercel.
There is no `vercel.json` and no `.vercel/` in the tree either, so nothing in the repo
pointed at the real host.

That cost real time on 2026-08-14: Connect on the live site sent the owner's browser to
localhost, and the obvious suspect was `fly.toml`'s `GOOGLE_REDIRECT_URI` — a file Vercel
never reads. The variable was simply unset on Vercel, and `google.ts` fell back to a
hardcoded localhost default. **Deployment config is not documentation; if the tree and the
truth disagree, believe neither until you have checked the host.**

- **Local dev is a FILE database** (`DATABASE_URL=file:./data/dashboard.db`); production is
  **Turso**. They are two different databases and they do not sync. **CHECK `.env.local`
  BEFORE BELIEVING THIS**: on the owner's machine it was found (2026-09-03) setting
  `DATABASE_URL` to the Turso URL, so `npm run dev` on port 3000 was writing to PRODUCTION
  and "the local dev DB" was Turso. For an isolated server, override both from the shell —
  `DATABASE_URL=file:./data/<name>.db NEXT_DIST_DIR=.next-build/<name> npx next dev -p 3001`
  after `DATABASE_URL=file:./data/<name>.db node scripts/migrate.mjs` — because a shell
  variable beats `.env.local` and `next.config.ts` reads `NEXT_DIST_DIR`. The dist dir MUST
  be under a git-ignored path: Tailwind v4 scans every un-ignored file for class candidates,
  and a dist dir it can see fills globals.css with garbage and breaks the CSS build for
  EVERY dev server in the tree. Turbopack also refuses a `node_modules` junction that
  points outside the project, so copying the tree elsewhere does not work. The gym backlog that
  `scripts/import-strength.mjs` imported lives in Turso — that importer refuses to
  `--commit` against a `file:` URL for exactly this reason. A local screen showing four
  sessions is not evidence that anything was lost.
- **`isLocalDatabase()` in `client.ts` is the one place that answers "am I on a file
  database"**, read off the same `url` every query is built from, so nothing can ask the
  question of a different variable than the client was made from.
- **`DEV_CALENDAR_FIXTURE` — a local calendar for development**, so the blocks list can be
  seen without Google. A JSON file of Google event resources (`{ "items": [...] }` or a bare
  array), read fresh on every call; while it is on, `getCalendarForDate` and `getCalendarRange`
  read it instead of Google and report `connected: true`, and writes to Google are untouched.
  **Honoured ONLY when NODE_ENV is not production AND `isLocalDatabase()`** — and the database
  condition is the point rather than belt and braces. A fixture event is MARKABLE: gated on
  NODE_ENV alone, with the variable added to `.env.local` (the natural place to put it), it
  would serve fabricated blocks while writing `block_marks` rows into PRODUCTION Turso, keyed
  to events no calendar has, for good. Being ignored is SAID once per process, because a
  fixture that silently does nothing reads as a broken fixture and the next move is to try
  harder to turn it on.
- **`scripts/db-copy.mjs` WIPES ITS TARGET.** It is a one-way mirror of the local file onto
  Turso, not a merge. Running it from a dev box replaces production with local data. Do not
  run it to "sync"; there is no sync.
- **Env vars must be set in the VERCEL project**, not in `fly.toml` and not in
  `.env.local` — neither is read by the live app.
- SQLite `GLOB` uses `?`/`*` wildcards, not `_` — date CHECKs use `GLOB '????-??-??'`.
- **Tests: `npm test`.** `node --test` on Node 24, which strips TypeScript natively — zero
  dependencies. `src/lib/rings.ts`, `goals.ts`, `dates.ts`, `worked.ts` and `dayLog.ts` are
  import-free on purpose so they run under it; `career.ts`, `adherence.ts` and
  `productivity.ts` import only import-free modules, with explicit `.ts` extensions, for the
  same reason. Keep them that way. `PillarKey` lives in `rings.ts` and is re-exported from
  `queries.ts`, so a client component can take it without taking the database.
- **libSQL returns aggregates as BigInt.** `bigint / number` throws. Every aggregate goes
  through `num()` at the query boundary.
- The rolling window is `addDays(anchor, -13)` .. anchor, `BETWEEN` both ends. The anchor
  comes from the date being VIEWED, never a server-side `todayISO()`.
- **`archive/` is excluded from `tsconfig.json` and from Tailwind's scan** (`@source not` in
  globals.css). Nothing in it compiles, and nothing in `src/` may import from it.
- **Two things are deliberately left with no reader**: `/api/adherence`'s `center=` parameter
  and its per-day `blocks` summary, both orphaned when `CalendarColumn` went. Left in place on
  purpose; do not "clean them up" without checking what might want them next.

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.
