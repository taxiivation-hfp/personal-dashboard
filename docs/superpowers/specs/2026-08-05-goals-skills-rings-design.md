# Design — functional goals, rolling skills window, pillar sufficiency rings

**Date:** 2026-08-05 · **Status:** design agreed, not yet planned, no code written.

Read `CLAUDE.md` first — it is the constitution. This document specifies three changes to the
Today screen and the data layer beneath it. It was produced by discussion with the owner and
verified against the codebase by a parallel ground-truth and adversarial-critique pass; findings
from that pass are folded in and marked *(verification)* where they changed a decision.

---

## 0. The rules these changes must not break

Restated because every section below is constrained by them:

- **Adherence, not accomplishment.** Output is never scored.
- **No gamification.** No XP, levels, points, or progression.
- **Honest logging outranks everything.** Nothing may make truthful marking feel costly.
- **Subtraction over addition.** Today stays minimal; the rest goes one tap deeper.
- **All rules live transactionally in `src/lib/engine.ts`.**
- **Preserve data.** Migrate, never drop. Confirm any migration before running it.

**Goals are the single sanctioned accomplishment measure, and they are quarantined.** Goal
progress feeds nothing else — not adherence, not the streak, not the rings, not the coach. That
isolation is what stops "did I do what I said I'd do" becoming "how much did I finish".

**Sufficiency is not volume.** A ring caps at its threshold and cannot be improved by doing more.
Eight gym sessions and twenty render identically. This was challenged during verification as a
disguised volume score and rejected: a volume score rises with more, a capped quota does not.

---

## 1. Goals + subgoals become functional

### 1.1 Weight model — equal by default, override on edit

`subgoals.weight = 0` means **AUTO**. Any non-zero value is an explicit override.

**No schema change.** `0` is already the column default (`schema.sql:130`) and already satisfies
`CHECK (weight >= 0 AND weight <= 1)`. A subgoal explicitly worth 0% is meaningless, so the value
is free to carry this meaning.

Derivation, replacing the plain sum at `src/lib/queries.ts:186`:

```
overrides    = subgoals where weight > 0
autos        = subgoals where weight = 0
overrideSum  = Σ weight over overrides
autoShare    = autos.length ? max(0, 1 − overrideSum) / autos.length : 0
effective(s) = s.weight > 0 ? s.weight : autoShare
progress     = clamp(Σ effective(s) for s where s.done, 0, 1)
```

Cases:
- No subgoals → `progress = 0`, and the UI says "no subgoals yet" rather than rendering 0%.
- `overrideSum > 1` → `autoShare` is 0 (correct: nothing remains) and the warning fires.
- The eight existing seeded subgoals all carry non-zero weights, so they survive untouched as
  overrides and today's displayed percentages do not move.

### 1.2 Two existing UI elements this breaks *(verification)*

`GoalsSkills.tsx` renders `{Math.round(s.weight * 100)}%` per subgoal row (line 61) and warns when
`weightSum` differs from 1 (line 69). Under the AUTO model, an all-auto goal would render **0%** on
every row and warn **"weights total 0%, not 100%"** on a goal that is perfectly well-formed.

Fixes, both required:
- `SubgoalView` gains `effectiveWeight: number`, computed in `listGoals` alongside `progress`. The
  row renders `effectiveWeight`, never the raw column.
- The warning fires **only** when `overrideSum > 1` — the one genuinely broken case.

### 1.3 Behaviour

- **Goals are never auto-completed** when progress reaches 100%. Marking a goal done is the owner's
  decision; auto-completion is a progression mechanic.
- `goals.progress` is already stale (row 1 stores `0.0833`; the derived value is `0`). It stops
  being written. The column stays — preserve data — and is never read.
- **Subgoal deletion is hard.** There is no `active` column on `subgoals` and adding one for two
  seed goals is not worth the migration. A confirm step is the safeguard. Goal deletion stays
  **soft** (`status = 'dropped'`), matching the existing `deleteHabit` precedent.

### 1.4 Writes — `src/lib/engine.ts`, all transactional

`setSubgoalDone`, `createGoal`, `updateGoal`, `deleteGoal` (soft), `createSubgoal`, `updateSubgoal`,
`deleteSubgoal` (hard), `reorderSubgoals`.

`updateGoal` moves out of `queries.ts` (it is a write; `queries.ts` is reads).

### 1.5 UI

