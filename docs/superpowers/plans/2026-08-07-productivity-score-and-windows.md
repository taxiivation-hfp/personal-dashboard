# Productivity Score, Windows and Session Logging — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a productivity score derived from calendar colour and time spent, restructure the three columns into distinct windows under a titled masthead, and make workout logging session-based and calorie logging additive.

**Architecture:** A new pure, zero-import `src/lib/productivity.ts` (scoring) and `src/lib/eventColor.ts` (colour projection), both in the style of `rings.ts`. Google's `colorId` — already in the API response and silently dropped — is plumbed through `CalEvent` → `Block` → `/api/adherence`. The `gym_sessions` unique index is dropped so a day can hold many sessions; calories become a log with a derived total.

**Tech Stack:** Next.js 16 (Turbopack) · React 19 · Tailwind v4 · libSQL · `node --test`

## Global Constraints

- **`CLAUDE.md` is the constitution and outranks this plan.** Amendments are Task 0 and ship *first*.
- **Five type steps only:** `text-micro` 12 · `text-small` 14 · `text-body` 16 · `text-heading` 28 · `text-hero` 52. `text-hero` is the adherence numeral and nothing else, ever.
- **Two weights only:** 400 and 600.
- **The Author Rule:** serif for what the owner wrote (plus page headings and the numeral); sans for what the app says.
- **Zero shadows.** After this change: exactly **one** gradient.
- **Motion:** `transform`/`opacity` only. Nothing added here animates.
- **Contrast measured, in the direction used.** The accent is a fill (4.69:1 with white on it, 4.02:1 as text) — never body text.
- **libSQL aggregates are BigInt.** Every `COUNT`/`SUM` through `num()`.
- **Preserve data. Confirm the migration before running it.** No backup logic exists; backup is manual.

---

## Context

Two things the app currently refuses, plus logging fixes.

**The productivity score is a deliberate, owner-approved exception to "output is never scored".** What makes it admissible: it scores *hours spent*, never results produced. A block worked badly and one worked brilliantly score identically — the only inputs are duration and calendar colour. In the owner's words: *"high adherence doesn't mean a productive day if I didn't schedule a productive day. Both numbers matter."* Adherence remains the hero.

This must be written into the constitution, not worked around. Otherwise the next session correctly identifies `productivity.ts` as a violation and deletes it.

**The visual half partly reverses yesterday's redesign.** That work removed every card for a ruled page. Three windows now return — but the ruled vocabulary survives *inside* each one. The no-cards rule was aimed at eleven identical rectangles *within* a column; three top-level windows is a different claim.

### Decisions locked (asked and answered)

| Question | Decision |
|---|---|
| Cards vs ruled page | Three windows, **one accent retained** |
| Today's highlight | **Gradient border**, no shadow, no glow |
| Docs | **Amend `CLAUDE.md`, `PRODUCT.md`, `DESIGN.md`** |
| Upcoming-day titles | Typed **inline on the strip** |
| Physical ring | **Count sessions, threshold stays 8** — ring gets easier, knowingly |
| Strip line | Plots **productivity**; bars keep adherence |
| Google 401 | Owner reconnects, then colour work is verified |
| Design skills | All three; defer to `CLAUDE.md` on collisions |
| Productive time | **Adhered blocks only** |
| Misc workouts | **Score 100**, like the others |
| Historical scores | **Computed live.** No snapshot column |

### The binding visual constraint (measured)

**`--color-bg` cannot move.** Darkening the page to open up range was the obvious approach and it is wrong — measured:

| candidate page | `--color-muted` | `--color-skipped` |
|---|---|---|
| `#e4dccd` | **4.10** ✗ | **3.97** ✗ |
| `#ece5d8` | **4.46** ✗ | **4.32** ✗ |
| `#f2ede4` (current) | 4.79 ✓ | 4.64 ✓ |

`--color-muted` needs a surface at or above `oklch(0.9268)` to hold 4.5:1, which is only 0.02 L below the current page. So the ramp is built **upward** from an unchanged page, with the masthead taking the single step down that the floor allows. `--color-bar` sits at `oklch(0.9290)`, deliberately just above the floor, so every existing ink token stays usable without re-certification and **no new muted token is needed**.

One casualty: **`--color-skipped` measures 4.39:1 on the bar and fails.** No block-state chip may ever render in the masthead.

**Honest limitation.** The three window tones differ by 1.03–1.07:1 — at or below the 1.04:1 that DESIGN.md already documents as invisible. **Tone does not separate the windows; the 1px hairline and the page-ground gutter do.** Tone only tells you which one you are in, and is meant to be felt rather than seen. If the owner wants them *obviously* different, the only routes are raising chroma on the three surfaces (they become visibly tinted panels — a deliberate palette expansion) or darkening the page (which fails the table above). Decide that after looking at it, not before.

---

## File Structure

**Created:** `src/lib/productivity.ts` + `.test.ts` · `src/lib/eventColor.ts` + `.test.ts`

**Modified — backend:** `google.ts` · `adherence.ts` · `rings.ts` (+ tests) · `queries.ts` · `engine.ts` · `db/schema.sql` · `db/client.ts` · `scripts/migrate.mjs` · `scripts/db-copy.mjs` · `api/adherence` · `api/gym` · `api/calories`

**Modified — visual:** `globals.css` · `Today.tsx` · `CalendarColumn.tsx` · `PillarSections.tsx` · `WorkoutLog.tsx` · `CalorieInput.tsx` · `layout.tsx`

