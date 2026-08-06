# Design — adherence v2, workout types, journal text, phone tabs, colour

**Date:** 2026-08-06 · **Status:** design agreed, not yet planned, no code written.

Read `CLAUDE.md` first — it is the constitution. This document specifies six changes,
built and reviewed **independently in the order given**. Each part is self-contained; you
can stop after any of them.

Supersedes nothing. Builds on `docs/superpowers/specs/2026-08-05-goals-skills-rings-design.md`,
which is now implemented.

---

## 0. The rules these must not break

- **Adherence, not accomplishment.** Output is never scored.
- **Honest logging outranks everything.** Nothing may make truthful marking feel costly.
- **No gamification.** No XP, levels, points, progression.
- **Subtraction over addition.** Today stays minimal.
- **A ring caps at its threshold.** No overfill, no bonus for excess.
- **`null` is never `0`.** "Hasn't had its chance yet" and "didn't happen" are different.
- **All writes transactional in `src/lib/engine.ts`.** `queries.ts` is reads.
- **Two font weights. No red. One amber accent.**
- **Preserve data. Confirm migrations before running them.**

---

## Part 1 — Adherence v2: non-negotiables join the rate

### 1.1 The model

The denominator becomes **due blocks + due non-negotiables**, weighted equally. One item
is one item: a 15-minute habit and a 3-hour block count the same, which is the same logic
that makes working a block badly identical to working it brilliantly.

A non-negotiable is **adhered** if ticked, and counts against the rate if due and
unticked. There is no drifted/skipped for habits — they stay binary, as the constitution
requires. They are simply present or absent from the numerator.

### 1.2 "Due" for a thing with no time

A block becomes due when its end time passes. A habit has no end time, so it becomes due
at an **evening cutoff — default 21:00 local, configurable** via `app_meta['habit_cutoff']`.

```
pure fn: habitsDueOn(dateISO, nowMs, cutoffHHMM) -> boolean
  past date   -> true   (the day is over)
  future date -> false
  today       -> nowMs >= the cutoff instant in APP_TZ
```

Implement the cutoff instant with the existing `rfc3339(date, "21:00", APP_TZ)` from
`dates.ts`. Known narrow caveat: `tzOffset` samples at 12:00 UTC, so on the two Melbourne
DST transition days the cutoff can be off by an hour. Acceptable for an evening cutoff;
do not add machinery for it.

Before the cutoff, unticked habits are **not in the denominator at all** — not counted as
missed, not counted as pending. This preserves the existing rule that the number must not
look bad at lunchtime for no reason, and preserves `pct == null` meaning "nothing has had
its chance yet".

Ticked habits count **immediately**, in both numerator and denominator. Ticking something
must visibly do something, or tap-as-you-go becomes pointless until 21:00 — and that
outranks tidiness.

**The consequence, stated plainly:** before the cutoff the rate is optimistic. Tick one
habit at 08:00 with nothing else due and the day reads 100%, because one of one things
that has had its chance went well. At 21:00 the remaining scheduled habits enter the
denominator and the number settles — usually downward. This is the same "denominator is
what has had its chance" rule the app already runs on, not a separate mechanic, and the
UI says which items are not yet due so the movement is never a surprise.

### 1.3 History must not be rewritten

`habit_entries` holds **3 rows in its entire history**. Counting habits retroactively
would show every past day with four untouched non-negotiables held against it, dragging
the 7-day strip and the whole calendar column to near-zero for days the owner actually
lived under the old rule.

The migration stamps `app_meta['adherence_habits_since'] = <today>`. Days **before** that
date are computed blocks-only, exactly as they are now. Days on or after it include
habits. The strip and calendar column must both honour this.

### 1.4 Known limitation, accepted

Habit configuration is not versioned. `active` and `days_mask` are read as they are *now*,
so editing a habit's schedule reshapes adherence for days after the start date. Versioning
the schedule is not worth a history table for a single user; the start date bounds the
blast radius. **State this in the UI nowhere** — it is an engineering note, not something
the owner needs to think about.