- **Today, right column:** subgoal checkboxes become tappable. Await-then-refresh (§5.3).
- **`/goals`:** a second deeper screen alongside `/habits`. Create, rename, reorder, delete goals
  and subgoals; set status; set weight overrides. Reached by an `edit` link per section, mirroring
  the existing `/habits` link at `Today.tsx:132-137`.

### 1.6 API

`/api/goals` POST · `/api/goals/[id]` PATCH, DELETE · `/api/subgoals` POST ·
`/api/subgoals/[id]` PATCH, DELETE.

The existing unused `src/app/api/goals/*` routes are **rewritten**, not extended — HANDOFF §3 warns
that pre-pivot files quietly drag the old model back in.

---

## 2. Skills — rolling 14-day window as the live number

### 2.1 The window

Hard-edged, rolling, **inclusive of both ends**:

```ts
const to = anchorDate;              // the date being VIEWED — Today.tsx's `data.date`, passed in
const from = addDays(to, -13);      // 14 days inclusive
// SQL: WHERE date BETWEEN ? AND ?
```

The anchor is passed from the client, never recomputed with `todayISO()` inside the query. The
screen already supports viewing a date other than today, and a server-side `todayISO()` would
silently return a window that disagrees with the date on screen. Validate it with `isISODate` before
it reaches `addDays`, which throws `RangeError` on malformed input — the guard pattern already used
at `api/adherence/route.ts:28`.

- `>= from` alone is wrong *(verification)*: with no upper bound a future-dated row extends the
  window past 14 days.
- `addDays` (`dates.ts:28`) is UTC-parts arithmetic, DST-immune, correct across both Melbourne
  transitions. Reuse it; write no new date maths.
- This idiom already exists at `api/coach/note/route.ts:39` and `lib/coach/tools.ts:165`. If a
  shared helper is wanted it belongs in `dates.ts`, but that is optional.

**No decay weighting.** A decayed figure is not minutes anyone actually spent, and a number that
cannot be checked against reality is a score. The hard edge keeps it a fact.

**Why rolling rather than a fixed fortnight.** A fixed period would introduce three forbidden
things: a period score, a start-at-zero boundary, and fortnight-over-fortnight comparison. A rolling
window has no boundary, so none can exist.

### 2.2 Read model

`SkillView` gains `minutes14: number` and `sessions14: number`; keeps `minutes` as the lifetime
total.

**A session is a distinct `(skill_id, date)` pair**, never a `skill_time` row — tapping +15 then
+30 in one sitting is one session, not two. Rows remain a removable log, as
`schema.sql:141-143` intends.

**libSQL aggregates arrive as BigInt** *(verification)*. `count / required` throws a TypeError
rather than producing a wrong number. Every new aggregate passes through the existing `num()`
coercion at the query boundary so `rings.ts` stays plain-number pure.

### 2.3 Display

Fortnight minutes take the slot the lifetime total occupies today; lifetime moves to muted text
beside it.

```
Mandarin                    active        2h 15m
▓▓▓▓▓▓▓▓▓▓▓▓▓▓▓░░░░░  ·  38h lifetime
```

- Bar = `minutes14 / max(minutes14 across all skills)`. No target, nothing completable — unchanged
  in meaning from today's bar, only its input changes.
- **All-zero state:** no bars drawn, one muted line ("nothing logged in the last 14 days"), and
  lifetime totals still visible so parked skills do not vanish.
- Parked skills stay listed, always.

### 2.4 Logging

`+15m / +30m / +60m` and an undo, inline per skill row, on their own line beneath the bar — inline
with the name overflows a phone *(verification)*.

- `logSkillTime` **moves from `queries.ts:260` into `engine.ts`** and is wrapped in a write
  transaction. It is a write; CLAUDE.md puts writes in the engine. It is currently called by
  nothing, so the move is free.
- `undoSkillTime(db, skillId, date)` beside it: deletes the highest-`id` row for that skill and
  date, then **recomputes `last_touched` from the remaining rows** rather than leaving it stale.
- Routes: `POST /api/skills/[id]/time`, `DELETE /api/skills/[id]/time`.
- Undo is hidden when no row exists for (skill, today).

### 2.5 Placeholder data

Five `skill_time` rows, all dated 2026-08-04, are backfilled lifetime estimates. Left in place they
make fortnight equal lifetime today and drop every skill to zero simultaneously on 2026-08-18 — a
synchronised cliff real logging never produces.

**They are deleted after the visual check, not re-dated.** Re-dating would preserve a fabricated
lifetime permanently, and once real taps land, invented hours could never be told from real ones.
Backup first, statement shown to the owner, explicit sign-off before running.

