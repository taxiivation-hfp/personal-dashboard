# Goals, Skills Window & Pillar Rings — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Make goals and subgoals editable and tickable, replace the skills lifetime total with a rolling 14-day window plus a logging affordance, and add capped sufficiency rings for the three pillars.

**Architecture:** Two new pure modules (`src/lib/rings.ts`, `src/lib/goals.ts`) hold all the maths with zero imports, so they run under `node --test` with no dependencies. `queries.ts` reads, `engine.ts` writes transactionally, routes expose them, and `Today.tsx` becomes the owner of goals/skills/rings client state so the new controls can refresh. One guarded migration block adds `gym_sessions`, wires a `system_key`, and stamps a rings start date.

**Tech Stack:** Next.js 16 (Turbopack) · React 19 · Tailwind v4 · libSQL · TypeScript 6 · Node 24 (`node --test`, native TS type-stripping)

**Source spec:** `docs/superpowers/specs/2026-08-05-goals-skills-rings-design.md` — read it before starting. It carries the reasoning; this document carries the steps.

## Global Constraints

- **Adherence, not accomplishment.** Output is never scored. No XP, levels, points, or progression anywhere.
- **Honest logging outranks everything.** Nothing may make truthful marking feel costly. No red, no shame copy, no "failed" states.
- **Goal progress is quarantined.** It feeds nothing — not adherence, not the streak, not the rings, not the coach.
- **A ring caps at its threshold.** `min(1, count / required)`. No overfill, no bonus for excess, ever.
- **All writes live in `src/lib/engine.ts`**, in transactions. `queries.ts` is reads only.
- **Preserve data.** Migrate, never drop. The migration in Task 5 is confirmed with the owner before running.
- **Two font weights only** — 400 and 600. No `font-medium`. Never introduce a third.
- **No red anywhere.** Accent is `var(--color-accent)`; pillar strokes are `--color-social` / `--color-physical` / `--color-portfolio` from `src/app/globals.css:38-41`.
- **Do not import `src/components/Rings.tsx` or `src/lib/pillars.ts`.** Both are dead (HANDOFF §3) and carry the old dark-theme palette and a third font weight.
- **Window is 14 days inclusive**: `from = addDays(anchor, -13)`, SQL `BETWEEN ? AND ?`.
- `null` never renders as `0`. A missing source and a genuine zero are different states.

---

## File Structure

**Create**
| Path | Responsibility |
|---|---|
| `src/lib/rings.ts` | Metric registry + fill maths. Pure, zero imports. |
| `src/lib/rings.test.ts` | Ring maths tests. |
| `src/lib/goals.ts` | Subgoal weight derivation. Pure, zero imports. |
| `src/lib/goals.test.ts` | Weight derivation tests. |
| `src/lib/dates.test.ts` | `daysBetween` tests. |
| `src/components/PillarRing.tsx` | One SVG ring. Both species (adherence + pillar). |
| `src/components/PillarSections.tsx` | Right column: three pillar sections. Replaces `GoalsSkills.tsx`. |
| `src/app/goals/page.tsx` | `/goals` editor screen. |
| `src/components/GoalEditor.tsx` | Editor UI used by `/goals` only. |
| `src/app/api/rings/route.ts` | GET ring counts + fills. |
| `src/app/api/subgoals/route.ts` | POST create subgoal. |
| `src/app/api/subgoals/[id]/route.ts` | PATCH / DELETE subgoal. |
| `src/app/api/skills/[id]/time/route.ts` | POST log time / DELETE undo. |
| `src/app/api/gym/route.ts` | POST / DELETE today's gym session. |

**Modify**
| Path | Change |
|---|---|
| `package.json` | Add `test` script. |
| `tsconfig.json` | Add `allowImportingTsExtensions`. |
| `src/lib/dates.ts` | Add `daysBetween`. |
| `src/lib/db/schema.sql` | Add `gym_sessions`. |
| `scripts/migrate.mjs` | Add `rings_v1` guarded block. |
| `scripts/db-copy.mjs` | Add 3 missing tables to `TABLES`. |
| `src/lib/queries.ts` | `effectiveWeight`, 14-day skill figures, `getRingCounts`; drop `pillarAdherence`; re-export `PillarKey`; move `updateGoal` out. |
| `src/lib/engine.ts` | Goal/subgoal writes, skill time writes, gym writes. |
| `src/app/api/goals/route.ts`, `src/app/api/goals/[id]/route.ts` | Rewrite. |
| `src/app/page.tsx` | Pass rings; keep goals/skills props. |
| `src/components/Today.tsx` | Own goals/skills/rings state; adherence ring; mobile ring row; delete chips. |
| `docs/HANDOFF.md`, `CLAUDE.md` | Update §2/§3; amend the steps cut. |

**Delete** — `src/components/GoalsSkills.tsx` (superseded by `PillarSections.tsx`), in Task 13.

---

## Task 1: Safety net and test harness

Nothing else may start until this is done. There is no version history for any existing work, and Task 5 touches irreplaceable data.

**Files:**
- Modify: `package.json`
- Modify: `tsconfig.json`
- Create: `src/lib/dates.test.ts` (throwaway probe, replaced properly in Task 2)

**Interfaces:**
- Consumes: nothing
- Produces: a working `npm test`; a git repo; a verified DB backup

- [ ] **Step 1: Look at the current app on the phone**

Start it and open it on the iPhone. It has **never been seen running** (HANDOFF §5). Confirm the three-column layout, the calendar column and the 7-day strip look sane.

```bash
npm run dev
```

This is not optional and it is not busywork: it is the only way later breakage is unambiguously *new*. Note anything already wrong before touching code.

- [ ] **Step 2: Back up the database**

```bash
mkdir -p data/backups
cp data/dashboard.db      "data/backups/dashboard.db.$(date +%Y%m%d-%H%M%S).bak"
cp data/dashboard.db-wal  "data/backups/dashboard.db-wal.$(date +%Y%m%d-%H%M%S).bak" 2>/dev/null || true
cp data/dashboard.db-shm  "data/backups/dashboard.db-shm.$(date +%Y%m%d-%H%M%S).bak" 2>/dev/null || true
ls -la data/backups/
```

Expected: a new `.bak` at least as large as `data/dashboard.db`. The `-wal` and `-shm` files may not exist; that is fine.

- [ ] **Step 3: Initialise git**

`.gitignore` already exists and already excludes `/data`, `/node_modules`, `/.next` and `.env*.local`, so no personal data or secrets can be committed.

```bash
git init
git add -A
git status --short | head -20
```

Expected: source files staged, **nothing** under `data/` or `.env.local`.

```bash
git commit -m "chore: initial commit of existing dashboard before goals/skills/rings work"
```

- [ ] **Step 4: Add the test script**

Verified empirically on this machine: Node 24 strips TypeScript types natively, and `node --test` globs the pattern itself when it is quoted, so this works through `npm test` on Windows with **zero new dependencies**.

In `package.json`, add to `"scripts"`:

```json
    "test": "node --test \"src/**/*.test.ts\"",
```

- [ ] **Step 5: Allow `.ts` import extensions**

Node requires the explicit `.ts` extension in relative imports; without this flag `tsc --noEmit` fails with **TS5097**. The flag is only valid alongside `noEmit`, which this project already sets.

In `tsconfig.json`, add to `"compilerOptions"`:

```json
    "allowImportingTsExtensions": true,
```

- [ ] **Step 6: Write a probe test**

Create `src/lib/dates.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays } from "./dates.ts";

test("harness runs and addDays works", () => {
  assert.equal(addDays("2026-08-05", -13), "2026-07-23");
});
```

- [ ] **Step 7: Run it**

```bash
npm test
```

Expected: `pass 1`, `fail 0`. A warning reading `Reparsing as ES module because module syntax was detected` is expected and harmless — do **not** add `"type": "module"` to `package.json` to silence it; that would change how Next's own config files are interpreted.

- [ ] **Step 8: Verify type-checking still passes**

```bash
npx tsc --noEmit
```

Expected: exit 0, no TS5097.

- [ ] **Step 9: Commit**

```bash
git add package.json tsconfig.json src/lib/dates.test.ts
git commit -m "chore: add node --test harness and allow .ts import extensions"
```

---

## Task 2: `daysBetween` in `dates.ts`

Needed by the day-one rule (spec §3.6) to know how much of the 14-day window has actually been observed.

**Files:**
- Modify: `src/lib/dates.ts`
- Test: `src/lib/dates.test.ts`

**Interfaces:**
- Consumes: `addDays` from Task 1's probe
- Produces: `daysBetween(a: string, b: string): number` — whole days from `a` to `b`, negative when `b` is earlier

- [ ] **Step 1: Write the failing tests**

Replace the whole of `src/lib/dates.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween } from "./dates.ts";

test("addDays walks back 13 days for a 14-day inclusive window", () => {
  assert.equal(addDays("2026-08-05", -13), "2026-07-23");
});

test("daysBetween counts whole days forward", () => {
  assert.equal(daysBetween("2026-07-23", "2026-08-05"), 13);
});

test("daysBetween is zero for the same day", () => {
  assert.equal(daysBetween("2026-08-05", "2026-08-05"), 0);
});

test("daysBetween is negative when b is earlier", () => {
  assert.equal(daysBetween("2026-08-05", "2026-08-01"), -4);
});

test("daysBetween crosses a month boundary", () => {
  assert.equal(daysBetween("2026-07-31", "2026-08-01"), 1);
});

// Melbourne DST ends 2026-04-05 and starts 2026-10-04. Calendar-day arithmetic must
// ignore both — a 23-hour or 25-hour day is still one day.
test("daysBetween is DST-immune across the April transition", () => {
  assert.equal(daysBetween("2026-04-04", "2026-04-06"), 2);
});

test("daysBetween is DST-immune across the October transition", () => {
  assert.equal(daysBetween("2026-10-03", "2026-10-05"), 2);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: FAIL — `The requested module './dates.ts' does not provide an export named 'daysBetween'`.

- [ ] **Step 3: Implement**

Append to `src/lib/dates.ts`, directly beneath `addDays`:

```ts
/**
 * Whole days from `a` to `b` (i.e. b − a). Negative when `b` is earlier.
 *
 * UTC math on the date parts, exactly as addDays does — a millisecond subtraction on
 * parsed LOCAL dates would be off by one across a DST transition, and Melbourne has two
 * a year.
 */
export function daysBetween(a: string, b: string): number {
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test
```

Expected: `pass 7`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/dates.ts src/lib/dates.test.ts
git commit -m "feat: add daysBetween date helper with DST-safe calendar arithmetic"
```

---

## Task 3: `src/lib/goals.ts` — weight derivation

**Files:**
- Create: `src/lib/goals.ts`
- Test: `src/lib/goals.test.ts`

**Interfaces:**
- Consumes: nothing (zero imports — this is what makes it testable)
- Produces:
  - `type WeightedSubgoal = { weight: number; done: boolean }`
  - `type WeightBreakdown = { effective: number[]; progress: number; overrideSum: number; overAllocated: boolean }`
  - `deriveWeights(subgoals: WeightedSubgoal[]): WeightBreakdown`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/goals.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveWeights } from "./goals.ts";

const close = (a: number, b: number) => assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("all-auto subgoals split evenly", () => {
  const r = deriveWeights([
    { weight: 0, done: true },
    { weight: 0, done: true },
    { weight: 0, done: false },
    { weight: 0, done: false },
  ]);
  r.effective.forEach((w) => close(w, 0.25));
  close(r.progress, 0.5);
  assert.equal(r.overAllocated, false);
});