**Docs:** `CLAUDE.md` · `PRODUCT.md` · `DESIGN.md` · `docs/HANDOFF.md`

---

## Task 0: Amend the constitution — first, before any code

- [ ] **Step 1: Add the productivity exception to `CLAUDE.md`**, after the Goals section, in that section's voice:

```markdown
## Productivity — the second sanctioned measure, and the narrower one

A per-day points total, drawn on the 7-day strip. A DELIBERATE EXCEPTION to
"output is never scored", and the exception is narrow:

**It scores hours SPENT, never results produced.** A block worked badly and one
worked brilliantly score identically — the only inputs are duration and the
event's calendar colour. Nothing about quality or what was finished enters it.
The rule it bends is "no comparison between days"; the rule it keeps is the one
that matters, that the app never judges the quality of your work.

Why it exists, in the owner's words: high adherence doesn't mean a productive
day if you didn't schedule a productive day. Both numbers matter.

- **UNCAPPED and comparative within the visible week** — the inverse of the ring
  rule. 1,125 is a valid reading. It must therefore NEVER be drawn as a ring, or
  as anything implying a target.
- **It feeds nothing** — not adherence, not the rings, not the streak, not the
  coach. Enforced by data flow: the score exists only on `/api/adherence`, never
  on `DayView`, which is what the coach reads.
- **Adherence remains the hero.** Productivity is secondary context, drawn
  smaller and in a different channel — ink, never the accent.
- **No week-over-week comparison, no best-week marker, no target line, no
  delta.** It is graphite on paper: a record, not a scoreboard.
- **It does not reopen gamification.** No levels, thresholds, milestones or
  streaks on it.
- `src/lib/productivity.ts` holds the one tuning knob, following `rings.ts`.
```

- [ ] **Step 2: Correct four now-false statements in `CLAUDE.md`**
  - Workouts: "one row per (date, kind)" → "one row per session; a day can hold two lifts and a run."
  - Rings: "8 gym days and 20 both count as a full ring" → phrase in **sessions**; note the Physical ring is deliberately easier by the owner's decision.
  - Calories: "a **single manual daily total**" → "a running total for the day, entered as you go. Still no food database, no barcode, no API."
  - `themeColor`: "must track `--color-bg`" → "must track **the topmost painted surface** — now `--color-bar`."

- [ ] **Step 3: Amend `DESIGN.md`** — the surface ramp, and three Named Rules:

```markdown
**The Window Exception.** The furniture inside a column is rules and margins,
not cards. The three columns THEMSELVES are the exception, and the only one:
they are windows onto three time horizons, and a window may have an edge. Each
takes a rounded surface, a 1px hairline and a page-ground gutter. Nothing inside
a column may take a second surface.

**The One Gradient Rule.** There is exactly one gradient in the interface: the
border around today in the calendar column, fading downward toward tomorrow. It
replaces nothing — no shadow was added — and it encodes direction, which no flat
stroke can. A second gradient is a bug.

**The Foreign Hue Rule.** A colour arriving from outside the app — currently only
a Google `colorId` — is never used as it arrives. It is PROJECTED: hue kept,
lightness and chroma replaced with fixed values, and a near-grey source projects
to a true grey. The result is a stroke on the left edge of an event row and
nothing else — never a fill, never text, never a dot. The state dot keeps its own
form, so form carries status and position carries category.
```

- [ ] **Step 4: Amend `PRODUCT.md`** — productivity as a sanctioned second measure; the visual identity now uses three windows under a masthead.

- [ ] **Step 5: Commit**

```bash
git add CLAUDE.md PRODUCT.md DESIGN.md
git commit -m "docs: sanction productivity as a narrow quarantined exception; the window exception"
```

---

## Task 1: `colorId` end to end

**Files:** `src/lib/google.ts:21,145,182` · `src/lib/adherence.ts:25-35,105-126` · `src/app/api/adherence/route.ts:102-104`

No query-string change — neither request sends a `fields=` mask, so `colorId` is already in the payload and is dropped by the `.map()`.

- [ ] **Step 1: Widen `CalEvent`**

```ts
export type CalEvent = {
  id: string; summary: string; start: string | null; end: string | null; allDay: boolean;
  /** Google's palette id. NULL when the event uses the calendar's default colour —
   *  Google omits the field for those, and "default" is a real scoring tier. */
  colorId: string | null;
};
```

- [ ] **Step 2: Add at both map sites** (`:145`, `:182`): `colorId: e.colorId == null ? null : String(e.colorId),`

- [ ] **Step 3: Carry onto `Block`**, with a helper beside `hhmm`

```ts
const durationMinutes = (start: string | null, end: string | null): number | null => {
  if (!start || !end) return null;
  const a = Date.parse(start), b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
};
```
`Block` gains `colorId: string | null` and `minutes: number | null` (*"FOR SCORING ONLY — the calendar column shows allocated spans, never durations"*).

- [ ] **Step 4: Expose `colorId` on the strip payload**, not `minutes`. The frontend is forbidden to render durations; don't hand it one.

- [ ] **Step 5:** `npx tsc --noEmit`, commit.

---

## Task 2: `src/lib/productivity.ts` (TDD)

Pure, zero-import, so `node --test` runs it with no DB.

- [ ] **Step 1: Write `src/lib/productivity.test.ts`**

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { CALENDAR_RATES, UNLISTED_RATE, POINTS_PER_HABIT, POINTS_PER_WORKOUT, rateFor, scoreDay } from "./productivity.ts";