---

## 3. Pillar sufficiency rings

### 3.1 Metric registry — new pure module `src/lib/rings.ts`

No DB imports. `PillarKey` is imported from `@/lib/queries` — **not** from `src/lib/pillars.ts`,
which is dead and carries the old saturated dark-theme palette (HANDOFF §3).

```ts
export const WINDOW_DAYS = 14;

export type MetricSource = "habit" | "gym" | "skill_session" | "health_steps";

export type Metric = {
  key: string;
  pillar: PillarKey;
  label: string;
  source: MetricSource;
  systemKey?: string;          // habit-sourced metrics only
  dailyThreshold?: number;     // steps: a day qualifies at or above this
  required: number | null;     // qualifying days/sessions to fill; null = not yet specified
  sourceReady: boolean;        // false when no writer for this source exists yet
};
```

| key | pillar | source | daily | required /14d | ready | from the brief |
|---|---|---|---|---|---|---|
| `outreach` | social | habit | — | 2 | yes | 1 / week |
| `gym` | physical | gym | — | 8 | yes | 4x / week |
| `steps` | physical | health_steps | 7000 | 12 | **no** | 7k / day |
| `skills` | portfolio | skill_session | — | 4 | yes | 4 sessions / 14 days |

Thresholds are the owner's **minimums, not stretch goals**, and are configurable here by design.
`skills` at 4 is acknowledged to be a low bar now that it spans all skills rather than Mandarin
alone; it ships as briefed and is retuned after a fortnight of real data rather than guessed at now.

**Sleep is not in the registry.** It has no source and no plan for one, so a permanent ring that
can never fill would be decoration on the hero screen. Dropped by the owner's decision.

**Invariant:** `required <= WINDOW_DAYS` for every day-capped metric. Assert it in the module.

### 3.2 The two caps, stated precisely

They operate at different levels and the distinction matters:

1. **Inner cap — per-day, for day-capped metrics only.** A day contributes at most 1.
   15k steps ≡ 7k steps. Two gym visits in a day ≡ one (`gym_sessions.date` is unique).
2. **Outer cap — always.** `fill = min(1, count / required)`. No overfill, anywhere, ever.

**The inner cap does not apply to skill sessions.** Three skills logged on a Saturday count as
three, by the owner's ruling: several of these (ice skating, badminton, dancing) are social
activities rather than crammed practice. The outer cap still bounds the ring.

### 3.3 Readers — `getRingCounts(db, from, to)` in `queries.ts`

Returns raw counts; the pure `rings.ts` turns them into fills.

```sql
-- outreach
SELECT COUNT(DISTINCT date) FROM habit_entries
 WHERE habit_id = (SELECT id FROM habits WHERE system_key = 'outreach')
   AND date BETWEEN ? AND ? AND value > 0;

-- gym
SELECT COUNT(DISTINCT date) FROM gym_sessions WHERE date BETWEEN ? AND ?;

-- skills  (sessions = distinct skill/date pairs)
SELECT COUNT(*) FROM (
  SELECT DISTINCT skill_id, date FROM skill_time WHERE date BETWEEN ? AND ?
);

-- steps: no reader. sourceReady = false.
```

`value > 0` is required on the habit count *(verification)* — `habit_entries.value` defaults to 1
but is a REAL and nothing constrains it to be truthy.

### 3.4 `hasSource` — resolved, never assumed *(verification)*

```
hasSource = metric.sourceReady && (source === "habit" ? habitResolves(systemKey) : true)
```

`habitResolves` = a row exists with that `system_key` and `active = 1`. Declaring a source ready
when its wire is broken produces `0 of 2` forever, which renders as the owner's failure rather than
as a bug. A habit-sourced metric whose `sourceReady` is true but which fails to resolve is a wiring
error, not a legitimate ghost: `console.error` with the metric key and the unresolved `system_key`,
and render it as a ghost so the screen still works. Silently ghosting it would hide a broken wire
behind a state that looks intentional.

**`hasSource` is never inferred from row count.** Zero rows in the window is a real, meaningful
zero — it must stay distinguishable from having no source at all.

### 3.5 Fill maths — null, not zero

`fill: number | null`, following the `pct == null` precedent in `adherence.ts:99-100`.

```
fill = (!hasSource || required == null || required < 1) ? null
     : min(1, count / required)

pillarFill = live.length ? mean(live.map(m => m.fill)) : null
   where live = metrics.filter(m => m.fill !== null)
```

Three null cases, each of which would otherwise reach the SVG as `NaN` or a false `0`:

- **`required` is null** → `count / null` is not a number. Guard before any arithmetic.
- **A pillar where nothing resolves** → mean of an empty set is `NaN`. Returns null.
- **`pct == null` on the adherence ring** → JavaScript coerces null to 0 in arithmetic, silently
  drawing a 0% ring at 7am. Guard clause returns the ghost state *before* computing, never
  compute-then-check.

**A metric with no source is excluded from its pillar's mean, never counted as 0.** Counting steps
as zero would cap Physical at 50% permanently and read as failure that no behaviour could fix.

### 3.6 Day one must not look like a fortnight of neglect *(verification)*

On first launch every live ring reads `0 of 8` — indistinguishable from two weeks of doing nothing.

The migration stamps `app_meta['rings_since'] = todayISO()`. Then:

```
observedDays = min(WINDOW_DAYS, daysBetween(rings_since, anchor) + 1)
```

`daysBetween` does not exist in `dates.ts` and must be written — as UTC-parts arithmetic mirroring
`addDays`, not as a millisecond subtraction on parsed local dates, which is DST-unsafe. It belongs
in `dates.ts` beside `addDays` and is trivially unit-testable.

Fills render normally from day one — a thin ring on day 3 is true. What changes is the **fact line**,
which every ring carries and which states the window's state plainly:

```
day 3      2 of 8 days · day 3 of 14
day 20     6 of 8 days
capped     11 of 8 days               ← the arc is full; the number is not
no source  no data source yet         ← steps
```

One format throughout: `<count> of <required> days`. **The arc caps; the text never does.** The cap
must never hide what actually happened.

**No percentage is displayed on any pillar ring** — the fact line is the number. This removes the
rounding trap entirely (a `Math.round` of 0.999 reading 100% while `count < required`).

### 3.7 Ring states — three, visually distinct

| state | when | treatment |
|---|---|---|
| **filled** | fill > 0 | pillar-hued arc |
| **empty but live** | source exists, count 0 | faint track, `0 of 8 days` |
| **ghost** | `fill == null` | dashed track, no arc, `no data source yet` |

The ghost/empty distinction is what stops the first-load board reading as total failure.

### 3.8 Two ring species — separated on three axes

| | adherence ring | pillar rings |
|---|---|---|
| size | large | small |
| colour | `--color-accent` (amber) | `--color-social` / `-physical` / `-portfolio` |
| stroke | thick | thin |
| number | the percentage, **inside** | the fact line (§3.6), **below** — never a percentage |

Without this they read as the same object: adherence becomes one more quota to fill, and the pillar
rings borrow adherence's authority. Adherence stays visibly the hero.

- Adherence ring wraps the existing `.stat-hero` numeral. `pct == null` → neutral track, `—`,
  "Nothing due yet today." The 7-day strip stays beneath it, unchanged.
- Parent pillar rings show a fact line only when the pillar has exactly one live metric; otherwise
  the subrings carry the facts and the parent carries the pillar name.
- **`stroke-linecap: butt`**, not round *(verification)* — round caps inflate small arcs by a fixed
  amount, making the smallest non-zero fills read as roughly half again their true value.

Starting geometry, to be settled with the design skills at implementation: adherence ~176px / 10px
stroke; pillar parent ~56px / 4px; subrings ~40px / 3px at `gap-4`; mobile header rings ~18px.

### 3.9 Do not reuse the dead ring code

`src/components/Rings.tsx` and `src/lib/pillars.ts` are dead (HANDOFF §3) and carry three
violations: a `font-medium` (a third font weight, against the two-weight rule), a glow, and the old
saturated dark-theme palette. **Write `src/components/PillarRing.tsx` from scratch.** The new module
is `src/lib/rings.ts`, one letter from `Rings.tsx` — do not import the latter by reflex.

Ring strokes use the desaturated pillar variables already reserved for this in `globals.css:38-41`,
whose comment reads *"Pillar hues survive only as small ring strokes off to the side — they are
categorisation, not status."*

### 3.10 Layout

**Desktop.** The right column becomes three pillar sections — Social, Physical, Portfolio — each led
by its ring, with that pillar's goals and skills beneath. Physical shows its subrings (gym live,
steps ghost) in a row under the parent.

At the column's minimum width (`minmax(16rem,1.15fr)` = 256px, less `lg:pr-2` = 248px usable) the
subring row must fit; the sizes in §3.8 are chosen for that.