### 1.5 Shape of the change

- `src/lib/adherence.ts` — `adherenceFor` takes an optional habit tally:
  `adherenceFor(blocks, habits?: { due: boolean; scheduled: number; done: number })`.
  Stays pure, stays testable, no DB. Semantics:

  ```
  habits omitted or null  -> blocks only (a day before adherence_habits_since)
  habits.due === false    -> add `done` to BOTH numerator and denominator; ignore the rest
  habits.due === true     -> add `done` to the numerator, `scheduled` to the denominator
  ```

  `scheduled` is how many non-negotiables applied that weekday, `done` how many were
  ticked. Returns the same `Adherence` shape, with `due`, `adhered` and `unmarked` now
  spanning both kinds so nothing downstream needs to know the split.
- `queries.ts` `getDayView` passes today's habit tally.
- `/api/adherence` (strip **and** calendar column) gains a per-day habit tally: one query
  for `habit_entries` over the range plus the current active habits and their `days_mask`,
  bucketed by date, with `weekdayBit` deciding which habits applied on each day.
- `Today.tsx` copy makes the split legible rather than hiding it:
  `4 of 7 · 3 to mark`, and before the cutoff a muted `4 non-negotiables not due yet`.

### 1.6 Tests (pure, `node --test`)

- Before cutoff: unticked habits absent from the denominator; ticked ones present.
- After cutoff: all scheduled habits present.
- Past date: always due. Future date: never due.
- No blocks and no due habits → `pct === null`, not `0`.
- A day before `adherence_habits_since` → blocks-only.
- Cutoff boundary: 20:59 vs 21:00.

---

## Part 2 — Workout types

### 2.1 Schema

`gym_sessions` gains `kind TEXT NOT NULL DEFAULT 'strength'` constrained to
`('strength','cardio','misc')`, and the unique index changes:

```sql
DROP INDEX idx_gym_sessions_date;
CREATE UNIQUE INDEX idx_gym_sessions_date_kind ON gym_sessions(date, kind);
```

A day can now hold one of each kind. The per-day cap applies **per kind**: two strength
sessions on Tuesday is still one strength day. The three existing imported rows are
back-filled to `'strength'` — they are `PUSH`, `UPPER` and `LEGS`, which they plainly are.

### 2.2 Metrics

| key | label | required /14d | notes |
|---|---|---|---|
| `strength` | Strength | 8 | the owner's stated minimum |
| `cardio` | Cardio | 2 | a floor, not a target |
| `misc` | Misc | **none** | tracked, never scored |
| `steps` | Steps | 12 | unchanged, still `sourceReady: false` |

**Physical is a WEIGHTED mean: Strength 0.8, Cardio 0.2.** Misc and Steps carry weight 0
and are excluded, which the existing `live = metrics.filter(m => m.fill !== null)` already
does for free.

`Metric` gains `weight: number` (default 1). Pillar fill is
`Σ(fill × weight) / Σ(weight)` over live metrics, so an unweighted pillar behaves exactly
as it does today and nothing else needs changing.

Eight strength days and no cardio now reads **80%**, not 50% — the ring reflects that the
bulk of the intent was met, while the empty cardio sub-ring still shows what was skipped.

### 2.2b Overdrive — visual only, never in the mean

Beyond its threshold a metric ring may show **overdrive**: a second, subtler arc layered
over the full one, indicating work past the minimum. It is capped at 2× and is a *fact*,
not a reward — the fact line already says `11 of 8 days`, and this only makes that
visible in the ring rather than only in the text.

**Overdrive never reaches the pillar mean.** `metricFill` continues to return a value
capped at 1, and that capped value is what the weighted mean consumes. A separate
`overdrive: number | null` (0..1, the fraction of a second lap) drives the visual only.