test("the eight seeded subgoals keep their explicit weights", () => {
  const r = deriveWeights([
    { weight: 0.3, done: true },
    { weight: 0.25, done: true },
    { weight: 0.25, done: false },
    { weight: 0.2, done: false },
  ]);
  assert.deepEqual(r.effective, [0.3, 0.25, 0.25, 0.2]);
  close(r.progress, 0.55);
});

test("autos split only what the overrides leave behind", () => {
  const r = deriveWeights([
    { weight: 0.4, done: false },
    { weight: 0, done: false },
    { weight: 0, done: false },
  ]);
  close(r.effective[0], 0.4);
  close(r.effective[1], 0.3);
  close(r.effective[2], 0.3);
});

test("progress is 0 with no subgoals and nothing is over-allocated", () => {
  const r = deriveWeights([]);
  assert.equal(r.progress, 0);
  assert.deepEqual(r.effective, []);
  assert.equal(r.overAllocated, false);
});

// The one genuinely broken case. An all-auto goal must NOT trip this — under the old
// weightSum test it would have warned "weights total 0%, not 100%" on a well-formed goal.
test("overAllocated fires only when explicit overrides exceed 100%", () => {
  assert.equal(deriveWeights([{ weight: 0, done: false }]).overAllocated, false);
  assert.equal(deriveWeights([{ weight: 0.6, done: false }, { weight: 0.6, done: false }]).overAllocated, true);
});

test("over-allocation leaves autos with nothing rather than a negative share", () => {
  const r = deriveWeights([
    { weight: 0.7, done: false },
    { weight: 0.7, done: false },
    { weight: 0, done: true },
  ]);
  close(r.effective[2], 0);
  close(r.progress, 0);
});

test("progress never exceeds 1 even when overrides do", () => {
  const r = deriveWeights([
    { weight: 0.8, done: true },
    { weight: 0.8, done: true },
  ]);
  close(r.progress, 1);
});