Goals keep their own visible sub-heading inside each pillar section. Ring-led sections must not make
goal progress look like ring progress — the quarantine in §0 is a data rule, and this is its visual
counterpart.

**Header chips are deleted on desktop.** The `pillarAdherence` chips at `Today.tsx:196-205` are
superseded by the rings. `DayView.pillarAdherence` and its computation at `queries.ts:149-152` go
with them.

**Mobile.** The grid stacks middle → left → right, so the right column already sits below the day's
work *and* the 9-day calendar — putting rings there alone would bury them.

A compact row of three small rings sits in the header, `lg:hidden`, where the chips are now. Arcs
only, no numbers. Balance stays glanceable on the phone without scrolling past two columns, and
nothing is duplicated on desktop.

**Empty sections** get a muted one-liner, matching `GoalsSkills.tsx:76`. The real data is asymmetric
and will look broken otherwise: Social has 1 goal and **zero** skills; Portfolio has **zero** goals
and 3 skills; Physical has 1 goal and 4 skills.

### 3.11 Gym

Gym leaves the non-negotiables. The owner trains "any 4 of 5 weekdays" — a **frequency**, which
`days_mask` cannot express. Setting it to Mon–Fri would place it on the checklist five times a week
against an intent of four, guaranteeing one unticked non-negotiable every week *by design*. An item
engineered to fail teaches distrust of the list, which is the honest-logging rule's core failure.

This is subtraction: the checklist gets shorter and gym frequency moves to the ring that measures it.

```sql
CREATE TABLE IF NOT EXISTS gym_sessions (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title      TEXT,
  done_at    TEXT,                    -- naive local, copied verbatim from tasks.done_at
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_sessions_date ON gym_sessions(date);
```

`title` and `done_at` are required *(verification)*: the three real rows in `tasks WHERE kind='gym'`
carry titles (`PUSH MONASH ft. Rats`, `UPPER MONASH ft. Rats`, `LEGS MONASH SPORT`) and local
timestamps. Dropping them would violate the preserve-data rule on data the constitution names as
irreplaceable. `done_at` is copied verbatim and stays naive-local — reinterpreting it as UTC would
shift all three by the Melbourne offset.

The unique index on `date` encodes the inner cap: one gym **day**, not one gym session.

A "went to the gym" toggle sits under the Physical ring. Ticking inserts today's row; unticking
deletes it.

### 3.12 Coach

Deferred — implementation is explicitly not part of this work. Recorded so it is not lost:

- The coach may read ring data and note neglect neutrally ("Social has been thin for a fortnight").
- It must never rate, rank, congratulate, or compare fortnights, and never mention goal progress.
- One known trap when it is built: `/api/coach/note` caches its note permanently per date under an
  `app_meta` key, so a note generated before ring data existed will never regenerate for that day.

---

## 4. Migration

**Confirm before running. Back up first.** Per CLAUDE.md, and because `data/` is gitignored and the
project is not yet under version control.

A single guarded block appended to `scripts/migrate.mjs`, following the house shape (banner comment,
read `app_meta` key, idempotent statements, insert key, one-line console log):

1. `system_key = 'outreach'` on habit id 9, matched by **id AND name**, plus a partial unique index
   so two habits can never claim the same key while leaving NULLs unconstrained:
   ```sql
   CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_system_key
     ON habits(system_key) WHERE system_key IS NOT NULL;
   ```
   This mirrors the partial-unique-index approach already described for `habits.escalate`
   (`schema.sql:70-72`).
   Habit 9 currently has `system_key = NULL`; only `journal` and `steps` exist in the whole DB.
   Without this the Social ring reads `0 of 2` forever, and looking the habit up by name would break
   the moment it is renamed — precisely what `system_key` exists to prevent (`schema.sql:67-69`).
2. `CREATE TABLE gym_sessions` per §3.11.
3. Copy the 3 rows from `tasks WHERE kind = 'gym'` into it with `INSERT OR IGNORE` (the unique index
   on `date` means two gym rows sharing a date would otherwise abort the migration), carrying
   `date`, `title`, `done_at` and `notes`. This **rescues real data currently stranded in a table
   nothing reads.** The `tasks` rows are left in place — copied, not moved.
   Note: only 2 of the 3 fall inside a 14-day window from 2026-08-05, so the gym ring's first render
   is `2 of 8 days`, not a full history.
4. `UPDATE habits SET active = 0 WHERE id = 10` (Gym). Soft, per the `deleteHabit` precedent —
   preserves any entries. Reversible from `/habits`.
5. `INSERT INTO app_meta (key, value) VALUES ('rings_since', <today>)` for §3.6.