const red = (minutes: number, state: "adhered"|"drifted"|"skipped"|"dismissed"|null = "adhered") => ({ minutes, colorId: "11", state });
const peacock = (minutes: number) => ({ minutes, colorId: "7", state: "adhered" as const });
const day = (o = {}) => scoreDay({ blocks: [], habitsDone: 0, workouts: 0, ...o });

test("red is Work at the full rate", () => assert.equal(rateFor("11"), 1));
test("peacock and the default are the same Uni tier", () => {
  assert.equal(rateFor("7"), 0.5);
  assert.equal(rateFor(null), 0.5);
});
test("an unlisted colour scores zero, not a fallback", () => {
  for (const id of ["5", "2", "", "nonsense"]) assert.equal(rateFor(id), UNLISTED_RATE);
  assert.equal(UNLISTED_RATE, 0);
});
test("60 minutes of Work is 100 points", () => {
  const s = day({ blocks: [red(60)] });
  assert.equal(s.points, 100);
  assert.equal(s.timePoints, 100);
});
test("Uni runs at half rate", () => {
  assert.equal(day({ blocks: [peacock(60)] }).points, 50);
  assert.equal(day({ blocks: [peacock(120)] }).points, 100);
});
test("time scores linearly", () => assert.equal(day({ blocks: [red(30)] }).points, 50));
test("an unproductive colour contributes no points AND no minutes", () => {
  const s = day({ blocks: [{ minutes: 480, colorId: "5", state: "adhered" }] });
  assert.equal(s.points, 0);
  assert.equal(s.minutes, 0);
});
test("each non-negotiable is 25", () => {
  assert.equal(POINTS_PER_HABIT, 25);
  assert.equal(day({ habitsDone: 4 }).points, 100);
});
test("each workout is 100 regardless of duration", () => {
  assert.equal(POINTS_PER_WORKOUT, 100);
  assert.equal(day({ workouts: 2 }).points, 200);
});
// The property the feature turns on — the DELIBERATE inversion of the ring cap.
test("the score is UNCAPPED", () => {
  const s = day({ blocks: [red(360), peacock(120)], habitsDone: 5, workouts: 3 });
  assert.equal(s.points, 1125);
  assert.ok(s.points > 100);
});
test("only adhered blocks count as time spent", () => {
  for (const st of ["drifted", "skipped", null]) assert.equal(day({ blocks: [red(60, st)] }).points, 0);
});
test("dismissed never counts", () => assert.equal(day({ blocks: [red(60, "dismissed")] }).points, 0));
test("a mixed day counts only the adhered minutes", () => {
  const s = day({ blocks: [red(60), red(60, "drifted")] });
  assert.equal(s.minutes, 60);
  assert.equal(s.points, 100);
});
test("the parts always sum to the total", () => {
  const s = day({ blocks: [red(45), peacock(25)], habitsDone: 3, workouts: 1 });
  assert.equal(s.timePoints + s.habitPoints + s.workoutPoints, s.points);
});
test("points are whole numbers", () => {
  assert.equal(day({ blocks: [red(45)] }).points, 75);
  assert.equal(day({ blocks: [peacock(25)] }).points, 21); // 20.83 rounds
});
test("weighted minutes are reported alongside raw", () => {
  const s = day({ blocks: [red(60), peacock(60)] });
  assert.equal(s.minutes, 120);
  assert.equal(s.weightedMinutes, 90);
  assert.equal(s.timePoints, 150);
});
test("the rate table is well formed", () => {
  const ids = CALENDAR_RATES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  for (const c of CALENDAR_RATES) assert.ok(c.rate >= 0 && c.rate <= 1);
});
// Unlike adherence, zero here is a TRUE statement. Do not "fix" it to null.
test("an empty day scores a real zero", () => {
  const s = day();
  assert.equal(s.points, 0);
  assert.equal(s.timePoints, 0);
});
```

- [ ] **Step 2:** `npm test` → fails, module not found.

- [ ] **Step 3: Write `src/lib/productivity.ts`**

```ts
// Per-day productivity. PURE — no DB, no React, zero imports.
//
// A DELIBERATE, OWNER-APPROVED EXCEPTION to CLAUDE.md's "output is never scored" — see
// the Productivity section there. It scores HOURS SPENT, never results produced.
//
// UNCAPPED and comparative, the inverse of the ring rule, and therefore never drawn as
// a ring. It feeds nothing. Adherence remains the hero.

export type ColorId = string | null;
export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

export const POINTS_PER_HOUR = 100;
export const POINTS_PER_HABIT = 25;
export const POINTS_PER_WORKOUT = 100;
export const MINUTES_PER_HOUR = 60;

/** THE tuning knob, and the only one — retuning is a one-line change here, following the
 *  rings.ts METRICS precedent. Anything unlisted scores ZERO; an unrecognised colour must
 *  never silently inherit a rate. */
export const CALENDAR_RATES: { id: ColorId; google: string; label: string; rate: number }[] = [
  { id: "11", google: "Tomato",  label: "Work", rate: 1 },
  { id: "7",  google: "Peacock", label: "Uni",  rate: 0.5 },
  { id: null, google: "default", label: "Uni",  rate: 0.5 },
];
export const UNLISTED_RATE = 0;

/** Which marks count as time spent. One place, so the rule is arguable in one line. */
export const COUNTED_STATES: readonly (BlockState | null)[] = ["adhered"];