This is not decoration-versus-purity — it is load-bearing. With Strength weighted 0.8, an
uncapped fill of 1.25 would give `0.8 × 1.25 + 0.2 × 0 = 100%`: ten strength days and zero
cardio would fill Physical completely, and overdoing one thing would exactly cancel
neglecting the other. That is the failure the cap exists to prevent. The cap therefore
stays in the maths and the acknowledgement lives in the pixels.

`CLAUDE.md` must be amended: it currently states the cap with no exception, and the code
would otherwise contradict the constitution.

### 2.3 New metric state: tracked, not scored

A third state, and it is the constitution made literal — a thing you log that deliberately
has no target.

The three states are **derived, not declared** — no new field on `Metric`:

| state | condition | renders |
|---|---|---|
| scored | `sourceReady && required != null` | ring + `N of M days` |
| **unscored** | `sourceReady && required == null` | **no ring**, `N sessions · not scored` |
| ghost | `!sourceReady` | dashed ring, `no data source yet` |

Note `steps` is ghost, not unscored: it has `required: 12` but `sourceReady: false`, so
`!sourceReady` decides first. The order of those checks matters and must be tested.

`metricFill` already returns `null` for `required == null`, so unscored metrics are
excluded from the pillar mean with no change. What must change is the **copy** —
`factLine` currently says "no data source yet" for every null fill, which would be a lie
for Misc.

### 2.4 UI

The `Went to the gym today` checkbox becomes **Log workout** with three choices. Tapping a
type toggles that type for the day.

```
Log workout
  [ Strength ]  [ Cardio ]  [ Misc ]
     ✓ today
```

Engine: `setGymSession(db, date, kind, on)`. Unticking still only deletes rows with
`title IS NULL`, so imported history stays safe.

---

## Part 3 — Skill time, any duration

A minutes field plus a date, with `+15 / +30 / +60` kept as shortcuts beside it. Backfilling
yesterday becomes possible; today it is not.

- `POST /api/skills/[id]/time` currently rejects anything outside `{15,30,60}`. Replace
  with a range check: integer, `1..600`. The closed set existed to stop a crafted request
  logging an eight-hour day; a range does the same job without blocking real input.
- Date defaults to the date being viewed, selectable back 14 days (the window that matters).
- Undo is unchanged: removes the most recent row for (skill, date) and recomputes
  `last_touched` from what remains.

---

## Part 4 — Journal

### 4.1 Text entries

```sql
ALTER TABLE journal_entries ADD COLUMN kind TEXT NOT NULL DEFAULT 'drawing';
ALTER TABLE journal_entries ADD COLUMN body TEXT;
```

`image` is currently `NOT NULL`, which a text entry cannot satisfy. SQLite cannot drop a
NOT NULL constraint without a table rebuild, and `journal_entries` holds **2 real rows**
of irreplaceable handwriting.

**Decided: no rebuild. Text entries store `image = ''`** and are identified by
`kind = 'text'`. Two `ALTER TABLE ADD COLUMN` statements against real handwriting, versus
a create-copy-drop-rename cycle — the cheap option is also by far the safer one here. The
API and reads must treat `kind`, never emptiness, as the discriminator. Documented in the
schema comment so it reads as a decision rather than an oversight.

Three consumers must learn about `kind`, or a text entry will render as a broken image:

- **`POST /api/journal`** — the `image` data-URL regex applies only when `kind='drawing'`.
  A `text` entry requires a non-empty `body` instead.
- **`GET /api/journal/[id]/image`** — returns **404** for a `text` entry rather than
  serving an empty data URL.
- **`JournalPanel`** — currently renders `<img src=".../image">` for every entry. Text
  entries get a text thumbnail (first line, ruled-page styling) and link to a reader, not
  to the image route.

### 4.2 The page

Both kinds render on the **same ruled A4 page**, aspect **1:1.414** locked. Typing and
handwriting produce one artefact, not two features. The canvas currently fills whatever
the dialog is; it gains a fixed aspect box that letterboxes within the dialog.