`schema.sql` gains `gym_sessions` so a fresh database stays byte-compatible with the migrated one,
matching the existing deliberate policy (HANDOFF §3).

**`scripts/db-copy.mjs` must be updated** *(verification)*. It hard-fails on any table absent from
both its `TABLES` and `INTENTIONALLY_SKIPPED` lists, and it is **already missing `subgoals` and
`skill_time`** — a break that exists today and that `gym_sessions` would deepen. Add all three,
parent before child. Only relevant on deploy, but it is a two-line fix.

**Separately, after the visual check and with sign-off:** delete the 5 placeholder `skill_time`
rows (§2.5).

---

## 5. Cross-cutting

### 5.1 Refresh ownership *(verification)*

Nothing currently refreshes goals or skills. `page.tsx` renders once per request and passes them as
frozen server props; `Today.tsx:42-46` only refetches `/api/today`, whose `DayView` contains
neither. Every new control depends on data that would never update.

**`Today.tsx` owns the state.** `goals`, `skills` and `rings` become `useState` seeded from the
server props, with `loadGoals()` / `loadSkills()` / `loadRings()` callbacks alongside the existing
`loadStrip()`. Ring counts are fetched, not passed as props, so they refresh after any mark, tick or
log.

Decide one model and hold it — the alternative (widening `DayView`) couples ring data to the day
view and makes `/api/today` do two jobs.

### 5.2 New API surface

`GET /api/rings?date=` returning per-metric counts and fills, plus pillar fills.

### 5.3 No optimistic updates

There are zero in the codebase; every mutation is await-then-refresh. Introducing the first one next
to a toggle that isn't optimistic would be inconsistent and would need rollback semantics nothing
else has. `busy` state keyed by id, `disabled:opacity-40`, matching the existing idiom.

### 5.4 Testing *(verification)*

There is no test harness — no test script, no runner dependency, no test file anywhere. HANDOFF's
claim that behavioural work was verified by pure-function test refers to a one-off script.

**Node 24 executes TypeScript natively, so `node --test` costs zero dependencies.** Add
`"test": "node --test src/lib/**/*.test.ts"`.

`rings.ts` is exactly the kind of maths HANDOFF says to verify with pure functions rather than by
eye. Required cases:

- `required` null → fill null, no NaN reaches the SVG
- pillar with no live metrics → null, not NaN
- `count > required` → fill exactly 1, fact line shows the true count
- `count = 0` with a source → 0, distinguishable from null
- window is exactly 14 days inclusive
- day-capped vs session-counted metrics diverge as specified in §3.2
- BigInt counts coerced before arithmetic

Also worth a test: the §1.1 weight derivation, across all-auto, all-override, and mixed goals.

### 5.5 Documentation

`docs/HANDOFF.md` §2 (file map) and §3 (dead files) both go stale and are updated as part of the
work. `CLAUDE.md` needs one amendment: **step tracking moves from "Explicitly cut" to "planned,
source pending"**, because a dormant registry entry and a ghost ring are otherwise a direct
contradiction of the constitution. Sleep is not added.

---

## 6. Order of work

Cheapest and most reversible first.

1. **Look at the current app on the phone.** It has never been seen running (HANDOFF §5). Any later
   breakage is then unambiguously new.
2. **Back up** `data/dashboard.db` plus `-wal` and `-shm`.
3. **`git init`.** There is still no version history for any of this work.
4. **Pure modules + tests** — `rings.ts` and the weight derivation. No DB, no UI, fully verifiable.
5. **Migration** (§4), confirmed and backed up.
6. **Reads** — `getRingCounts`, the 14-day skill figures, `effectiveWeight`.
7. **Writes and routes** — engine functions, then `/api/rings`, `/api/goals`, `/api/subgoals`,
   `/api/skills/[id]/time`.
8. **UI** — `PillarRing.tsx`, the pillar-sectioned right column, the mobile header row, the
   adherence ring, quick-add and gym toggle, `/goals`.
9. **Visual check**, then clear the placeholder rows with sign-off.
10. **Update `HANDOFF.md` and `CLAUDE.md`.**

---

## 7. Explicitly not in scope

- Sleep tracking of any kind.
- `POST /api/health` and the iOS Shortcut. The steps registry entry stays dormant with
  `sourceReady: false`; wiring it is separate work.
- Coach implementation (§3.12 records the intent only).
- Deleting the dead files in HANDOFF §3 — that is its own pass, after a week of real use.
- Deploy.