export type ProductiveBlock = { minutes: number; colorId: ColorId; state: BlockState | null };
export type ProductivityInput = { blocks: ProductiveBlock[]; habitsDone: number; workouts: number };
export type ProductivityScore = {
  points: number; timePoints: number; habitPoints: number; workoutPoints: number;
  minutes: number; weightedMinutes: number;
};

export function rateFor(colorId: ColorId): number {
  const hit = CALENDAR_RATES.find((c) => c.id === colorId);
  return hit ? hit.rate : UNLISTED_RATE;
}

export function scoreDay(input: ProductivityInput): ProductivityScore {
  let minutes = 0, weightedMinutes = 0;
  for (const b of input.blocks) {
    if (!COUNTED_STATES.includes(b.state)) continue;
    const rate = rateFor(b.colorId);
    if (rate <= 0) continue;            // not productive time at all — not even raw minutes
    const m = Math.max(0, b.minutes);
    minutes += m;
    weightedMinutes += m * rate;
  }
  // Each part rounded independently so the parts always sum to the total exactly.
  const timePoints = Math.round((weightedMinutes / MINUTES_PER_HOUR) * POINTS_PER_HOUR);
  const habitPoints = input.habitsDone * POINTS_PER_HABIT;
  const workoutPoints = input.workouts * POINTS_PER_WORKOUT;
  return { points: timePoints + habitPoints + workoutPoints, timePoints, habitPoints, workoutPoints, minutes, weightedMinutes };
}
```

- [ ] **Step 4:** `npm test` → 18 new pass, 56 existing still pass. **Step 5:** commit.

---

## Task 3: `src/lib/eventColor.ts` — projecting a Google colour

Google's palette runs chroma 0.105–0.226, up to 2.3× the app's accent (0.0975). No per-colour "toning down" is safe. Throw away everything except hue:

```
project(googleHex): (L,C,H) = oklch(hex); Cout = C < 0.02 ? 0 : 0.045; return oklch(0.56, Cout, H)
```

`L = 0.56` is chosen precisely: at 0.58 the worst case is 4.18:1 with white and **fails The Chip Test**; at 0.56 the minimum is 4.55:1 and passes. Chroma 0.045 is 46% of the accent — a projected colour can never out-shout it.

**Hue rotation was tried and rejected:** rotating Flamingo (26°), Tomato (29°) and Tangerine (36°) out of the red band collapsed all three into one identical stroke, destroying the categorisation the feature exists to provide. Chroma clamping alone solves the "no red" problem — Tomato `#d60000` projects to `#8d6b65`, a dusty rose-brown one hue-degree from the app's own sanctioned "Rust".

- [ ] **Step 1: Write the table as a precomputed literal.** Eleven known inputs do not need a colour-space library on the client.

```ts
// PURE — zero imports. See The Foreign Hue Rule in DESIGN.md.
// Every value is oklch(0.56, 0.045, sourceHue), except Graphite which projects to a true
// grey. Verified >=3.90:1 against every app surface as a stroke and >=4.54:1 with white
// on top, so it is certified as both even though only the stroke ships.
export const GOOGLE_PROJECTED: Record<string, string> = {
  "1": "#6c738f",  // Lavender   "2": "#5e7d6b",  // Sage
  "3": "#806c86",  // Grape      "4": "#8d6b67",  // Flamingo
  "5": "#807356",  // Banana     "6": "#8d6c62",  // Tangerine
  "7": "#5d788d",  // Peacock    "8": "#747474",  // Graphite
  "9": "#6b7390",  // Blueberry  "10": "#617c68", // Basil
  "11": "#8d6b65", // Tomato — signal red in, dusty rose-brown out
};
/** null for the calendar default and for anything unrecognised: absence is the default,
 *  never a fourth state. */
export const projectedColour = (colorId: string | null): string | null =>
  colorId == null ? null : GOOGLE_PROJECTED[colorId] ?? null;
```

- [ ] **Step 2: Test** that every value matches `/^#[0-9a-f]{6}$/`, that all 11 ids are present, and that `projectedColour(null)` and `projectedColour("99")` are `null`.
- [ ] **Step 3:** commit.

---

## Task 4: Wire the score into `/api/adherence`

- [ ] **Step 1:** one range query for gym counts — `SELECT date, COUNT(*) AS n FROM gym_sessions WHERE date BETWEEN ? AND ? GROUP BY date`, every value through `Number()`.
- [ ] **Step 2: Keep `connected` from `getCalendarRange`** (the route currently discards it at `:40`). This gate is load-bearing — Google is presently 401ing, and without it every day would report a score built from habits and workouts while all calendar time silently read zero.

```ts
const productivity = connected
  ? scoreDay({ blocks: blocks.map((b) => ({ minutes: b.minutes ?? 0, colorId: b.colorId, state: b.state })), habitsDone, workouts: gymByDate.get(d) ?? 0 })
  : null;
```

- [ ] **Step 3: Do NOT add it to `DayView`.** The quarantine is enforced by data flow: the coach reads `getDayView`, so keeping the score off it makes it structurally invisible rather than merely discouraged.
- [ ] **Step 4:** verify by curl; **Step 5:** commit.

---

## Task 5: Sessions, not days

> **⚠️ Highest-risk task.** `src/lib/db/client.ts:78-81` runs on **every app boot** and unconditionally recreates the unique index. If the migration drops it and `client.ts` is unchanged, the next `next dev` silently restores it and the second save of the day throws `UNIQUE constraint failed`.