test("a negative weight is treated as auto, not as a subtraction", () => {
  const r = deriveWeights([{ weight: -0.5, done: false }, { weight: 0, done: false }]);
  close(r.effective[0], 0.5);
  close(r.effective[1], 0.5);
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module './goals.ts'`.

- [ ] **Step 3: Implement**

Create `src/lib/goals.ts`:

```ts
// Goal progress. PURE — no DB, no React, zero imports, so it runs under `node --test`.
//
// Progress is the SUM OF COMPLETED SUBGOAL WEIGHTS. Nothing is inferred from activity
// and no count of finished tasks feeds it — that would be an output measure, which this
// app does not keep.
//
// weight = 0 means AUTO: the subgoal takes an equal share of whatever the explicit
// overrides leave behind. 0 is already the column default in schema.sql and already
// passes its CHECK, and a subgoal explicitly worth 0% is meaningless — so the value is
// free to carry this meaning and no migration is needed.

export type WeightedSubgoal = { weight: number; done: boolean };

export type WeightBreakdown = {
  /** Parallel to the input. What each subgoal is actually worth right now. */
  effective: number[];
  /** 0..1. */
  progress: number;
  overrideSum: number;
  /** True ONLY when explicit overrides exceed 100% — the one genuinely broken case.
   *  An all-auto goal is well-formed and must never warn. */
  overAllocated: boolean;
};

export function deriveWeights(subgoals: WeightedSubgoal[]): WeightBreakdown {
  // A negative weight is treated as auto rather than as a subtraction: the column's
  // CHECK forbids it, so if one ever appears it is corruption, and silently reducing a
  // goal's progress would be the worst possible response.
  const isOverride = (w: number) => w > 0;

  const overrideSum = subgoals.reduce((s, x) => s + (isOverride(x.weight) ? x.weight : 0), 0);
  const autoCount = subgoals.filter((x) => !isOverride(x.weight)).length;
  const autoShare = autoCount > 0 ? Math.max(0, 1 - overrideSum) / autoCount : 0;

  const effective = subgoals.map((x) => (isOverride(x.weight) ? x.weight : autoShare));
  const done = subgoals.reduce((s, x, i) => s + (x.done ? effective[i] : 0), 0);

  return {
    effective,
    progress: Math.min(1, Math.max(0, done)),
    overrideSum,
    overAllocated: overrideSum > 1 + 1e-9,
  };
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test
```

Expected: `pass 15`, `fail 0`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/goals.ts src/lib/goals.test.ts
git commit -m "feat: add pure subgoal weight derivation with auto-weight support"
```

---

## Task 4: `src/lib/rings.ts` — registry and fill maths

The heart of the feature. Every rule that must not be got wrong lives here and is tested.

**Files:**
- Create: `src/lib/rings.ts`
- Test: `src/lib/rings.test.ts`

**Interfaces:**
- Consumes: nothing (zero imports)
- Produces:
  - `type PillarKey = "social_capital" | "physical" | "portfolio"` — **moved here** from `queries.ts`, which re-exports it in Task 6
  - `const WINDOW_DAYS = 14`
  - `type MetricSource`, `type Metric`, `const METRICS: Metric[]`
  - `type RawCount = { count: number; resolved: boolean }`
  - `type MetricRing`, `type PillarRingView`
  - `metricFill(count: number, required: number | null, hasSource: boolean): number | null`
  - `buildRings(counts: Record<string, RawCount>, observedDays: number): PillarRingView[]`

- [ ] **Step 1: Write the failing tests**

Create `src/lib/rings.test.ts`:

```ts
import { test } from "node:test";
import assert from "node:assert/strict";
import { METRICS, WINDOW_DAYS, buildRings, metricFill, type RawCount } from "./rings.ts";

const ok = (count: number): RawCount => ({ count, resolved: true });

/** All metrics resolved, with the given counts. */
function counts(over = {}): Record<string, RawCount> {
  const base: Record<string, RawCount> = {};
  for (const m of METRICS) base[m.key] = ok(0);
  return { ...base, ...over };
}

const find = (rings: ReturnType<typeof buildRings>, pillar: string, key: string) =>
  rings.find((p) => p.pillar === pillar)!.metrics.find((m) => m.key === key)!;

// ---------------------------------------------------------------- the cap

test("fill caps at 1 — doing more than the threshold changes nothing", () => {
  assert.equal(metricFill(8, 8, true), 1);
  assert.equal(metricFill(20, 8, true), 1);
});

test("the true count survives the cap in the fact line", () => {
  const r = find(buildRings(counts({ gym: ok(11) }), WINDOW_DAYS), "physical", "gym");
  assert.equal(r.fill, 1);
  assert.equal(r.count, 11);
  assert.equal(r.fact, "11 of 8 days");
});

test("partial fill is the plain ratio", () => {
  assert.equal(metricFill(4, 8, true), 0.5);
});

// ---------------------------------------------------------------- null, not zero

test("no source yields null, never 0 — the two must stay distinguishable", () => {
  assert.equal(metricFill(0, 8, false), null);
  assert.equal(metricFill(0, 8, true), 0);
});

test("a null required yields null rather than NaN or Infinity", () => {
  assert.equal(metricFill(3, null, true), null);
  assert.equal(metricFill(3, 0, true), null);
});

test("steps is dormant: sourceReady false, so it renders as a ghost", () => {
  const r = find(buildRings(counts(), WINDOW_DAYS), "physical", "steps");
  assert.equal(r.fill, null);
  assert.equal(r.fact, "no data source yet");
});

test("a sourceless metric is EXCLUDED from its pillar mean, not counted as 0", () => {
  // Physical = gym (live, full) + steps (ghost). If steps counted as 0 the pillar would
  // read 50% forever, which no behaviour could fix.
  const physical = buildRings(counts({ gym: ok(8) }), WINDOW_DAYS).find((p) => p.pillar === "physical")!;
  assert.equal(physical.fill, 1);
});

test("a pillar with no live metric is null, not NaN", () => {
  const c = counts();
  c.gym = { count: 0, resolved: false };
  const physical = buildRings(c, WINDOW_DAYS).find((p) => p.pillar === "physical")!;
  assert.equal(physical.fill, null);
});

test("an unresolved habit source is a ghost, not a zero", () => {
  const c = counts();
  c.outreach = { count: 0, resolved: false };
  const r = find(buildRings(c, WINDOW_DAYS), "social_capital", "outreach");
  assert.equal(r.fill, null);
});

// ---------------------------------------------------------------- day one

test("a partial window says so, so day one cannot read as a fortnight of neglect", () => {
  const r = find(buildRings(counts({ gym: ok(2) }), 3), "physical", "gym");
  assert.equal(r.fact, "2 of 8 days · day 3 of 14");
  assert.equal(r.fill, 0.25);
});

test("a fully observed window drops the day counter", () => {
  const r = find(buildRings(counts({ gym: ok(2) }), 14), "physical", "gym");
  assert.equal(r.fact, "2 of 8 days");
});

// ---------------------------------------------------------------- units

test("skill sessions are counted as sessions, not days", () => {
  const r = find(buildRings(counts({ skills: ok(3) }), WINDOW_DAYS), "portfolio", "skills");
  assert.equal(r.fact, "3 of 4 sessions");
});

// ---------------------------------------------------------------- registry invariants

test("every day-capped metric requires no more than the window allows", () => {
  for (const m of METRICS) {
    if (m.unit !== "days" || m.required == null) continue;
    assert.ok(m.required <= WINDOW_DAYS, `${m.key} requires ${m.required} of ${WINDOW_DAYS} days`);
  }
});

test("every pillar appears exactly once and metric keys are unique", () => {
  const rings = buildRings(counts(), WINDOW_DAYS);
  assert.deepEqual(
    rings.map((r) => r.pillar),
    ["social_capital", "physical", "portfolio"]
  );
  const keys = METRICS.map((m) => m.key);
  assert.equal(new Set(keys).size, keys.length);
});

test("thresholds match the owner's stated minimums", () => {
  const by = Object.fromEntries(METRICS.map((m) => [m.key, m.required]));
  assert.equal(by.outreach, 2); // 1 / week
  assert.equal(by.gym, 8); // 4x / week
  assert.equal(by.steps, 12); // 7k / day
  assert.equal(by.skills, 4); // 4 sessions / 14 days
});
```

- [ ] **Step 2: Run to verify it fails**

```bash
npm test
```

Expected: FAIL — `Cannot find module './rings.ts'`.

- [ ] **Step 3: Implement**

Create `src/lib/rings.ts`:

```ts
// Pillar sufficiency rings. PURE — no DB, no React, zero imports, so this runs under
// `node --test` with no dependencies.
//
// THE CORE RULE: a ring fills toward a SUFFICIENCY THRESHOLD and CAPS there. It cannot
// be improved by doing more — 8 gym days and 20 gym days render identically, and 15k
// steps fills the steps ring exactly as much as 7k. That cap is the whole mechanism:
// because you cannot win by overdoing one pillar, the only board that looks good is a
// well-rounded one.
//
// Thresholds are the owner's MINIMUMS, not stretch goals, and they are configured here
// on purpose so retuning is a one-line change.
//
// There is no progression here. No XP, no levels, no points, no streaks on rings, no
// fortnight-over-fortnight comparison. A thin ring means NEGLECTED, never failed.

/** Also re-exported from queries.ts, so existing `@/lib/queries` imports keep working. */
export type PillarKey = "social_capital" | "physical" | "portfolio";

export const WINDOW_DAYS = 14;

export type MetricSource = "habit" | "gym" | "skill_session" | "health_steps";

export type Metric = {
  key: string;
  pillar: PillarKey;
  label: string;
  source: MetricSource;
  /** Habit-sourced metrics only. Looked up by system_key, never by name — the owner can
   *  rename their non-negotiables. */
  systemKey?: string;
  /** A day qualifies at or above this. Carries the per-day cap: 15k steps ≡ 7k. */
  dailyThreshold?: number;
  /** Qualifying days/sessions needed to fill. null = not yet specified → ghost. */
  required: number | null;
  /** The noun in the fact line. Days are per-day capped; sessions are not. */
  unit: "days" | "sessions";
  /** False when no writer for this source exists yet. NEVER inferred from row count —
   *  zero rows in the window is a real, meaningful zero. */
  sourceReady: boolean;
};

export const METRICS: Metric[] = [
  {
    key: "outreach",
    pillar: "social_capital",
    label: "Outreach",
    source: "habit",
    systemKey: "outreach",
    required: 2, // 1 / week
    unit: "days",
    sourceReady: true,
  },
  {
    key: "gym",
    pillar: "physical",
    label: "Gym",
    source: "gym",
    required: 8, // 4x / week
    unit: "days",
    sourceReady: true,
  },
  {
    key: "steps",
    pillar: "physical",
    label: "Steps",
    source: "health_steps",
    dailyThreshold: 7000,
    required: 12, // 7k / day
    unit: "days",
    // Dormant: nothing writes health_logs.steps yet. Config is valid and ready for the
    // day a source lands; until then this renders as a ghost and is excluded from the
    // Physical mean.
    sourceReady: false,
  },
  {
    key: "skills",
    pillar: "portfolio",
    label: "Skill sessions",
    source: "skill_session",
    required: 4, // 4 sessions / 14 days
    // SESSIONS, not days, by the owner's ruling: several of these (ice skating,
    // badminton, dancing) are social activities, so three on one Saturday is three
    // things that happened, not cramming. The outer cap still bounds the ring.
    unit: "sessions",
    sourceReady: true,
  },
];

const PILLAR_ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

/** What a reader returns for one metric. `resolved` is whether the SOURCE wired up —
 *  independent of how many rows it found. */
export type RawCount = { count: number; resolved: boolean };

export type MetricRing = {
  key: string;
  pillar: PillarKey;
  label: string;
  count: number;
  required: number | null;
  /** 0..1, or null when there is no source. NEVER 0 to mean "no source". */
  fill: number | null;
  /** The line printed under the ring. The arc caps; this never does. */
  fact: string;
};

export type PillarRingView = {
  pillar: PillarKey;
  /** Mean of the fills that are not null. null when nothing in the pillar resolved. */
  fill: number | null;
  metrics: MetricRing[];
};

export function metricFill(count: number, required: number | null, hasSource: boolean): number | null {
  if (!hasSource) return null;
  if (required == null || required < 1) return null;
  return Math.min(1, count / required);
}

function factLine(m: Metric, count: number, fill: number | null, observedDays: number): string {
  if (fill == null) return "no data source yet";
  const base = `${count} of ${m.required} ${m.unit}`;
  // Day one must not read like a fortnight of neglect: while the window is still
  // filling, say so plainly rather than letting a thin ring imply failure.
  return observedDays < WINDOW_DAYS ? `${base} · day ${observedDays} of ${WINDOW_DAYS}` : base;
}

export function buildRings(counts: Record<string, RawCount>, observedDays: number): PillarRingView[] {
  return PILLAR_ORDER.map((pillar) => {
    const metrics: MetricRing[] = METRICS.filter((m) => m.pillar === pillar).map((m) => {
      const raw = counts[m.key] ?? { count: 0, resolved: false };
      const hasSource = m.sourceReady && raw.resolved;
      const fill = metricFill(raw.count, m.required, hasSource);
      return {
        key: m.key,
        pillar: m.pillar,
        label: m.label,
        count: raw.count,
        required: m.required,
        fill,
        fact: factLine(m, raw.count, fill, observedDays),
      };
    });

    // A metric with no source is EXCLUDED from the mean, never counted as 0. Counting
    // steps as zero would cap Physical at 50% permanently and read as a failure that no
    // behaviour could fix.
    const live = metrics.filter((m) => m.fill !== null);
    const fill = live.length ? live.reduce((s, m) => s + (m.fill as number), 0) / live.length : null;

    return { pillar, fill, metrics };
  });
}
```

- [ ] **Step 4: Run to verify it passes**

```bash
npm test
```

Expected: `pass 30`, `fail 0` — 7 from `dates.test.ts`, 8 from `goals.test.ts`, 15 from `rings.test.ts`.

- [ ] **Step 5: Commit**

```bash
git add src/lib/rings.ts src/lib/rings.test.ts
git commit -m "feat: add pure sufficiency-ring registry and capped fill maths"
```

---

## Task 5: Migration

**Confirm with the owner before running.** This touches irreplaceable data. Task 1's backup must already exist.

**Files:**
- Modify: `src/lib/db/schema.sql`
- Modify: `scripts/migrate.mjs`
- Modify: `scripts/db-copy.mjs:77-92`

**Interfaces:**
- Consumes: nothing
- Produces: `gym_sessions` table; `habits.system_key = 'outreach'` on id 9; `habits.active = 0` on id 10; `app_meta['rings_since']`

- [ ] **Step 1: Add the table to `schema.sql`**

`schema.sql` is the seed source for a **fresh** database, so it must gain the table too — that is the existing deliberate policy (HANDOFF §3). Append to `src/lib/db/schema.sql`:

```sql
-- Gym days. Deliberately NOT a non-negotiable: the owner trains "any 4 of 5 weekdays",
-- which is a FREQUENCY, and habits.days_mask can only express a fixed schedule. Putting
-- it on the checklist Mon-Fri against an intent of four would guarantee one unticked
-- non-negotiable every week BY DESIGN, and an item engineered to fail teaches distrust
-- of the whole list.
--
-- The unique index on date encodes the per-day cap: one gym DAY, not one gym session.
-- Two visits in a day is the same event here, exactly as 15k steps is the same as 7k.
--
-- title/done_at are carried over from the Discord gym import (tasks.kind='gym') rather
-- than dropped — that history is real and irreplaceable. done_at stays NAIVE LOCAL,
-- copied verbatim; re-interpreting it as UTC would shift every session by the Melbourne
-- offset.
CREATE TABLE IF NOT EXISTS gym_sessions (
  id         INTEGER PRIMARY KEY,
  date       TEXT NOT NULL CHECK (date GLOB '????-??-??'),
  title      TEXT,
  done_at    TEXT,
  note       TEXT,
  created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%SZ','now'))
);
CREATE UNIQUE INDEX IF NOT EXISTS idx_gym_sessions_date ON gym_sessions(date);
```

- [ ] **Step 2: Add the guarded migration block**

Append to `scripts/migrate.mjs`, immediately **before** the closing `console.log("migration complete:", url);`. This follows the house shape exactly: read an `app_meta` key, run idempotent statements, insert the key, log one line.

```js
  // ---------------------------------------------------------------- rings v1
  // Wires the three pillar sufficiency rings to real sources.
  const rv = await client.execute("SELECT value FROM app_meta WHERE key='rings_v1'");
  if (!rv.rows.length) {
    // 1. The Social ring reads the outreach habit by SYSTEM_KEY, never by name — the
    //    owner can rename their non-negotiables, and a name lookup would break silently
    //    the moment they did. Habit 9 currently has system_key NULL.
    //    Matched by id AND name so a reordered database cannot mislabel the wrong row.
    await client.execute({
      sql: "UPDATE habits SET system_key='outreach', updated_at=? WHERE id=9 AND name='One outreach message' AND system_key IS NULL",
      args: [new Date().toISOString()],
    });
    // Partial index: two habits can never claim the same key, while the many NULLs stay
    // unconstrained. Same approach as the escalate flag (schema.sql:70-72).
    await client.execute(
      "CREATE UNIQUE INDEX IF NOT EXISTS idx_habits_system_key ON habits(system_key) WHERE system_key IS NOT NULL"
    );

    // 2. Rescue the gym log from `tasks`, which nothing reads (HANDOFF §3). Copied, not
    //    moved — the tasks rows stay put. INSERT OR IGNORE because the unique index on
    //    date would otherwise abort the whole migration on two sessions in one day.
    await client.execute(
      `INSERT OR IGNORE INTO gym_sessions (date,title,done_at,note)
       SELECT date, title, done_at, notes FROM tasks WHERE kind='gym'`
    );

    // 3. Gym leaves the non-negotiables. SOFT (active=0), matching deleteHabit — it
    //    preserves any entries and the owner can turn it back on from /habits.
    await client.execute({
      sql: "UPDATE habits SET active=0, updated_at=? WHERE id=10 AND name='Gym'",
      args: [new Date().toISOString()],
    });

    // 4. When the rings started observing. Without this, day one is indistinguishable
    //    from fourteen days of neglect.
    await client.execute({
      sql: "INSERT INTO app_meta (key,value) VALUES ('rings_since',?)",
      args: [new Date().toISOString().slice(0, 10)],
    });

    await client.execute("INSERT INTO app_meta (key,value) VALUES ('rings_v1','1')");
    const g = await client.execute("SELECT COUNT(*) AS n FROM gym_sessions");
    console.log(`rings v1: outreach keyed, gym unhooked, ${Number(g.rows[0].n)} gym sessions rescued`);
  }
```

- [ ] **Step 3: Fix `db-copy.mjs`**

It hard-fails on any table in neither list, and it is **already** missing `subgoals` and `skill_time` — a break that exists today. In `scripts/db-copy.mjs`, replace the `TABLES` array (lines 77-92) with:

```js
const TABLES = [
  "pillars",
  "goals",
  "subgoals",
  "tasks",
  "habits",
  "habit_entries",
  "daily_log",
  "xp_log",
  "coach_messages",
  "health_logs",
  "journal_entries",
  "block_marks",
  "skills",
  "skill_time",
  "gym_sessions",
  "app_meta",
  "google_oauth_tokens",
];
```

Order matters: parent before child, because foreign keys are enforced. `subgoals` follows `goals`; `skill_time` follows `skills`.

- [ ] **Step 4: Confirm with the owner, then run**

Show the owner this task's SQL and confirm before proceeding. Then:

```bash
npm run db:migrate
```

Expected final lines: `rings v1: outreach keyed, gym unhooked, 3 gym sessions rescued` then `migration complete: file:./data/dashboard.db`.

- [ ] **Step 5: Verify the result**

```bash
node -e "
const {createClient}=require('@libsql/client');
const db=createClient({url:'file:./data/dashboard.db'});
(async()=>{
  for(const [l,s] of [
    ['outreach key',\"SELECT id,name,system_key FROM habits WHERE system_key='outreach'\"],
    ['gym habit',   \"SELECT id,name,active FROM habits WHERE id=10\"],
    ['gym sessions',\"SELECT date,title,done_at FROM gym_sessions ORDER BY date\"],
    ['rings_since', \"SELECT value FROM app_meta WHERE key='rings_since'\"],
    ['goals kept',  'SELECT COUNT(*) n FROM goals'],
    ['subgoals kept','SELECT COUNT(*) n FROM subgoals'],
    ['tasks kept',  'SELECT COUNT(*) n FROM tasks'],
  ]) console.log(l, JSON.stringify((await db.execute(s)).rows));
})();
"
```

Expected: one habit with `system_key='outreach'` (id 9); habit 10 `active: 0`; **3** gym sessions with titles intact (`PUSH MONASH ft. Rats`, `UPPER MONASH ft. Rats`, `LEGS MONASH SPORT`); a `rings_since` date; **goals 2, subgoals 8, tasks 6 — unchanged**.

If any count dropped, stop and restore from the Task 1 backup.

- [ ] **Step 6: Verify idempotency**

```bash
npm run db:migrate
```

Expected: the `rings v1:` line does **not** appear again, and the counts above are unchanged.

- [ ] **Step 7: Commit**

```bash
git add src/lib/db/schema.sql scripts/migrate.mjs scripts/db-copy.mjs
git commit -m "feat: add gym_sessions, key the outreach habit, unhook gym from non-negotiables"
```

---

## Task 6: Reads in `queries.ts`

**Files:**
- Modify: `src/lib/queries.ts`

**Interfaces:**
- Consumes: `deriveWeights` (Task 3); `METRICS`, `RawCount`, `PillarKey` (Task 4); `addDays`, `daysBetween`, `todayISO` (Task 2)
- Produces:
  - `SubgoalView` gains `effectiveWeight: number`
  - `GoalView` gains `overAllocated: boolean`; `weightSum` removed
  - `SkillView` gains `minutes14: number`, `sessions14: number`
  - `getRingCounts(db, from, to): Promise<Record<string, RawCount>>`
  - `getObservedDays(db, anchor): Promise<number>`
  - `DayView.pillarAdherence` **removed**
  - `PillarKey` re-exported from `./rings`

- [ ] **Step 1: Re-home `PillarKey` and add imports**

In `src/lib/queries.ts`, replace line 8 (`export type PillarKey = ...`) with a re-export, and extend the imports at the top:

```ts
import { addDays, daysBetween } from "./dates";
import { deriveWeights } from "./goals";
import { METRICS, WINDOW_DAYS, type RawCount, type PillarKey } from "./rings";

// PillarKey now lives in rings.ts (which must stay import-free to be testable). Re-exported
// here so every existing `import type { PillarKey } from "@/lib/queries"` keeps working.
export type { PillarKey };
```

- [ ] **Step 2: Update `SubgoalView` and `GoalView`**

Replace the two type declarations at `src/lib/queries.ts:24-37`:

```ts
export type SubgoalView = {
  id: number;
  title: string;
  /** The raw column. 0 means AUTO — do not render this. */
  weight: number;
  /** What it is actually worth right now. Render THIS. */
  effectiveWeight: number;
  done: boolean;
};

export type GoalView = {
  id: number;
  pillar: PillarKey;
  title: string;
  target: string | null;
  /** Derived: the sum of completed subgoal weights. Never inferred from activity, and
   *  deliberately never read from the stale goals.progress column. */
  progress: number;
  status: string;
  subgoals: SubgoalView[];
  /** True ONLY when explicit overrides exceed 100%. An all-auto goal is well-formed. */
  overAllocated: boolean;
};
```

- [ ] **Step 3: Rewrite `listGoals` to use `deriveWeights`**

Replace the body of `listGoals` (`src/lib/queries.ts:168-198`) from the `return r.rows.map(...)` onward:

```ts
  return r.rows.map((g) => {
    const raw = byGoal.get(num(g.id)) ?? [];
    const w = deriveWeights(raw);
    return {
      id: num(g.id),
      pillar: String(g.pk) as PillarKey,
      title: String(g.title),
      target: str(g.target),
      progress: w.progress,
      status: String(g.status),
      subgoals: raw.map((s, i) => ({ ...s, effectiveWeight: w.effective[i] })),
      overAllocated: w.overAllocated,
    };
  });
```

The accumulator above it builds subgoals **without** `effectiveWeight` — the spread adds it. Change its two lines (`src/lib/queries.ts:174-176`) to:

```ts
  type RawSub = Omit<SubgoalView, "effectiveWeight">;
  const byGoal = new Map<number, RawSub[]>();
  for (const s of subs.rows) {
    const gid = num(s.goal_id);
    const list: RawSub[] = byGoal.get(gid) ?? [];
    list.push({ id: num(s.id), title: String(s.title), weight: num(s.weight), done: num(s.done) === 1 });
    byGoal.set(gid, list);
  }
```

- [ ] **Step 4: Add the 14-day figures to `listSkills`**

Replace the query in `listSkills` (`src/lib/queries.ts:240-245`). A session is a distinct `(skill_id, date)` pair — never a row, or tapping +15 then +30 in one sitting would count twice.

```ts
export async function listSkills(db: Client, anchor: string): Promise<SkillView[]> {
  const { byId } = await pillarMaps(db);
  const from = addDays(anchor, -(WINDOW_DAYS - 1));
  const r = await db.execute({
    sql: `SELECT s.id, s.name, s.pillar_id, s.state, s.last_touched,
            COALESCE((SELECT SUM(minutes) FROM skill_time t WHERE t.skill_id = s.id), 0) AS minutes,
            COALESCE((SELECT SUM(minutes) FROM skill_time t
                       WHERE t.skill_id = s.id AND t.date BETWEEN ? AND ?), 0) AS minutes14,
            COALESCE((SELECT COUNT(DISTINCT date) FROM skill_time t
                       WHERE t.skill_id = s.id AND t.date BETWEEN ? AND ?), 0) AS sessions14
     FROM skills s
     ORDER BY CASE s.state WHEN 'active' THEN 0 WHEN 'always_on' THEN 1 ELSE 2 END, s.sort_order, s.id`,
    args: [from, anchor, from, anchor],
  });
```

and in the returned object add, alongside `minutes: num(s.minutes)`:

```ts
      minutes14: num(s.minutes14),
      sessions14: num(s.sessions14),
```

`num()` is mandatory on every aggregate: **libSQL returns them as BigInt**, and `bigint / number` throws a TypeError rather than producing a wrong answer.

Add the two fields to `SkillView` at `src/lib/queries.ts:39-47`:

```ts
  /** Minutes in the rolling 14-day window — the live number. */
  minutes14: number;
  /** Distinct days this skill was touched in the window. */
  sessions14: number;
```

- [ ] **Step 5: Add the ring readers**

Append to `src/lib/queries.ts`:

```ts
/**
 * Raw counts for every ring metric over [from, to] inclusive.
 *
 * `resolved` says whether the SOURCE wired up — never whether it found rows. Zero rows
 * in the window is a real, meaningful zero and must stay distinguishable from a metric
 * that has no source at all, or a first day reads as a fortnight of neglect.
 */
export async function getRingCounts(
  db: Client,
  from: string,
  to: string
): Promise<Record<string, RawCount>> {
  const out: Record<string, RawCount> = {};

  for (const m of METRICS) {
    if (!m.sourceReady) {
      out[m.key] = { count: 0, resolved: false };
      continue;
    }

    if (m.source === "habit") {
      // value > 0: the column is a REAL defaulting to 1 and nothing constrains it to be
      // truthy, so a 0 row would otherwise count as a tick.
      const h = await db.execute({ sql: "SELECT id FROM habits WHERE system_key=? AND active=1", args: [m.systemKey!] });
      if (!h.rows.length) {
        // A metric declared ready whose wire is broken. Ghost it so the screen still
        // works, but say so loudly — silently ghosting hides a bug behind a state that
        // looks intentional.
        console.error(`[rings] metric "${m.key}" is sourceReady but system_key "${m.systemKey}" resolved to no active habit`);
        out[m.key] = { count: 0, resolved: false };
        continue;
      }
      const r = await db.execute({
        sql: "SELECT COUNT(DISTINCT date) AS n FROM habit_entries WHERE habit_id=? AND date BETWEEN ? AND ? AND value > 0",
        args: [num(h.rows[0].id), from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    if (m.source === "gym") {
      const r = await db.execute({
        sql: "SELECT COUNT(DISTINCT date) AS n FROM gym_sessions WHERE date BETWEEN ? AND ?",
        args: [from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    if (m.source === "skill_session") {
      // Sessions, not days: three skills on one Saturday is three. Several of these are
      // social activities rather than crammed practice. The ring's own cap still bounds it.
      const r = await db.execute({
        sql: "SELECT COUNT(*) AS n FROM (SELECT DISTINCT skill_id, date FROM skill_time WHERE date BETWEEN ? AND ?)",
        args: [from, to],
      });
      out[m.key] = { count: num(r.rows[0].n), resolved: true };
      continue;
    }

    out[m.key] = { count: 0, resolved: false };
  }

  return out;
}

/** How much of the 14-day window has actually been observed. Caps at WINDOW_DAYS. */
export async function getObservedDays(db: Client, anchor: string): Promise<number> {
  const r = await db.execute("SELECT value FROM app_meta WHERE key='rings_since'");
  if (!r.rows.length) return WINDOW_DAYS;
  const since = String(r.rows[0].value);
  return Math.max(1, Math.min(WINDOW_DAYS, daysBetween(since, anchor) + 1));
}
```

- [ ] **Step 6: Remove `pillarAdherence`**

The header chips it feeds are superseded by the rings. Delete the `pillarAdherence` field from `DayView` (`src/lib/queries.ts:62`), its computation (`:147-152`), and its entry in the returned object (`:164`).

- [ ] **Step 7: Move `updateGoal` out**

`queries.ts` is reads only. Delete `createGoal` (`:200-209`) and `updateGoal` (`:215-230`) — they are re-created in `engine.ts` in Task 7. Also delete `logSkillTime` (`:260-276`), re-created in Task 8.

- [ ] **Step 8: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors **only** in `src/app/page.tsx`, `src/components/Today.tsx` and `src/components/GoalsSkills.tsx` (missing `pillarAdherence`, `listSkills` arity, `weightSum`) plus the dead `src/app/api/goals/*` and `src/app/api/skills/*` routes. Those are fixed in Tasks 7-13. No errors inside `queries.ts` itself.

- [ ] **Step 9: Commit**

```bash
git add src/lib/queries.ts
git commit -m "feat: read 14-day skill figures, ring counts and effective subgoal weights"
```

---

## Task 7: Goal and subgoal writes in `engine.ts`

**Files:**
- Modify: `src/lib/engine.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `createGoal(db, {pillar_id, title, target?}): Promise<number>`
  - `updateGoal(db, id, {title?, target?, status?}): Promise<void>`
  - `deleteGoal(db, id): Promise<void>` — soft
  - `createSubgoal(db, {goal_id, title, weight?}): Promise<number>`
  - `updateSubgoal(db, id, {title?, weight?}): Promise<void>`
  - `setSubgoalDone(db, id, done): Promise<void>`
  - `deleteSubgoal(db, id): Promise<void>` — hard
  - `reorderSubgoals(db, goalId, ids): Promise<void>`

- [ ] **Step 1: Implement**

Replace the placeholder `recomputeGoalTx` block (`src/lib/engine.ts:266-270`) with:

```ts
// ---------------------------------------------------------------- goals
//
// Goals are the ONE sanctioned accomplishment measure in this app, and they are
// quarantined: goal progress feeds nothing else — not adherence, not the streak, not
// the rings, not the coach. That isolation is what keeps "did I do what I said I'd do"
// from quietly becoming "how much did I finish".
//
// Progress is never STORED. It is derived from completed subgoal weights on read, so the
// stale goals.progress column can never drift out of step with the subgoals that define
// it. (It already had: row 1 stored 0.0833 while deriving 0.)

export async function createGoal(
  db: Client,
  g: { pillar_id: number; title: string; target?: string | null }
): Promise<number> {
  const r = await db.execute({
    sql: "INSERT INTO goals (pillar_id,title,target) VALUES (?,?,?)",
    args: [g.pillar_id, g.title.trim(), g.target?.trim() || null],
  });
  return Number(r.lastInsertRowid);
}

export async function updateGoal(
  db: Client,
  id: number,
  patch: { title?: string; target?: string | null; status?: string }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.target !== undefined) (sets.push("target=?"), args.push(patch.target?.trim() || null));
  if (patch.status !== undefined) (sets.push("status=?"), args.push(patch.status));
  if (!sets.length) return;
  sets.push("updated_at=?");
  args.push(now(), id);
  await db.execute({ sql: `UPDATE goals SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Soft, matching deleteHabit. Subgoals reference goal_id, and listGoals already filters
 * status != 'dropped', so this hides the goal without orphaning its history.
 */
export async function deleteGoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "UPDATE goals SET status='dropped', updated_at=? WHERE id=?", args: [now(), id] });
}

// ---------------------------------------------------------------- subgoals
//
// weight = 0 means AUTO — an equal share of whatever the explicit overrides leave.
// See src/lib/goals.ts for the derivation.

export async function createSubgoal(
  db: Client,
  s: { goal_id: number; title: string; weight?: number }
): Promise<number> {
  const r = await db.execute({
    sql: `INSERT INTO subgoals (goal_id,title,weight,sort_order)
          VALUES (?,?,?,(SELECT COALESCE(MAX(sort_order),0)+1 FROM subgoals WHERE goal_id=?))`,
    args: [s.goal_id, s.title.trim(), clampWeight(s.weight), s.goal_id],
  });
  return Number(r.lastInsertRowid);
}

/** The column's CHECK is 0..1; clamp rather than throw so a slider can never 500. */
function clampWeight(w: number | null | undefined): number {
  if (w == null || !Number.isFinite(w) || w <= 0) return 0;
  return Math.min(1, w);
}

export async function updateSubgoal(
  db: Client,
  id: number,
  patch: { title?: string; weight?: number | null }
): Promise<void> {
  const sets: string[] = [];
  const args: (string | number | null)[] = [];
  if (patch.title !== undefined) (sets.push("title=?"), args.push(patch.title.trim()));
  if (patch.weight !== undefined) (sets.push("weight=?"), args.push(clampWeight(patch.weight)));
  if (!sets.length) return;
  args.push(id);
  await db.execute({ sql: `UPDATE subgoals SET ${sets.join(", ")} WHERE id=?`, args });
}

/**
 * Tick or untick a subgoal. The goal is NEVER auto-completed when this reaches 100% —
 * marking a goal done is the owner's decision, and auto-completion is a progression
 * mechanic.
 */
export async function setSubgoalDone(db: Client, id: number, done: boolean): Promise<void> {
  await db.execute({ sql: "UPDATE subgoals SET done=? WHERE id=?", args: [done ? 1 : 0, id] });
}

/** Hard. subgoals has no `active` column and nothing references a subgoal id, so there
 *  is no history to orphan. The UI's confirm is the safeguard. */
export async function deleteSubgoal(db: Client, id: number): Promise<void> {
  await db.execute({ sql: "DELETE FROM subgoals WHERE id=?", args: [id] });
}

export async function reorderSubgoals(db: Client, goalId: number, ids: number[]): Promise<void> {
  const tx = await db.transaction("write");
  try {
    for (let i = 0; i < ids.length; i++) {
      await tx.execute({ sql: "UPDATE subgoals SET sort_order=? WHERE id=? AND goal_id=?", args: [i + 1, ids[i], goalId] });
    }
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}
```

- [ ] **Step 2: Type-check**

```bash
npx tsc --noEmit
```

Expected: no new errors in `engine.ts`.

- [ ] **Step 3: Commit**

```bash
git add src/lib/engine.ts
git commit -m "feat: add transactional goal and subgoal writes to the engine"
```

---

## Task 8: Skill-time and gym writes in `engine.ts`

**Files:**
- Modify: `src/lib/engine.ts`

**Interfaces:**
- Consumes: nothing new
- Produces:
  - `logSkillTime(db, skillId, minutes, date, note?): Promise<void>`
  - `undoSkillTime(db, skillId, date): Promise<boolean>` — true if a row was removed
  - `setGymSession(db, date, on): Promise<void>`

- [ ] **Step 1: Implement**

Append to `src/lib/engine.ts`:

```ts
// ---------------------------------------------------------------- skill time
//
// The total of these minutes is a MEASUREMENT of time invested, never a reward. No
// levels, no thresholds, no milestones — the number only ever says how long you spent,
// which is a fact rather than a score.
//
// Kept as a log rather than a running total so a mistaken entry can be removed, which is
// exactly what undoSkillTime does.

export async function logSkillTime(
  db: Client,
  skillId: number,
  minutes: number,
  date: string,
  note?: string | null
): Promise<void> {
  if (!Number.isFinite(minutes) || minutes <= 0) return;
  const ts = now();
  const tx = await db.transaction("write");
  try {
    await tx.execute({
      sql: "INSERT INTO skill_time (skill_id,date,minutes,note) VALUES (?,?,?,?)",
      args: [skillId, date, Math.round(minutes), note ?? null],
    });
    await tx.execute({
      sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
      args: [ts, ts, skillId],
    });
    await tx.commit();
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

/**
 * Remove the most recent entry for (skill, date). Returns false when there was nothing
 * to undo, so the caller can hide the control rather than pretending it did something.
 *
 * last_touched is RECOMPUTED from the rows that remain rather than left as it was —
 * otherwise undoing the only session for a skill leaves it looking recently worked, and
 * the stalled-rotation prompt reads a lie.
 */
export async function undoSkillTime(db: Client, skillId: number, date: string): Promise<boolean> {
  const tx = await db.transaction("write");
  try {
    const last = await tx.execute({
      sql: "SELECT id FROM skill_time WHERE skill_id=? AND date=? ORDER BY id DESC LIMIT 1",
      args: [skillId, date],
    });
    if (!last.rows.length) {
      await tx.rollback();
      return false;
    }
    await tx.execute({ sql: "DELETE FROM skill_time WHERE id=?", args: [num(last.rows[0].id)] });
    const rest = await tx.execute({
      sql: "SELECT MAX(date) AS d FROM skill_time WHERE skill_id=?",
      args: [skillId],
    });
    const d = rest.rows[0]?.d;
    await tx.execute({
      sql: "UPDATE skills SET last_touched=?, updated_at=? WHERE id=?",
      args: [d == null ? null : `${String(d)}T00:00:00.000Z`, now(), skillId],
    });
    await tx.commit();
    return true;
  } catch (e) {
    await tx.rollback();
    throw e;
  }
}

// ---------------------------------------------------------------- gym
//
// One row per gym DAY. The unique index on date carries the per-day cap: two visits in a
// day is the same event, exactly as 15k steps is the same as 7k.

export async function setGymSession(db: Client, date: string, on: boolean): Promise<void> {
  if (on) {
    await db.execute({
      sql: "INSERT INTO gym_sessions (date) VALUES (?) ON CONFLICT(date) DO NOTHING",
      args: [date],
    });
  } else {
    // Only removes a manually-toggled day. Imported rows carry a title; deleting one of
    // those would destroy rescued history, so they are left alone.
    await db.execute({ sql: "DELETE FROM gym_sessions WHERE date=? AND title IS NULL", args: [date] });
  }
}
```

- [ ] **Step 2: Type-check and commit**

```bash
npx tsc --noEmit
git add src/lib/engine.ts
git commit -m "feat: add skill-time logging, undo and gym-day writes to the engine"
```

---

## Task 9: Goal and subgoal routes

**Files:**
- Modify: `src/app/api/goals/route.ts`, `src/app/api/goals/[id]/route.ts`
- Create: `src/app/api/subgoals/route.ts`, `src/app/api/subgoals/[id]/route.ts`

**Interfaces:**
- Consumes: Task 7's engine functions; `listGoals` from `queries.ts`
- Produces: `GET/POST /api/goals`, `PATCH/DELETE /api/goals/[id]`, `POST /api/subgoals`, `PATCH/DELETE /api/subgoals/[id]`

All four follow the existing route idiom exactly: `export const runtime = "nodejs"`, `Response.json`, try/catch returning `{ error }` with a 500, and 400 on a bad id.

- [ ] **Step 1: Rewrite `src/app/api/goals/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { createGoal } from "@/lib/engine";

export const runtime = "nodejs";

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const title = String(b.title ?? "").trim();
    const pillarId = Number(b.pillar_id);
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    if (!Number.isInteger(pillarId) || pillarId <= 0) return Response.json({ error: "bad pillar_id" }, { status: 400 });
    const db = await getDb();
    const id = await createGoal(db, { pillar_id: pillarId, title, target: b.target ?? null });
    return Response.json({ id, goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Rewrite `src/app/api/goals/[id]/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { updateGoal, deleteGoal } from "@/lib/engine";

export const runtime = "nodejs";

const STATUSES = new Set(["active", "done", "paused", "dropped"]);

async function id(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const goalId = await id(ctx);
    if (goalId == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    if (b.status !== undefined && !STATUSES.has(String(b.status))) {
      return Response.json({ error: "bad status" }, { status: 400 });
    }
    const db = await getDb();
    await updateGoal(db, goalId, b);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const goalId = await id(ctx);
    if (goalId == null) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    await deleteGoal(db, goalId);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `src/app/api/subgoals/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { createSubgoal } from "@/lib/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const title = String(b.title ?? "").trim();
    const goalId = Number(b.goal_id);
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    if (!Number.isInteger(goalId) || goalId <= 0) return Response.json({ error: "bad goal_id" }, { status: 400 });
    const db = await getDb();
    const id = await createSubgoal(db, { goal_id: goalId, title, weight: Number(b.weight ?? 0) });
    return Response.json({ id, goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Create `src/app/api/subgoals/[id]/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { updateSubgoal, setSubgoalDone, deleteSubgoal } from "@/lib/engine";

export const runtime = "nodejs";

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const n = Number((await ctx.params).id);
    if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const db = await getDb();
    if (b.done !== undefined) await setSubgoalDone(db, n, Boolean(b.done));
    if (b.title !== undefined || b.weight !== undefined) {
      await updateSubgoal(db, n, { title: b.title, weight: b.weight });
    }
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const n = Number((await ctx.params).id);
    if (!Number.isInteger(n) || n <= 0) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    await deleteSubgoal(db, n);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

Every mutating route returns the **full refreshed goals list**, so the client never has to re-fetch separately after a write.

- [ ] **Step 5: Verify**

```bash
npx tsc --noEmit
npm run dev
```

In another shell (the app is behind an auth cookie, so this checks the route compiles and rejects cleanly rather than returning data):

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3000/api/goals
```

Expected: `307` (redirect to login) — proving `proxy.ts` guards it, not a 404 or 500.

- [ ] **Step 6: Commit**

```bash
git add src/app/api/goals src/app/api/subgoals
git commit -m "feat: add goal and subgoal CRUD routes"
```

---

## Task 10: Skill-time, gym and rings routes

**Files:**
- Create: `src/app/api/skills/[id]/time/route.ts`, `src/app/api/gym/route.ts`, `src/app/api/rings/route.ts`

**Interfaces:**
- Consumes: `logSkillTime`, `undoSkillTime`, `setGymSession` (Task 8); `getRingCounts`, `getObservedDays`, `listSkills` (Task 6); `buildRings`, `WINDOW_DAYS` (Task 4)
- Produces: `POST/DELETE /api/skills/[id]/time`, `POST/DELETE /api/gym`, `GET /api/rings?date=`

- [ ] **Step 1: Create `src/app/api/skills/[id]/time/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { listSkills } from "@/lib/queries";
import { logSkillTime, undoSkillTime } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

/** The quick-add increments. A closed set so a crafted request can't log an 8-hour day. */
const ALLOWED = new Set([15, 30, 60]);

function skillId(raw: string): number | null {
  const n = Number(raw);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = skillId((await ctx.params).id);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const minutes = Number(b.minutes);
    if (!ALLOWED.has(minutes)) return Response.json({ error: "bad minutes" }, { status: 400 });
    const date = isISODate(b.date) ? b.date : todayISO();
    const db = await getDb();
    await logSkillTime(db, id, minutes, date);
    return Response.json({ skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = skillId((await ctx.params).id);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const url = new URL(req.url);
    const raw = url.searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();
    const db = await getDb();
    const removed = await undoSkillTime(db, id, date);
    return Response.json({ removed, skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 2: Create `src/app/api/gym/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { setGymSession } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const date = isISODate(b.date) ? b.date : todayISO();
    const db = await getDb();
    await setGymSession(db, date, Boolean(b.on));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 3: Create `src/app/api/rings/route.ts`**

```ts
import { getDb } from "@/lib/db/client";
import { getRingCounts, getObservedDays } from "@/lib/queries";
import { buildRings, WINDOW_DAYS } from "@/lib/rings";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    // Same guard pattern as /api/adherence.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();
    const [counts, observedDays] = await Promise.all([
      getRingCounts(db, from, anchor),
      getObservedDays(db, anchor),
    ]);

    return Response.json({ date: anchor, from, observedDays, pillars: buildRings(counts, observedDays) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
```

- [ ] **Step 4: Verify and commit**

```bash
npx tsc --noEmit
git add src/app/api/skills src/app/api/gym src/app/api/rings
git commit -m "feat: add skill-time, gym and rings API routes"
```

---

## Task 11: `PillarRing.tsx`

One component, both ring species. Everything visual that must not be got wrong is here.

**Files:**
- Create: `src/components/PillarRing.tsx`

**Interfaces:**
- Consumes: `PillarKey` from `@/lib/queries`
- Produces: default export `Ring` with props `{ fill: number | null; size: number; stroke: number; tone: PillarKey | "accent"; children?: ReactNode }`. There is no `ghost` prop — the ghost state **is** `fill === null`, so a caller can never disagree with the maths about whether a source exists.

- [ ] **Step 1: Implement**

```tsx
"use client";

import type { ReactNode } from "react";
import type { PillarKey } from "@/lib/queries";

/**
 * One ring. Two species use it and MUST stay visually distinct, or today's adherence
 * reads as one more quota to fill and the quota rings borrow adherence's authority:
 *
 *   adherence — large, amber, thick stroke, number INSIDE
 *   pillar    — small, pillar-hued, thin stroke, fact line BELOW (never a percentage)
 *
 * Three ring states, and the third is what stops a first load reading as total failure:
 *   filled            fill > 0            a hued arc
 *   empty but live    fill === 0          faint track, no arc
 *   ghost             fill === null       DASHED track, no arc, "no data source yet"
 *
 * `fill === null` never reaches the arc maths. JavaScript coerces null to 0, so a
 * compute-then-check would silently draw a 0% ring at 7am for a day that has not
 * happened yet.
 */

const TONE: Record<PillarKey | "accent", string> = {
  accent: "var(--color-accent)",
  social_capital: "var(--color-social)",
  physical: "var(--color-physical)",
  portfolio: "var(--color-portfolio)",
};

export default function Ring({
  fill,
  size,
  stroke,
  tone,
  children,
}: {
  fill: number | null;
  size: number;
  stroke: number;
  tone: PillarKey | "accent";
  children?: ReactNode;
}) {
  const ghost = fill == null;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  // Guard clause, not a fallback expression: null must never enter the arithmetic.
  const dash = ghost ? 0 : c * Math.min(1, Math.max(0, fill));

  return (
    <div className="relative inline-flex items-center justify-center" style={{ width: size, height: size }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`} aria-hidden>
        <circle
          cx={size / 2}
          cy={size / 2}
          r={r}
          fill="none"
          stroke="var(--color-panel-2)"
          strokeWidth={stroke}
          strokeDasharray={ghost ? "3 5" : undefined}
        />
        {!ghost && dash > 0 && (
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={TONE[tone]}
            strokeWidth={stroke}
            // BUTT, never round: round caps add half a stroke width at each end, which
            // makes the smallest non-zero fills read as roughly half again their true
            // value — the ring would overstate exactly where honesty matters most.
            strokeLinecap="butt"
            strokeDasharray={`${dash} ${c}`}
            transform={`rotate(-90 ${size / 2} ${size / 2})`}
            style={{ transition: "stroke-dasharray 400ms ease" }}
          />
        )}
      </svg>
      {children && <div className="absolute inset-0 flex flex-col items-center justify-center">{children}</div>}
    </div>
  );
}
```

- [ ] **Step 2: Verify no third font weight or stale colour crept in**

```bash
grep -nE "font-medium|font-\[5|#[0-9a-fA-F]{6}" src/components/PillarRing.tsx
```

Expected: **no output.** Any hex literal means the old `pillars.ts` palette leaked in; any `font-medium` breaks the two-weight rule.

- [ ] **Step 3: Type-check and commit**

```bash
npx tsc --noEmit
git add src/components/PillarRing.tsx
git commit -m "feat: add PillarRing SVG component with ghost, empty and filled states"
```

---

## Task 12: `Today.tsx` owns goals, skills and rings state

Nothing built so far can refresh without this. `page.tsx` renders once per request and passes goals and skills as frozen props; `Today.tsx:42-46` only refetches `/api/today`, whose `DayView` contains neither.

**Files:**
- Modify: `src/components/Today.tsx`
- Modify: `src/app/page.tsx`

**Interfaces:**
- Consumes: `/api/rings`, `/api/goals`, `/api/skills` (existing GET)
- Produces: `goals`, `skills`, `rings` state plus `loadRings()`, and an `onChanged(next)` contract that child components call with a server response

- [ ] **Step 1: Pass the anchor date to `listSkills` in `page.tsx`**

`listSkills` gained a required `anchor` parameter in Task 6. In `src/app/page.tsx`, find the `listSkills(db)` call and pass the same date already used for the day view:

```tsx
  const skills = await listSkills(db, date);
```

- [ ] **Step 2: Add state and loaders to `Today.tsx`**

Replace the props destructure and the state block at the top of the component (`src/components/Today.tsx:22-48`):

```tsx
export default function Today({
  initial,
  goals: initialGoals,
  skills: initialSkills,
}: {
  initial: DayView;
  goals: GoalView[];
  skills: SkillView[];
}) {
  const [data, setData] = useState<DayView>(initial);
  const [strip, setStrip] = useState<StripDay[]>([]);
  // Goals, skills and rings are OWNED here rather than left as server props: every new
  // control (subgoal tick, +15/+30/+60, gym toggle) mutates data that page.tsx would
  // otherwise only re-render on a full navigation.
  const [goals, setGoals] = useState<GoalView[]>(initialGoals);
  const [skills, setSkills] = useState<SkillView[]>(initialSkills);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);

  const loadStrip = useCallback(() => {
    fetch(`/api/adherence?days=7&center=${data.date}`)
      .then((r) => r.json())
      .then((s) => !s.error && setStrip(s.days ?? []))
      .catch(() => {});
  }, [data.date]);

  const loadRings = useCallback(() => {
    fetch(`/api/rings?date=${data.date}`)
      .then((r) => r.json())
      .then((s) => !s.error && setRings(s.pillars ?? []))
      .catch(() => {});
  }, [data.date]);

  const refresh = useCallback(async () => {
    const d = await fetch(`/api/today?date=${data.date}`).then((r) => r.json());
    if (!d.error) setData(d);
    loadStrip();
    loadRings();
  }, [data.date, loadStrip, loadRings]);

  useEffect(loadStrip, [loadStrip]);
  useEffect(loadRings, [loadRings]);
```

Add to the imports at the top of the file:

```tsx
import type { PillarRingView } from "@/lib/rings";
```

- [ ] **Step 3: Add the write-through handlers**

Below `toggleHabit` in the same component. Every mutating route returns the refreshed collection, so one round trip does both jobs:

```tsx
  // Mutating routes return the refreshed collection, so there is no second fetch.
  // Rings are reloaded because a skill session and a gym day both feed them.
  async function mutateGoals(url: string, init: RequestInit) {
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init }).then((x) => x.json());
    if (!r.error && r.goals) setGoals(r.goals);
  }

  async function mutateSkills(url: string, init: RequestInit) {
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init }).then((x) => x.json());
    if (!r.error && r.skills) setSkills(r.skills);
    loadRings();
  }

  async function toggleGym(on: boolean) {
    await fetch("/api/gym", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.date, on }),
    });
    loadRings();
  }
```

- [ ] **Step 4: Type-check**

```bash
npx tsc --noEmit
```

Expected: errors remain only where `GoalsSkills` is still rendered with the old props — fixed in Task 13.

- [ ] **Step 5: Commit**

```bash
git add src/components/Today.tsx src/app/page.tsx
git commit -m "refactor: Today owns goals, skills and rings state so new controls can refresh"
```

---

## Task 13: `PillarSections.tsx` — the right column

**Files:**
- Create: `src/components/PillarSections.tsx`
- Delete: `src/components/GoalsSkills.tsx`
- Modify: `src/components/Today.tsx` (render the new component)

**Interfaces:**
- Consumes: `Ring` (Task 11); `GoalView`, `SkillView` (Task 6); `PillarRingView` (Task 4); the three handlers from Task 12
- Produces: the three-section right column

- [ ] **Step 1: Implement**

Create `src/components/PillarSections.tsx`:

```tsx
"use client";

import { useState } from "react";
import Link from "next/link";
import Ring from "./PillarRing";
import type { GoalView, SkillView, PillarKey } from "@/lib/queries";
import type { PillarRingView } from "@/lib/rings";

/** 640 -> "10h 40m". Time is shown as time — an abstract number would invite reading it
 *  as a score, which is the one thing this figure is not. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};

const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];
const QUICK_ADD = [15, 30, 60];

export default function PillarSections({
  goals,
  skills,
  rings,
  gymOn,
  onSubgoal,
  onLogTime,
  onUndoTime,
  onToggleGym,
}: {
  goals: GoalView[];
  skills: SkillView[];
  rings: PillarRingView[] | null;
  gymOn: boolean;
  onSubgoal: (id: number, done: boolean) => Promise<void>;
  onLogTime: (skillId: number, minutes: number) => Promise<void>;
  onUndoTime: (skillId: number) => Promise<void>;
  onToggleGym: (on: boolean) => Promise<void>;
}) {
  const [busy, setBusy] = useState<string | null>(null);
  const [open, setOpen] = useState<number | null>(null);

  // Relative to the largest FORTNIGHT figure, so the bars compare where time went
  // recently. No target and no full state — nothing here is completable.
  const maxMinutes = Math.max(1, ...skills.map((s) => s.minutes14));
  const anyRecent = skills.some((s) => s.minutes14 > 0);

  const run = async (key: string, fn: () => Promise<void>) => {
    setBusy(key);
    try {
      await fn();
    } finally {
      setBusy(null);
    }
  };

  return (
    <div className="flex flex-col gap-12">
      {ORDER.map((pk) => {
        const ring = rings?.find((r) => r.pillar === pk) ?? null;
        const mine = goals.filter((g) => g.pillar === pk && g.status !== "done");
        const myS = skills.filter((s) => s.pillar === pk);
        const subrings = ring && ring.metrics.length > 1 ? ring.metrics : [];
        const soleFact = ring && ring.metrics.length === 1 ? ring.metrics[0].fact : null;

        return (
          <section key={pk}>
            <div className="flex items-center gap-3">
              <Ring fill={ring?.fill ?? null} size={44} stroke={4} tone={pk} />
              <div className="min-w-0">
                <h2 className="text-[15px] font-semibold">{PILLAR_NAME[pk]}</h2>
                {soleFact && <p className="text-[12px] text-[var(--color-muted)]">{soleFact}</p>}
              </div>
            </div>

            {subrings.length > 0 && (
              <div className="mt-4 flex gap-4">
                {subrings.map((m) => (
                  <div key={m.key} className="flex min-w-0 flex-col items-center gap-1.5">
                    <Ring fill={m.fill} size={40} stroke={3} tone={pk} />
                    <span className="text-[11px] text-[var(--color-muted)]">{m.label}</span>
                    <span className="text-center text-[10px] leading-tight text-[var(--color-muted)]">{m.fact}</span>
                  </div>
                ))}
              </div>
            )}

            {pk === "physical" && (
              <button
                onClick={() => run("gym", () => onToggleGym(!gymOn))}
                aria-pressed={gymOn}
                disabled={busy === "gym"}
                className="mt-3 flex items-center gap-2.5 rounded-xl px-2 py-2 text-left text-[13px] transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
              >
                <span
                  aria-hidden
                  className="h-4 w-4 shrink-0 rounded-md border transition-colors"
                  style={{
                    borderColor: gymOn ? "var(--color-physical)" : "var(--color-line-strong)",
                    background: gymOn ? "var(--color-physical)" : "transparent",
                  }}
                />
                <span className={gymOn ? "text-[var(--color-muted)]" : ""}>Went to the gym today</span>
              </button>
            )}

            {/* Goals keep their own heading so ring-led sections never make goal progress
                look like ring progress. The quarantine is a data rule; this is its visual
                counterpart. */}
            <div className="mt-5">
              <div className="flex items-baseline justify-between gap-3">
                <h3 className="text-[13px] font-semibold text-[var(--color-muted)]">Goals</h3>
                <Link
                  href="/goals"
                  className="text-[12px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
                >
                  edit
                </Link>
              </div>

              <ul className="mt-2.5 flex flex-col gap-3">
                {mine.map((g) => (
                  <li key={g.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-3.5">
                    <div className="flex items-baseline justify-between gap-3">
                      <p className="text-[15px]">{g.title}</p>
                      <span className="shrink-0 text-[14px] tabular-nums text-[var(--color-muted)]">
                        {Math.round(g.progress * 100)}%
                      </span>
                    </div>

                    <div className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
                      <div
                        className="h-full rounded-full bg-[var(--color-accent)] transition-[width] duration-500"
                        style={{ width: `${Math.round(g.progress * 100)}%` }}
                      />
                    </div>

                    <ul className="mt-3 flex flex-col gap-0.5">
                      {g.subgoals.map((s) => (
                        <li key={s.id}>
                          <button
                            onClick={() => run(`sg${s.id}`, () => onSubgoal(s.id, !s.done))}
                            aria-pressed={s.done}
                            disabled={busy === `sg${s.id}`}
                            className="flex w-full items-center gap-2.5 rounded-lg px-1 py-1.5 text-left transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40"
                          >
                            <span
                              aria-hidden
                              className="h-3.5 w-3.5 shrink-0 rounded-[4px] transition-colors"
                              style={
                                s.done
                                  ? { background: "var(--color-accent)" }
                                  : { border: "1px solid var(--color-line-strong)" }
                              }
                            />
                            <span className={`min-w-0 flex-1 truncate text-[13px] ${s.done ? "text-[var(--color-muted)]" : ""}`}>
                              {s.title}
                            </span>
                            <span className="shrink-0 text-[12px] tabular-nums text-[var(--color-muted)]">
                              {Math.round(s.effectiveWeight * 100)}%
                            </span>
                          </button>
                        </li>
                      ))}
                    </ul>

                    {g.subgoals.length === 0 && (
                      <p className="mt-2 text-[12px] text-[var(--color-muted)]">No subgoals yet.</p>
                    )}
                    {g.overAllocated && (
                      <p className="mt-2 text-[12px] text-[var(--color-muted)]">
                        set weights total more than 100%
                      </p>
                    )}
                  </li>
                ))}
                {mine.length === 0 && <li className="text-[13px] text-[var(--color-muted)]">No goals here yet.</li>}
              </ul>
            </div>

            {myS.length > 0 && (
              <div className="mt-5">
                <div className="flex items-baseline justify-between gap-3">
                  <h3 className="text-[13px] font-semibold text-[var(--color-muted)]">Skills</h3>
                  <span className="text-[12px] text-[var(--color-muted)]">last 14 days</span>
                </div>

                <ul className="mt-2.5 flex flex-col gap-3">
                  {myS.map((s) => (
                    <li key={s.id}>
                      <button
                        onClick={() => setOpen(open === s.id ? null : s.id)}
                        className="flex w-full items-baseline justify-between gap-3 text-left"
                      >
                        <span className={`truncate text-[14px] ${s.state === "parked" ? "text-[var(--color-muted)]" : ""}`}>
                          {s.name}
                          {s.state === "active" && <span className="ml-2 text-[12px] text-[var(--color-accent)]">active</span>}
                        </span>
                        <span className="shrink-0 text-[13px] tabular-nums">
                          {asTime(s.minutes14)}
                          <span className="ml-2 text-[12px] text-[var(--color-muted)]">{asTime(s.minutes)} lifetime</span>
                        </span>
                      </button>

                      {anyRecent && (
                        <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-panel-2)]">
                          <div
                            className="h-full rounded-full transition-[width] duration-500"
                            style={{
                              width: `${Math.round((s.minutes14 / maxMinutes) * 100)}%`,
                              background: s.state === "parked" ? "var(--color-line-strong)" : "var(--color-accent)",
                            }}
                          />
                        </div>
                      )}

                      {/* Quick-add sits on its OWN line, not inline with the name — inline
                          it overflows a phone. */}
                      {open === s.id && (
                        <div className="mt-2 flex flex-wrap gap-1.5">
                          {QUICK_ADD.map((min) => (
                            <button
                              key={min}
                              onClick={() => run(`st${s.id}`, () => onLogTime(s.id, min))}
                              disabled={busy === `st${s.id}`}
                              className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-[12px] tabular-nums transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                            >
                              +{min}m
                            </button>
                          ))}
                          {s.sessions14 > 0 && (
                            <button
                              onClick={() => run(`st${s.id}`, () => onUndoTime(s.id))}
                              disabled={busy === `st${s.id}`}
                              className="rounded-full px-3 py-1 text-[12px] text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
                            >
                              undo
                            </button>
                          )}
                        </div>
                      )}
                    </li>
                  ))}
                </ul>

                {!anyRecent && (
                  <p className="mt-3 text-[12px] leading-relaxed text-[var(--color-muted)]">
                    Nothing logged in the last 14 days. Lifetime totals stay listed, so everything
                    you&apos;ve put time into is still visible.
                  </p>
                )}
              </div>
            )}
          </section>
        );
      })}
    </div>
  );
}
```

- [ ] **Step 2: Wire it into `Today.tsx`**

Replace the `GoalsSkills` import with `PillarSections`, and the right-column render (`src/components/Today.tsx:220-222`) with:

```tsx
        <div className={`lg:order-3 ${colScroll}`}>
          <PillarSections
            goals={goals}
            skills={skills}
            rings={rings}
            gymOn={gymToday}
            onSubgoal={(id, done) =>
              mutateGoals(`/api/subgoals/${id}`, { method: "PATCH", body: JSON.stringify({ done }) })
            }
            onLogTime={(skillId, minutes) =>
              mutateSkills(`/api/skills/${skillId}/time`, {
                method: "POST",
                body: JSON.stringify({ minutes, date: data.date }),
              })
            }
            onUndoTime={(skillId) =>
              mutateSkills(`/api/skills/${skillId}/time?date=${data.date}`, { method: "DELETE" })
            }
            onToggleGym={toggleGym}
          />
        </div>
```

`gymToday` comes from the ring data — the gym metric's count is not per-day, so derive the toggle state from a dedicated field. Add to `Today.tsx` beside the other state:

```tsx
  const [gymToday, setGymToday] = useState(false);
```

and extend `loadRings` to read it (add `gymToday` to the `/api/rings` response in `src/app/api/rings/route.ts` — one extra query):

```ts
    const gym = await db.execute({ sql: "SELECT 1 FROM gym_sessions WHERE date=? LIMIT 1", args: [anchor] });
    return Response.json({
      date: anchor, from, observedDays,
      gymToday: gym.rows.length > 0,
      pillars: buildRings(counts, observedDays),
    });
```

and in `loadRings`:

```tsx
      .then((s) => {
        if (s.error) return;
        setRings(s.pillars ?? []);
        setGymToday(Boolean(s.gymToday));
      })
```

- [ ] **Step 3: Delete the superseded component**

```bash
git rm src/components/GoalsSkills.tsx
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both exit 0.

- [ ] **Step 5: Commit**

```bash
git add -A src/components src/app/api/rings
git commit -m "feat: pillar-sectioned right column with rings, subgoal ticking and skill logging"
```

---

## Task 14: Adherence ring, mobile ring row, chip removal

**Files:**
- Modify: `src/components/Today.tsx`

**Interfaces:**
- Consumes: `Ring` (Task 11); `rings` state (Task 12)
- Produces: the finished Today header and hero

- [ ] **Step 1: Replace the hero with a ring**

Replace the hero block (`src/components/Today.tsx:64-74`, the `flex items-end gap-3` div and the `<p>` beneath it):

```tsx
        <div className="flex items-center gap-6">
          {/* Large, amber, thick stroke, number INSIDE — deliberately unlike the small,
              hued, thin pillar rings. Adherence is the hero, not one more quota. */}
          <Ring fill={a.pct == null ? null : a.pct / 100} size={176} stroke={10} tone="accent">
            <div className="flex items-end">
              <span className="stat-hero text-[3.25rem]">{a.pct == null ? "—" : a.pct}</span>
              {a.pct != null && <span className="stat-hero pb-1 text-[1.1rem] text-[var(--color-muted)]">%</span>}
            </div>
          </Ring>
          <p className="text-[15px] text-[var(--color-muted)]">
            {a.pct == null
              ? "Nothing due yet today."
              : `adhered · ${a.adhered} of ${a.due} block${a.due === 1 ? "" : "s"} so far`}
            {a.unmarked > 0 && <span className="text-[var(--color-ink)]"> · {a.unmarked} to mark</span>}
          </p>
        </div>
```

`a.pct == null` passes `null` straight through to `Ring`, which guards before any arithmetic — so a morning with nothing due draws the ghost track and `—`, never a 0% ring.

- [ ] **Step 2: Replace the header chips with the mobile ring row**

Replace the header's chip block (`src/components/Today.tsx:196-205`):

```tsx
        {/* Phone only. The grid stacks middle → left → right, so the right column sits
            below the day's work AND the 9-day calendar — pillar rings there alone would
            be buried. On desktop the full sections are visible, so this is hidden. */}
        <div className="flex gap-3 lg:hidden">
          {(rings ?? []).map((r) => (
            <Ring key={r.pillar} fill={r.fill} size={18} stroke={2.5} tone={r.pillar} />
          ))}
        </div>
```

- [ ] **Step 3: Add the import**

```tsx
import Ring from "./PillarRing";
```

- [ ] **Step 4: Verify**

```bash
npx tsc --noEmit
npm run build
```

Expected: both exit 0. `DayView.pillarAdherence` is now referenced nowhere.

```bash
grep -rn "pillarAdherence" src/ || echo "clean"
```

Expected: `clean`.

- [ ] **Step 5: Commit**

```bash
git add src/components/Today.tsx
git commit -m "feat: draw adherence as a ring and add the mobile pillar ring row"
```

---

## Task 15: `/goals` editor screen

**Files:**
- Create: `src/app/goals/page.tsx`, `src/components/GoalEditor.tsx`

**Interfaces:**
- Consumes: `listGoals`, `getPillars` from `queries.ts`; the Task 9 routes
- Produces: the second deeper screen, mirroring `/habits`

- [ ] **Step 1: Create the page**

`src/app/goals/page.tsx`, mirroring `src/app/habits/page.tsx`:

```tsx
import Link from "next/link";
import { getDb } from "@/lib/db/client";
import { listGoals, getPillars } from "@/lib/queries";
import GoalEditor from "@/components/GoalEditor";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const db = await getDb();
  const [goals, pillars] = await Promise.all([listGoals(db), getPillars(db)]);

  return (
    <div className="mx-auto w-full max-w-[44rem] px-6 pb-24 pt-10 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-[15px] font-semibold">Goals</h1>
        <Link
          href="/"
          className="text-[13px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
        >
          done
        </Link>
      </header>
      <p className="mt-2 text-[13px] leading-relaxed text-[var(--color-muted)]">
        Subgoals split a goal evenly unless you set a weight. Leave a weight blank and it
        shares whatever the others leave behind.
      </p>
      <div className="mt-8">
        <GoalEditor initialGoals={goals} pillars={pillars} />
      </div>
    </div>
  );
}
```

- [ ] **Step 2: Create the editor**

`src/components/GoalEditor.tsx`:

```tsx
"use client";

import { useState } from "react";
import type { GoalView, PillarView } from "@/lib/queries";

export default function GoalEditor({
  initialGoals,
  pillars,
}: {
  initialGoals: GoalView[];
  pillars: PillarView[];
}) {
  const [goals, setGoals] = useState<GoalView[]>(initialGoals);
  const [busy, setBusy] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [newPillar, setNewPillar] = useState(pillars[0]?.key ?? "");
  const [newSub, setNewSub] = useState<Record<number, string>>({});

  async function call(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init }).then((x) => x.json());
      if (!r.error && r.goals) setGoals(r.goals);
    } finally {
      setBusy(false);
    }
  }

  const pillarId = (key: string) => pillars.findIndex((p) => p.key === key) + 1;

  return (
    <div className="flex flex-col gap-8">
      {goals.map((g) => (
        <section key={g.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-4">
          <div className="flex items-baseline justify-between gap-3">
            <input
              defaultValue={g.title}
              onBlur={(e) =>
                e.target.value.trim() !== g.title &&
                call(`/api/goals/${g.id}`, { method: "PATCH", body: JSON.stringify({ title: e.target.value }) })
              }
              className="min-w-0 flex-1 bg-transparent text-[15px] outline-none focus-visible:underline"
            />
            <button
              onClick={() => confirm(`Drop "${g.title}"?`) && call(`/api/goals/${g.id}`, { method: "DELETE" })}
              disabled={busy}
              className="shrink-0 text-[12px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
            >
              drop
            </button>
          </div>

          <ul className="mt-3 flex flex-col gap-1.5">
            {g.subgoals.map((s) => (
              <li key={s.id} className="flex items-center gap-2.5">
                <input
                  defaultValue={s.title}
                  onBlur={(e) =>
                    e.target.value.trim() !== s.title &&
                    call(`/api/subgoals/${s.id}`, { method: "PATCH", body: JSON.stringify({ title: e.target.value }) })
                  }
                  className="min-w-0 flex-1 bg-transparent text-[13px] outline-none focus-visible:underline"
                />
                <input
                  type="number"
                  min={0}
                  max={100}
                  placeholder="auto"
                  defaultValue={s.weight > 0 ? Math.round(s.weight * 100) : ""}
                  onBlur={(e) =>
                    call(`/api/subgoals/${s.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ weight: e.target.value === "" ? 0 : Number(e.target.value) / 100 }),
                    })
                  }
                  className="w-16 shrink-0 rounded-lg bg-[var(--color-panel-2)] px-2 py-1 text-right text-[12px] tabular-nums outline-none"
                />
                <button
                  onClick={() => call(`/api/subgoals/${s.id}`, { method: "DELETE" })}
                  disabled={busy}
                  aria-label={`Delete ${s.title}`}
                  className="shrink-0 px-1 text-[13px] text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
                >
                  ×
                </button>
              </li>
            ))}
          </ul>

          <form
            onSubmit={(e) => {
              e.preventDefault();
              const t = (newSub[g.id] ?? "").trim();
              if (!t) return;
              setNewSub({ ...newSub, [g.id]: "" });
              call("/api/subgoals", { method: "POST", body: JSON.stringify({ goal_id: g.id, title: t }) });
            }}
            className="mt-3"
          >
            <input
              value={newSub[g.id] ?? ""}
              onChange={(e) => setNewSub({ ...newSub, [g.id]: e.target.value })}
              placeholder="Add a subgoal"
              className="w-full rounded-lg bg-[var(--color-panel-2)] px-3 py-2 text-[13px] outline-none"
            />
          </form>
        </section>
      ))}

      <form
        onSubmit={(e) => {
          e.preventDefault();
          if (!newGoal.trim()) return;
          const title = newGoal;
          setNewGoal("");
          call("/api/goals", { method: "POST", body: JSON.stringify({ title, pillar_id: pillarId(newPillar) }) });
        }}
        className="flex gap-2"
      >
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="New goal"
          className="min-w-0 flex-1 rounded-lg bg-[var(--color-panel)] px-3 py-2 text-[14px] outline-none"
        />
        <select
          value={newPillar}
          onChange={(e) => setNewPillar(e.target.value)}
          className="shrink-0 rounded-lg bg-[var(--color-panel)] px-2 py-2 text-[13px] outline-none"
        >
          {pillars.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name.split(" ")[0]}
            </option>
          ))}
        </select>
      </form>
    </div>
  );
}
```

`pillarId` maps by `sort_order` position, which matches the seeded ids 1/2/3. If a pillar is ever added, replace it with a real id lookup.

- [ ] **Step 3: Verify and commit**

```bash
npx tsc --noEmit
npm run build
git add src/app/goals src/components/GoalEditor.tsx
git commit -m "feat: add /goals editor screen for goals, subgoals and weight overrides"
```

---

## Task 16: Visual check, then clear the placeholders

**Files:** none — this is verification plus one confirmed data change.

- [ ] **Step 1: Run it and look**

```bash
npm run dev
```

Check on **desktop and the iPhone**:

- Adherence ring: number inside, amber, obviously the hero. Before anything is due today it shows `—` on a neutral track, **not a 0% ring**.
- Three pillar sections in the right column, each ring-led. Physical shows gym (live) and steps (dashed ghost, "no data source yet").
- Every ring's fact line reads `N of M days · day K of 14` while the window is still filling.
- Ticking a subgoal moves the parent bar immediately.
- Tapping a skill reveals +15/+30/+60; logging updates the fortnight number and the Portfolio ring.
- The gym toggle fills the gym subring.
- On the phone, three small rings sit in the header and the old text chips are gone.
- Nothing overflows horizontally at 375px width.

- [ ] **Step 2: Confirm the placeholder deletion with the owner**

Show them the statement and the current rows before running anything:

```bash
node -e "
const {createClient}=require('@libsql/client');
const db=createClient({url:'file:./data/dashboard.db'});
db.execute(\"SELECT id,skill_id,date,minutes,note FROM skill_time WHERE note='seeded'\").then(r=>console.log(r.rows));
"
```

Expected: the 5 rows dated `2026-08-04`, all with `note = 'seeded'`.

- [ ] **Step 3: Back up, then delete**

```bash
cp data/dashboard.db "data/backups/dashboard.db.$(date +%Y%m%d-%H%M%S).pre-seed-clear.bak"
node -e "
const {createClient}=require('@libsql/client');
const db=createClient({url:'file:./data/dashboard.db'});
(async()=>{
  const r=await db.execute(\"DELETE FROM skill_time WHERE note='seeded'\");
  console.log('deleted',r.rowsAffected);
  console.log((await db.execute('SELECT COUNT(*) n FROM skill_time')).rows);
})();
"
```

Expected: `deleted 5`, then `n: 0`.

They are deleted rather than re-dated because they are **fabricated** lifetime estimates. Re-dating would preserve an invented lifetime total permanently, and once real taps land, invented hours could never be told from real ones.

- [ ] **Step 4: Confirm the skills section still reads sensibly**

Reload. Every skill should show `—` for the fortnight and `—` for lifetime, no bars, and the "Nothing logged in the last 14 days" line. Parked skills must still be listed.

- [ ] **Step 5: Commit**

```bash
git commit --allow-empty -m "chore: clear fabricated skill_time seed rows after visual verification"
```

---

## Task 17: Documentation

**Files:**
- Modify: `docs/HANDOFF.md`, `CLAUDE.md`

- [ ] **Step 1: Amend the constitution**

In `CLAUDE.md`, under `## Explicitly cut — do not build, do not half-build`, remove the `Step tracking / iOS Shortcut` line and add a new section above it:

```markdown
## Planned, source pending

- **Steps.** The `steps` ring metric exists in `src/lib/rings.ts` with `sourceReady: false`,
  so it renders as a ghost and is excluded from the Physical pillar's average. Threshold is
  7k/day, 12 qualifying days of 14. Wiring a source (an iOS Shortcut POSTing one number) is
  separate work. **Sleep is not planned** — it has no source and no ring.
```

Without this the code and the constitution contradict each other.

- [ ] **Step 2: Update the handoff**

In `docs/HANDOFF.md`:

- §2 file map: add `src/lib/rings.ts`, `src/lib/goals.ts`, `src/components/PillarRing.tsx`, `src/components/PillarSections.tsx`, `src/components/GoalEditor.tsx`, `src/app/goals/page.tsx`, and the four new API routes. Remove `src/components/GoalsSkills.tsx`.
- §2: note that `/api/goals` and `/api/skills` are **live now**, not dead.
- §3: `gym_sessions` is live; `tasks` still holds the original gym rows (copied, not moved).
- §1 table: Goals and Skills are no longer "read-only in UI".
- §5: strike "Not a git repository" and "Goals and skills are seed-only".

- [ ] **Step 3: Final verification**

```bash
npm test && npx tsc --noEmit && npm run build
```

Expected: all three exit 0.

- [ ] **Step 4: Commit**

```bash
git add docs/HANDOFF.md CLAUDE.md
git commit -m "docs: update handoff and amend the steps constraint in the constitution"
```

---

## Self-review notes

**Spec coverage** — every section maps to a task: §1 → Tasks 3, 7, 9, 13, 15 · §2 → Tasks 6, 8, 10, 13, 16 · §3 → Tasks 4, 6, 10, 11, 13, 14 · §4 → Task 5 · §5.1 → Task 12 · §5.4 → Tasks 1-4 · §5.5 → Task 17 · §6 → task order.

**Two deliberate refinements on the spec:**

1. `Metric` gains `unit: "days" | "sessions"`. Spec §3.6 mandated one fact-line format ending in "days", but §3.2 establishes that skill sessions are explicitly *not* day-capped — calling them days would be false. The format shape is unchanged; only the noun varies.
2. `/api/rings` also returns `gymToday`, so the gym toggle knows its own state without a second round trip.

**Not covered by any task, by design:** coach changes (spec §3.12, deferred), `POST /api/health` (spec §7), and deleting the HANDOFF §3 dead files (spec §7).