Ruled-line geometry (34px gap, 56px margin rule) is preserved and reused for the text
view, so a typed page and a written page look like the same notebook.

### 4.3 Delete confirmation

`remove(id)` currently fires on one tap with no undo, against real handwriting. It gets a
confirm step naming the entry's date.

---

## Part 5 — Phone tabs

Below `lg`, the three columns become three tabs with a **bottom bar**, opening on the
centre (the day's work). Swipe left → calendar, swipe right → pillars.

- Desktop is untouched: three columns, no bar.
- The bar is fixed to the bottom with safe-area padding for the iPhone home indicator.
- The compact pillar ring row in the header (added last round, `lg:hidden`) is **removed** —
  the pillars now have their own tab, so the header row is duplication.
- Tab state is component state, not a route. Reloading returns to centre, which is correct:
  the day's work is the hero and should be what you land on.
- Swipe must not fight vertical scrolling or the journal canvas — horizontal-intent
  detection, and disabled while a dialog is open.

---

## Part 6 — Colour and graphs

### 6.1 Editable pillar hues

`pillars` gains `color TEXT` (nullable; `NULL` = the current CSS default). A settings
surface offers a **curated palette** per pillar — muted options pre-checked for contrast
against `--color-bg`. No free hex picker: the light-beige identity is a product decision,
not a preference.

Fixed and not editable: the amber accent, ink, surfaces, and the three block states. One
accent is what keeps the page quiet, and the block states deliberately avoid a severity
ramp.

Applies to: rings, goals, skills, non-negotiables. **Not** calendar blocks — they carry no
pillar, and the adhered/drifted/skipped states already use colour to mean something there.

### 6.2 Graphs

Translucency so empty and overlapping states read as depth rather than flat grey:
ring tracks, the 7-day strip bars, goal and skill bars. Run through the taste skills at
build time rather than specified here — the one hard constraint is that nothing may
introduce a third font weight, red, or a second accent.

---

## Part 7 — Migration

One guarded `app_meta` block per the house pattern in `scripts/migrate.mjs`. **Backup and
confirm before running.**

1. `adherence_habits_since` = today.
2. `habit_cutoff` = `'21:00'`.
3. `gym_sessions.kind` column + back-fill existing 3 rows to `'strength'`.
4. Swap `idx_gym_sessions_date` → `idx_gym_sessions_date_kind`.
5. `journal_entries.kind` + `body` columns.
6. `pillars.color` column (NULL).

`schema.sql` updated to match so a fresh database stays byte-compatible.
`scripts/db-copy.mjs` needs no change — no new tables.

Verify after: `goals 2 · subgoals 8 · tasks 6 · habits 10 · habit_entries 3 · skills 7 ·
skill_time 0 · block_marks ≥4 · journal 2 · gym_sessions 3 · google_tokens 1`.

---

## Part 8 — Cross-cutting

- **Tests:** `npm test`. Every pure addition gets one — `habitsDueOn`, adherence with
  habits, the unscored metric state. `adherence.ts` and `rings.ts` must stay import-free.
- **libSQL aggregates are BigInt.** Every new aggregate through `num()`.
- **No optimistic updates.** Await-then-refresh, `busy` keyed by id, matching the codebase.
- **Docs:** `CLAUDE.md` gains the adherence-v2 rule, the unscored-metric state, and the
  colour-editing boundary. `HANDOFF.md` §2 file map and §5 gaps updated.

---

## Part 9 — Order, and what is not in scope

**Order:** 1 adherence → 2 workouts → 3 skill time → 4 journal → 5 phone tabs → 6 colour.

Colour is last because it restyles whatever exists; doing it earlier means doing it twice.
Parts 2 and 3 are both "make logging cheaper" and may share one plan.

**Not in scope:**

- Steps / `POST /api/health` / the iOS Shortcut. Still `sourceReady: false`.
- Coach changes of any kind.
- Sleep tracking.
- Deleting the dead files in HANDOFF §3.
- Versioning habit schedule history (§1.4).
- Deploy.