- [ ] **Step 1: Split the two jobs `unit` is doing.** `unit` is both the printed noun *and* the cap semantics, so renaming to "sessions" would silently drop strength/cardio out of the `rings.test.ts:108` guard. Add `perDayCapped: boolean` to `Metric` — `true` on `outreach` and `steps`, `false` on `strength`, `cardio`, `skills`, `misc`. Change `unit` to `"sessions"` on `strength` and `cardio` only. Update the now-false doc comment at `rings.ts:82`.

- [ ] **Step 2: Drive the query off `perDayCapped`** (`queries.ts:374-383`). This also **fixes an existing bug**: `misc` declares `unit: "sessions"` but is counted with `COUNT(DISTINCT date)`.

```ts
if (m.source === "gym") {
  const agg = m.perDayCapped ? "COUNT(DISTINCT date)" : "COUNT(*)";
  const r = await db.execute({ sql: `SELECT ${agg} AS n FROM gym_sessions WHERE kind=? AND date BETWEEN ? AND ?`, args: [m.workoutKind!, from, to] });
  out[m.key] = { count: num(r.rows[0].n), resolved: true };
  continue;
}
```

- [ ] **Step 3: Split `factLine`** (`rings.ts:238-247`) so `MetricRing` carries `fact` (`"6 of 8 sessions"`) and a separate `window` (`"day 9 of 14"`, null once the fortnight is full) — Task 9's row order needs them as two items. Also add `workoutKind?: WorkoutKind` to `MetricRing` so the UI can tell which rows get a Log button.

- [ ] **Step 4: Fix the tests.** `rings.test.ts:35,88,94` → `"sessions"`. `:108` guard → `if (!m.perDayCapped || m.required == null) continue;`. Add:

```ts
test("the gym metrics count SESSIONS — a second lift on a Tuesday is a second thing", () => {
  for (const k of ["strength", "cardio", "misc"]) assert.equal(METRICS.find((m) => m.key === k)!.perDayCapped, false);
});
```

- [ ] **Step 5:** `npm test` — verify the semantics before a byte of data moves. This is the point of the zero-import rule.

- [ ] **Step 6: Rewrite the engine**

```ts
export type Workout = { id: number; kind: WorkoutKind; title: string | null; note: string | null };
export async function workoutsOn(db: Client, date: string): Promise<Workout[]>
//   SELECT id,kind,title,note FROM gym_sessions WHERE date=? ORDER BY kind, id
export async function saveWorkout(db: Client, w: { id?: number | null; date: string; kind: WorkoutKind; note: string }): Promise<number>
//   id => UPDATE … WHERE id=? AND date=? AND kind=?  (the date+kind guard stops a stale
//         client id rewriting another day); rowsAffected===0 falls through to INSERT
//   else INSERT -> Number(lastInsertRowid)
export async function deleteWorkout(db: Client, id: number): Promise<boolean>
//   DELETE FROM gym_sessions WHERE id=? AND title IS NULL   (imported history protected)
```
**Delete `setGymSession` (`engine.ts:504-523`) entirely** — dead, and a second `ON CONFLICT(date,kind)` that would hard-fail once the index goes. Rewrite the section header at `:497-500`, which asserts the per-day cap.

- [ ] **Step 7: Widen `/api/gym`** — `POST { date, kind, note, id? }` → `{ id, workouts }`; `DELETE ?id=&date=`, id required. `/api/rings` needs no change.

- [ ] **Step 8: Change the index in BOTH places.** `scripts/migrate.mjs`, a new `round4_v1` latched block (copy the `round2_v1` shape at `:299-349`) dropping `idx_gym_sessions_date_kind` and creating a plain `idx_gym_sessions_date`, plus the calorie back-fill from Task 6. **And replace `src/lib/db/client.ts:78-81`** with the same DROP/DROP/CREATE, commented: *"DROPPED here rather than merely unused — this runs on every boot, so leaving the CREATE would re-add it and start failing the second save of the day."*

Leave `round2_v1` untouched; rewriting applied history is worse than a redundant statement.

- [ ] **Step 9:** commit (migration runs in Task 7).

---

## Task 6: Calories as a log

**Why a new table.** `health_logs.date` is a PRIMARY KEY and the table is the phone's *idempotent* per-day landing zone — a re-post must revise, not accumulate. One column accumulating while its siblings overwrite is a trap for whoever writes `/api/health`. And `meals` was explicitly **dropped** by `adherence_v1`; its `name TEXT NOT NULL` would force fake data. A log with a derived total is `skill_time`'s exact precedent, whose comment already argues it: *"Kept as a log rather than a running total so a mistaken entry can be removed."*

- [ ] **Step 1: `schema.sql`**

```sql
-- Calories through the day. A LOG, not a total: 400 then 800 reads 1200, and a mistyped
-- entry is removed rather than retyped. The total is DERIVED on read, so it can never
-- drift out of step with the entries that define it.
-- Deliberately NOT health_logs.calories: that is the phone's idempotent per-day snapshot,
-- where a re-post must REVISE. Still no food database, no barcode, no API.
CREATE TABLE IF NOT EXISTS calorie_entries (
  id INTEGER PRIMARY KEY,
  date TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  kcal INTEGER NOT NULL CHECK (kcal > 0),
  note TEXT,
  source TEXT NOT NULL DEFAULT 'manual',
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE INDEX IF NOT EXISTS idx_calorie_entries_date ON calorie_entries(date);
```

- [ ] **Step 2:** `addCalories(db, date, kcal, note?)` → id; `deleteCalorieEntry(db, id)` → boolean. **Delete `setDailyCalories`** — two truths is worse than one.
- [ ] **Step 3:** one shared reader `caloriesForDate(db, date) → { total: number|null; entries: CalorieEntry[] }`, used by both `getDayView` and the route so they cannot diverge. `SUM`/`COUNT` through `num()`. `total` stays `null` when there are no entries, preserving the "—" rendering.
- [ ] **Step 4:** `POST { date, kcal }` 1–20000 → `{ id, total, entries }`; `DELETE ?id=` → `{ removed, total, entries }`. Removable **by id, not "undo last"** — after 400/800/300 the one you want gone is usually not the last.
- [ ] **Step 5: Add `"calorie_entries"` to `TABLES` in `scripts/db-copy.mjs`.** Without it that script **hard-fails**. Leave `meals` in `INTENTIONALLY_SKIPPED`.
- [ ] **Step 6:** commit.

---

## Task 7: Run the migration

**Only after Tasks 1–6 are committed and `npm test` + `npx tsc --noEmit` pass.** Code ships before data moves.

- [ ] **Step 1: Stop the dev server** — `ensure()` would recreate the index mid-flight.
- [ ] **Step 2: Checkpoint and back up** (manual; no backup logic exists)

```bash
sqlite3 data/dashboard.db "PRAGMA wal_checkpoint(TRUNCATE);"
mkdir -p data/backups && TS=$(date +%Y%m%d-%H%M%S)
for f in dashboard.db dashboard.db-wal dashboard.db-shm; do [ -f "data/$f" ] && cp "data/$f" "data/backups/$f.$TS.pre-round4.bak"; done
```

- [ ] **Step 3:** record row counts for `gym_sessions`, `block_marks`, `health_logs`, `habit_entries`, `journal_entries`, `skill_time`, `google_oauth_tokens`.
- [ ] **Step 4: Confirm with the owner.** `CLAUDE.md` requires it.
- [ ] **Step 5:** `npm run db:migrate`
- [ ] **Step 6:** `PRAGMA index_list(gym_sessions)` → **no `unique=1` row**; row counts unchanged; `calorie_entries` count == `health_logs` rows with `calories > 0`.
- [ ] **Step 7: Start the app, load a page, re-check the index.** This catches a missed `client.ts` edit. If the unique index is back, stop.
- [ ] **Step 8: Smoke test** — two Strength sessions on one date → `2`; delete one by id → `1`, the other keeps its note; 400 then 800 → 1200; delete the 400 → 800.

---

## Task 8: The surface ramp, masthead and three windows

**Files:** `globals.css` · `Today.tsx` · `layout.tsx`

- [ ] **Step 1: Tokens** (`@theme`)

```css
/* THE SURFACE RAMP. Five steps at hue 82.4, chroma rising as lightness falls.
 *
 * --color-bg IS NOT MOVED. Darkening the page to open up range costs two
 * certifications: at oklch(0.9230) --color-muted falls to 4.46:1 and --color-skipped to
 * 4.32:1, both under the floor. The range is taken UPWARD, with one step down for the
 * masthead. --color-bar sits at oklch(0.9290), just above the muted floor (0.9268), so
 * every existing ink token stays usable on it without re-certification.
 *
 * The three window tones differ by 1.03-1.07:1 — at or below the 1.04:1 the
 * Legible-Empty Rule documents as invisible. THAT IS INTENDED: the 1px hairline and the
 * page-ground gutter separate the windows; the tone only identifies which one you are in.
 *
 * --color-skipped is 4.39:1 on --color-bar and FAILS. No block-state chip in the band. */
--color-bar: #ede7db;       /* masthead — the one step down */
--color-surface-1: #fdfbf8; /* TODAY    — the hero, lightest */
--color-surface-2: #f9f7f3; /* CALENDAR — the days around it */
--color-surface-3: #f7f3ee; /* PILLARS  — the fortnight behind */

/* Recorded vs not-yet. "Colder" WITHOUT A NEW HUE: every neutral here carries chroma
 * 0.013-0.028 at hue ~82, so a surface at the SAME hue with chroma driven to ~0.003
 * reads cool by simultaneous contrast against its warm neighbours. Lightness carries the
 * meaning a second time and position a third, so nothing rides on chroma alone. */
--color-recorded: #fdefdc;  /* past & completed rows */
--color-ahead: #fcfbf9;     /* upcoming rows */
```

Measured, every shipping pairing: ink 13.18–15.71 ✓, muted 4.53–5.41 ✓ on all five surfaces.

- [ ] **Step 2: The masthead.** Replace the date header. Title `font-serif text-heading` (a page heading, which the Author Rule already assigns to the serif) — **not** `text-hero`, which is reserved for the adherence numeral; a masthead outsizing the hero would invert the hierarchy. Date demotes to `text-micro` muted and moves right. Not sticky: the desktop columns scroll inside the viewport so it never leaves, and on mobile a sticky band plus the fixed tab bar would eat ~112px of a 390px screen.

```
Look Into My Life by Nero              Thursday 6 August    colours
```

- [ ] **Step 3:** `layout.tsx` `themeColor` → `#ede7db` (the topmost painted surface).

- [ ] **Step 4: Three windows.** Drop `lg:gap-0` → `lg:gap-4`; remove `lg:border-l` and the `lg:px-10` padding; each column gets `rounded-2xl border border-[var(--color-line)] p-5 lg:p-6` plus its surface. Radius 16px is the existing panel radius — do not invent a new one. Width cost measured at `max-w-[92rem]`: under 4%; the grid template does not change.

- [ ] **Step 5: Replace the `colScroll` magic number.** `lg:max-h-[calc(100dvh-8.5rem)]` is tuned to the old header and will be wrong. Make the shell `lg:flex lg:h-dvh lg:flex-col`, the grid `lg:min-h-0 lg:flex-1`, each column `lg:h-full lg:overflow-y-auto`. This stops the next masthead change silently breaking scrolling.

- [ ] **Step 6: Verify** at 1536px and at 402px (window resizing is blocked by DPI scaling on this machine — use the same-origin iframe probe). No horizontal overflow; every muted string ≥4.5:1 against its *actual* computed background.

---

## Task 9: Calendar column and the Log-button row

- [ ] **Step 1: Delete both opacity veils** — `CalendarColumn.tsx:82` (0.65) and `Today.tsx:203` (0.45). Layering tints over an opacity veil makes every contrast number a composite and unauditable; the file's own comment already records that muted under the veil composites to 2.5:1. Carry quietness in explicit tokens instead.
- [ ] **Step 2: Row surfaces** — today transparent (the card *is* today's ground, which is why it reads live), past `--color-recorded`, ahead `--color-ahead`, with `-mx-3 px-3 rounded-lg` bleed matching the existing hover idiom.
- [ ] **Step 3: Greying** — today's label ink/600, everything else `--color-muted` (worst case 4.93:1 on recorded ✓). **Add no third ink token**: a level between ink and muted is what a severity ramp looks like in greyscale.
- [ ] **Step 4: The one gradient.** Masked pseudo-element — `border-image` ignores `border-radius` and squares the corners, which is disqualifying here.

```css
.today-mark { position: relative; border-radius: 10px; }
.today-mark::before {
  content: ""; position: absolute; inset: 0; border-radius: inherit; padding: 1.5px;
  /* The column runs chronologically downward, so 180deg IS the direction of time. */
  background: linear-gradient(180deg, var(--color-accent) 0%,
    color-mix(in oklab, var(--color-accent) 55%, transparent) 46%,
    color-mix(in oklab, var(--color-accent) 0%, transparent) 100%);
  -webkit-mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
          mask: linear-gradient(#000 0 0) content-box, linear-gradient(#000 0 0);
  -webkit-mask-composite: xor; mask-composite: exclude; pointer-events: none;
}
```
Composited and measured: top edge 4.39:1 (a deliberate accent stroke, clears the 3:1 stroke floor), 1.46:1 at 70% down (exactly `--color-line-strong`'s own weight), gone at the bottom — where tomorrow begins. Nothing animates, so no reduced-motion path is needed.

- [ ] **Step 5: Event accents** — `projectedColour(colorId)` as a **2px vertical rule** on the left edge of the title cell, inside the `.page-margin` gutter. The state dot is unchanged, so form carries status and position carries category; they can never be confused. No `colorId` → no rule.
- [ ] **Step 6: The Log-button row** (`PillarSections.tsx`) — delete the "Log workout" header and chip block at `:151-194`; move `<WorkoutLog>` out of that branch. Row becomes `[ring] [label] [Log] ————— [fact] [window]`. The Log button is a **ghost pill** (`rounded-full border px-2.5 py-1 text-micro`), never filled when logged — this is an *action*, not a state display, and the count beside it already says whether anything was logged. Gate on `workoutKind`. Right-hand group needs `flex flex-wrap justify-end` — measured, `"day 9 of 14"` does not fit on one line in the 269px right column.
- [ ] **Step 7: Skills** — delete the free-text `<form>` (`:364-404`) and the `mins` state. **Relocate the `undo` button (`:394-403`), which lives inside that form** and would otherwise vanish. Delete the now-false comment at `:365-366`.

---

## Task 10: The strip

Gated on Task 0 being committed. New structure: score numeral · bar track + polyline · baseline rule · weekday letter · title. `h-14` → `h-20`; verify the hero still fits above the fold on a 900px viewport.

- [ ] **Step 1: The numeral** — `text-micro tabular-nums`, ink today, muted otherwise. Sans, not serif: a count the app computed, not something the owner wrote.
- [ ] **Step 2: The line — in INK, not the accent.** This is the most important choice here. Ink on surface-1 is 15.71:1, crossing an amber bar 3.46:1, over accent-soft 12.92:1 — all clear. The accent would give the app a second amber quantity and make adherence and productivity indistinguishable at a glance. Graphite over amber: the line is drawn *on* the chart, the bars *are* the chart. `<svg viewBox="0 0 100 100" preserveAspectRatio="none">` with `vectorEffect="non-scaling-stroke"` so the 1.5px stroke does not stretch; a 2.5px dot per vertex.
- [ ] **Step 3: The line stops at today.** A polyline running into days that have not happened would draw a prediction, which this app does not make.
- [ ] **Step 4: No animation.** `points` is neither transform nor opacity, so the Transform-Only Rule forbids it. Do **not** reach for `stroke-dasharray` — that is reserved for ring arcs and would make the line look like it is being drawn, i.e. celebrated.
- [ ] **Step 5: One label** — `productivity · to this week's high`, `text-micro` muted. The real number must never be hidden by a scaling, so the scaling is said out loud.
- [ ] **Step 6: Inline titles.** Measured: ~68px per bar at 80px tall gives ~27 characters over 3 centred lines — enough for "Deep work", "Uni exam". Bar becomes a `<button>`; empty state shows a centred `+` on hover and focus-visible only (a permanent `+` on four bars is four pieces of chrome under the hero). Tap swaps to a bare centred serif input — the owner's words — committing on Enter/blur, reverting on Escape. Needs a `day_titles(date PRIMARY KEY, title)` table and route.
- [ ] **Step 7: Mobile.** At 390px each bar is ~37px — a centred wrapped title is unusable. Below `lg`, render titled upcoming days as a `.page-margin` list *beneath* the weekday letters, weekday in the margin, serif title beside it. Same data, same commit path, one `hidden lg:block` / `lg:hidden` pair.

---

## Task 11: Two-pane workout dialog and additive calories

- [ ] **Step 1:** dialog `w-[min(94vw,920px)]`; body `lg:grid lg:grid-cols-[1.35fr_1fr]` with a 1px rule between panes, not a gap — one document, two columns.
- [ ] **Step 2:** left pane is the existing textarea **unchanged in every respect** — serif, tabular, `rows={14}`, autofocused. The writing surface's bordered page is explicitly protected.
- [ ] **Step 3:** right pane, last 5 sessions of that kind on `--color-panel-2` (recessed = archive), `.section-head` reading `Last 5`, each a `.page-margin` row with the date in the margin. **Read-only** — imported history is irreplaceable.
- [ ] **Step 4:** each pane `overflow-y-auto max-h-[min(60dvh,480px)]`; do **not** scroll the body as one. Below `lg`, stack with history behind a quiet toggle so the phone opens straight into the textarea. Needs `GET /api/gym/recent?kind=&limit=5`.
- [ ] **Step 5: Calories** — running total in `text-body tabular-nums` **ink** (it is the value now, not a field's contents), input narrows to `w-[3.5rem]` with a `+` placeholder. **A quiet `undo` is mandatory**: a mistyped 20000 in an additive field is otherwise unrecoverable, and a field you are afraid to touch is a field you stop using — which is exactly the honest-logging failure the constitution exists to prevent.

---

## Verification

```bash
npm test && npx tsc --noEmit && npm run build
```

**Manual — owner must reconnect Google at `/api/google/connect` first**

1. **Score.** 1h red + 1h peacock, both adhered, 2 non-negotiables, 1 workout → `100+50+50+100 = 300`.
2. **Uncapped.** A heavy day reads well above 100 and is not clamped.
3. **Quarantine.** `curl /api/today | grep -i productivity` → **no match**.
4. **Sessions.** Two Strength on one date → `2 of 8 sessions`; delete one → `1`.
5. **Calories.** 400 then 800 → 1200; remove the 400 → 800; `undo` works.
6. **Degradation.** Disconnect Google → every score reads "—", adherence still works.
7. **Audited claims.** DevTools: shadow count still **zero**, gradient count exactly **one**, nothing new transitions a layout property.
8. **Contrast sweep** across `/`, `/goals`, `/habits`, `/colours`: every text node ≥4.5:1 against its actual computed background — especially on `--color-bar`.
9. **Mobile** at 402px via the iframe probe: three window surfaces as tabs, the mobile title list, the stacked dialog, the Log row.

---

## Risks

| # | Risk | Severity | Mitigation |
|---|---|---|---|
| 1 | `client.ts` recreates the unique index on next boot, undoing the migration | **Critical** | Same-commit edit; Task 7 Step 7 re-checks *after* a page load |
| 2 | `saveWorkout`'s `ON CONFLICT(date,kind)` hard-fails once the index is gone | **Critical** | Code and index ship together; never migrate ahead of code |
| 3 | `setGymSession` is a second, dead `ON CONFLICT` landmine | High | Delete it |
| 4 | `db-copy.mjs` hard-fails without `calorie_entries` in `TABLES` | High | One-line addition |
| 5 | BigInt on `COUNT(*)` / `SUM(kcal)` | High | Every aggregate through `num()` |
| 6 | `--color-skipped` fails on the masthead (4.39:1) | Medium | No block-state chip in the band; contrast sweep |
| 7 | Three window tones read as identical rather than subtly distinct | Medium | Stated honestly above; escalation is raising chroma, a separate decision to take *after* looking |
| 8 | Google 401 leaves every score null | Medium | Owner reconnects; the `connected` gate makes the failure honest rather than wrong |
| 9 | Recolouring an old event rewrites its historical score | Medium | Accepted by the owner; live computation, one source of truth |
| 10 | Double-submit duplicates a gym row with no unique index | Medium | Id-addressed save + the existing `busy` guard |
| 11 | `h-20` strip pushes the hero below the fold on a short laptop | Medium | Verify at 900px before committing |
| 12 | `health_logs.calories` becomes unread; a future `/api/health` push silently no-ops | Low | Record in HANDOFF; `calorie_entries.source` is the landing spot |

**Sequencing note.** Tasks 8, 9 (steps 1–4, 6–7) and 11 are pure front-end and can ship without any backend. Tasks 9 step 5 (event accents) and 10 (the strip) are gated on Tasks 1–4.

---

## Final step: update `docs/HANDOFF.md`

§1 rows for *Workout types* and *Calories*; §2 gains `productivity.ts` and `eventColor.ts` plus the widened routes; §3 notes `health_logs.calories` is now unread; §5 drops the Google 401 note once reconnected. Note also that this change set roughly doubles what is unverified on the actual phone.
