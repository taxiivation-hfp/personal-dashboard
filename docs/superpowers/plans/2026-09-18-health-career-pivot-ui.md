# The Health & Career pivot — UI implementation plan

Derived from `docs/superpowers/specs/2026-09-18-health-career-pivot-design.md` (every item there
is an owner decision — **do not re-litigate it**) and from the finished, uncommitted foundation
in `src/lib/**`, `src/app/api/**` and `src/lib/db/client.ts`.

**Five builders work IN PARALLEL in one working tree.** Everything below is written so that no
two of you ever open the same file, and so that nobody has to wait for anybody: every
cross-component type is pinned in §3 and you build against the pinned contract, never against
what the file currently says.

---

## 0. HARD SAFETY RULES — read before you touch anything

- **`.env.local` points `DATABASE_URL` at PRODUCTION Turso.** Never run the app, a script, a
  migration or a node snippet that loads `.env.local` or `src/lib/db/client.ts` without
  overriding `DATABASE_URL`.
- The only sanctioned way to run the app (bash):
  ```
  DATABASE_URL=file:./data/pivot.db NEXT_DIST_DIR=.next-build/pivot DEV_CALENDAR_FIXTURE=data/calendar-fixture.json npx next dev -p 3001
  ```
  **Do not start it during parallel work** — port 3001 and `.next-build/pivot` are shared and two
  servers will fight. The integration pass (§9) runs it once, at the end.
- Never run `scripts/migrate.mjs` or `scripts/db-copy.mjs`.
- **No git commit, push, checkout, reset or stash.** Leave everything in the working tree.
- Never delete user data. No DROP.
- Tests: `npm test`. Typecheck: `npx tsc --noEmit`. Neither may be "fixed" by editing another
  worker's file — see §1.4.

---

## 1. Workers, ownership, and the rules that make parallel safe

### 1.1 The five workers

| Worker | Owns (may edit / create / delete) |
|---|---|
| **SHELL** | `src/components/Today.tsx`, `src/components/PhoneTabs.tsx`, `src/app/page.tsx`, `src/app/globals.css`, **new** `src/components/FloatingTasks.tsx`, **delete** `src/components/CalendarColumn.tsx`, **delete** `src/components/NextUp.tsx`, **new** `archive/social/Today.tsx.md` |
| **BLOCKS** | `src/components/BlockList.tsx`, **new** `src/components/DriftPopover.tsx` |
| **RECENT** | `src/components/PillarSections.tsx`, `src/components/PillarRing.tsx`, `src/components/StatsLink.tsx`, **new** `src/components/AdherenceTracker.tsx`, **new** `archive/social/PillarRing.tsx.md`, **new** `archive/social/PillarSections.tsx.md`, `archive/social/README.md` |
| **GOALS** | `src/components/GoalEditor.tsx`, `src/components/Timeline.tsx`, `src/app/goals/page.tsx`, `src/app/skills/page.tsx` |
| **RECORD** | `src/components/Dashboard.tsx`, `src/components/DayLog.tsx`, `src/components/SessionHistory.tsx`, `src/components/ProductivityLog.tsx`, `src/components/HoursTotal.tsx`, `src/components/AdherenceLog.tsx`, `src/components/DayChart.tsx`, `src/components/NoteLog.tsx`, `src/components/ColourEditor.tsx`, `src/components/CalorieInput.tsx`, `src/components/StepsLog.tsx`, `src/components/WeightLog.tsx`, `src/components/CalorieLog.tsx`, `src/components/StepsChart.tsx`, `src/components/WorkoutLog.tsx`, `src/app/stats/page.tsx`, `src/app/sessions/page.tsx`, `src/app/colours/page.tsx`, **new** `archive/social/Dashboard.tsx.md` |

### 1.2 Files nobody may touch

`src/lib/**` (the foundation is done and `npm test` is pinned against it), `src/app/api/**`,
`src/lib/db/**`, `src/app/layout.tsx`, `src/app/login/page.tsx`, `src/app/habits/page.tsx`,
`src/app/calories/page.tsx`, `src/app/journal/page.tsx`, `CLAUDE.md`, `DESIGN.md`, `PRODUCT.md`,
`docs/**`, `package.json`, `tsconfig.json`, `next.config.ts`, `data/**`, `scripts/**`.

### 1.3 Files that are explicitly left alone, so nobody "tidies" them

- `src/components/SkillsEditor.tsx`, `src/components/SkillLog.tsx` — skills are HIDDEN, not
  deleted (spec §1). Both become unimported after this pass. **Leave them on disk, unedited.**
  They still compile, and the data behind them is kept.
- `src/components/StreakFlame.tsx`, `HabitBox.tsx`, `Sheet.tsx`, `ChapterName.tsx`,
  `StepsRefresh.tsx`, `JournalPanel.tsx`, `JournalText.tsx`, `JournalCanvas.tsx`,
  `JournalReader.tsx`, `JournalDrawing.tsx`, `WeightEntry.tsx`, `CalorieHistory.tsx`,
  `HabitEditor.tsx` — no change.
- `/api/adherence` still accepts `center=` and still returns the per-day `blocks` summary. After
  `CalendarColumn` is deleted neither has a reader. That is the foundation's decision; leave it.

### 1.4 The rules that keep five people out of each other's way

1. **Build against §3, not against the current file.** If `PillarSections` calls a `PillarRing`
   export that does not exist yet, write the call exactly as §3 pins it and move on. It will
   compile when RECENT lands.
2. **Never edit a file you do not own to make your typecheck pass.** To read only your own
   errors:
   ```
   npx tsc --noEmit 2>&1 | grep -F "src/components/Today.tsx"
   ```
   Expect errors from the other four workers' files for the whole of the parallel phase. They
   are not yours.
3. **Only SHELL edits `src/app/globals.css`.** Every token and class the other four need is
   pre-decided in §2 with its exact value. Do not add a token; do not inline a hex that §2 names.
4. **Do not add, move or rename anything in `src/lib`.** If you believe a lib change is needed,
   stop and report it instead — a lib edit breaks `npm test` for everyone.
5. **Do not start a dev server.** See §0.
6. `archive/social/README.md` is owned by **RECENT** only. The other three write their own
   `archive/social/<Component>.tsx.md` file and nothing else; RECENT adds their rows to the table.

---

## 2. CSS — every token and class, pre-decided. SHELL adds them; the rest just use them.

SHELL makes exactly these edits to `src/app/globals.css`. Nobody else opens the file.

### 2.1 Tokens changed

```css
/* in @theme */

/* Was #67609b (Iris). CAREER is Plum by the owner's ruling (spec §1); the migration stores it
 * on the `portfolio` row, and this is the default the app falls back to when no colour is set.
 * The KEY stays `portfolio` — renaming a live key is churn — and the NAME comes from
 * PILLAR_NAME in rings.ts. Measured on the page ground: 5.09:1 as a stroke, 5.93:1 with white
 * on top, so it clears both the stroke floor and the filled-chip test. */
--color-portfolio: #7d5a72; /* CAREER · 5.09 on bg · 5.93 with white */

/* unchanged value, comment updated */
--color-physical: #467c6c; /* HEALTH · 4.02 on bg · 4.68 with white */
```

**Delete** `--color-social: #8c7434;` and its comment. Nothing reads it after this pass.

### 2.2 Tokens added

```css
/* in @theme */

/* A non-negotiable with NO pillar — Journal, Read, Tidy room (spec §5). Warm grey, and
 * deliberately the same value as --color-drifted rather than a ninth invented neutral: that
 * grey is already certified both ways, which is what a habit tick needs (it is a filled box
 * with a WHITE tick inside it, so it must pass the 4.5:1 chip test as well as the 3:1 mark
 * floor). Two names for one value, kept apart because one is a BLOCK STATE and the other is
 * the absence of a pillar; renaming either must not silently move the other. */
--color-neutral: #7b746a; /* no pillar · 3.97 on bg as a mark · 4.62 with white */

/* The adherence tracker's average numeral, over the tracker's own amber area (spec §4).
 * NOT a second accent: it is --color-accent one step down in lightness, the same move
 * segmentShade makes on a pillar hue, and it exists because a figure printed over a tint of
 * its own colour has to be darker than that tint to read. Measured on --color-surface-3
 * (the gold window, where the tracker lives): 5.69:1, clear of the body-text floor. */
--color-accent-deep: #7a5322; /* the tracker's average · 5.69 on surface-3 */
```

### 2.3 Class added — `.popover`

The drifted editor (BLOCKS) and the `+N more` task list (SHELL) both use it. Add it near
`.record-card`:

```css
/* A SMALL SURFACE THAT FLOATS OVER THE PAGE, and the app's third such thing after the dialog
 * and the timeline's cards.
 *
 * NO SHADOW. The only light this app ships is the window bevel, the ring bloom and the streak
 * pill's glow, and a popover is not worth a fourth exception. What separates it from whatever
 * it overlaps is an OPAQUE ground plus the window's own three-step bevel and a 2px halo in the
 * page colour — a cut-out rather than a lift. It reads as "in front" because it interrupts
 * what is behind it, which is the honest cue and costs no new colour.
 *
 * Positioning is the caller's: this class sets no top/left and no z-index beyond the token, so
 * one popover can be fixed to the viewport and another absolute inside a card. */
.popover {
  position: relative;
  z-index: var(--z-popover);
  border-radius: 12px;
  background: var(--color-panel);
  border: 1px solid var(--color-line-strong);
  border-top-color: var(--color-line);
  border-bottom-color: var(--color-line-edge);
  outline: 2px solid var(--color-bg);
  outline-offset: 0;
}
```

### 2.4 Classes deleted

- `@keyframes spark-rise` and `.motion-spark`, plus the `.motion-spark` entry in the
  `prefers-reduced-motion` block. Their only consumer was `StatsLink`'s sparkline, which the
  spec removes (§4, "the 14-bar sparkline is removed").
- `.pillar-enter` and `.pillar-ghost`, plus their entries in the `prefers-reduced-motion` block.
  Their only consumer was `PillarSections`' three-pillar ghost/push machinery, which goes with
  the third pillar (§6.3).

### 2.5 Classes that STAY and are used by this pass

`.window`, `.panel`, `.panel-row[data-record]`, `.panel-row[data-timeline]`, `.panel-fade`,
`.panel-swap`, `.pane-enter`, `.pane-grid`, `.rail-label`, `.tl-layer`, `.phone-expand`,
`.record-card`, `.section-head`, `.page-margin`, `.motion-data`, `.motion-arc`, `.motion-slide`,
`.ring-bloom`, `.pillar-bloom`, `.ring-flip`, `.detail-enter`, `.streak-flame`, `.worked-range`,
`.today-mark`, `.sheet*`.

`.today-mark` loses its only consumer (`CalendarColumn`). **Keep the class** — it is the app's one
gradient and re-inventing it later costs more than the 20 lines. Add one comment line saying its
consumer was the calendar column and it is currently unused.

### 2.6 Everyone else: no new CSS

If you need a colour, use a token from §2.1–2.2 or an existing one. If you need a shape, use a
Tailwind utility. **Do not add a `<style>` tag, do not add a token, do not inline a raw hex.**
The one sanctioned exception is an SVG `fill`/`stroke` that is computed at runtime
(`segmentShade`, `toneColor`), which is how the rings already work.

---

## 3. PROPS CONTRACTS — pinned. Build against these.

### 3.1 From the foundation (`src/lib`, already on disk — read, do not change)

```ts
// @/lib/rings  — import-free, safe in a client component
type PillarKey = "physical" | "portfolio";
const PILLAR_ORDER: readonly PillarKey[];            // ["physical","portfolio"]
const PILLAR_NAME: Record<PillarKey, string>;        // {physical:"Health", portfolio:"Career"}
const PILLAR_PALETTE: { name: string; hex: string }[];
const PILLAR_DEFAULT_VAR: Record<PillarKey, string>;
const STEPS_FLOOR: 7000;
const CALORIE_FLOOR: 2500;                           // ITS HOME IS HERE NOW
const WINDOW_DAYS: 14;
type WorkoutKind = "strength" | "cardio";

type ArcView   = { key: string; label: string; weight: number; fill: number | null; fact: string };
type HealthArc = ArcView & { key: HealthMetricKey; count: number; required: number;
                             workoutKind: WorkoutKind | null };
type CareerArc = ArcView & { goalId: number; deadline: string; progress: number; expected: number };
type HealthRingView = { key: "physical";  name: string; fill: number | null; arcs: HealthArc[] };
type CareerRingView = { key: "portfolio"; name: string; fill: number | null; arcs: CareerArc[] };
type PillarRingView = HealthRingView | CareerRingView;

// @/lib/career — imports only dates.ts + rings.ts, safe in a client component
function buildCareerRing(goals: CareerGoal[], today: string): CareerRingView;  // GoalView[] satisfies it
function goalFact(progress: number, deadline: string, today: string): string;  // "60% · due 30 Sep"
function dueLabel(deadline: string, today: string): string;                    // "due 30 Sep"
function countsTowardCareer(g: { status: string; deadline: string | null }): boolean;

// @/lib/productivity — the score is GONE
type HourCategoryLabel = "Work Projects" | "Work Uni" | "Work Part Time" | "Uni";
const CATEGORY_ORDER: readonly HourCategoryLabel[];
type CategoryMinutes = { label: HourCategoryLabel; colorId: string | null; minutes: number };
type DayHours = { minutes: number; categories: CategoryMinutes[] };

// @/lib/queries
type GoalView = { id; title; target: string|null; progress: number; status: string;
                  subgoals: SubgoalView[]; overAllocated: boolean;
                  deadline: string|null; createdAt: string; completedAt: string|null };
                  // NO `pillar` field. Every goal is a Career goal.
type HabitView = { …; pillar: PillarKey | null; … };   // null = neutral
type DayTaskView = { id: number; title: string; due: string; doneOn: string|null;
                     done: boolean; carried: number };
type DayView = { …; pillars: PillarView[]; habits; oneOffs; tasks; blocks; adherence; … };
                  // DayView has NO `productivity` field.
```

### 3.2 HTTP — what the screens actually call

| Call | Owner of the fetch | Shape |
|---|---|---|
| `GET /api/today?date=` | `Today.tsx` (`refresh`) | `DayView` |
| `GET /api/rings?date=` | `Today.tsx` (`loadRings`) **and** `Dashboard.tsx` | `{date, from, workouts, facts:{workoutSessions}, pillars:[HealthRingView, CareerRingView]}` |
| `GET /api/adherence?days=8&to=<today>` | `Today.tsx` (`loadTracker`) | `{days:[{date,isToday,isFuture,pct,workedHours,totalHours,…,hours:DayHours|null,blocks:[…]}]}` |
| `GET /api/adherence?days=<30\|90\|365>&to=<date>` | `Dashboard.tsx` | same |
| `GET /api/productivity?date=` | `ProductivityLog.tsx` | `{date, calendarConnected, hours:DayHours|null, categories:[{label,colorId}], ignored:[{title,minutes,colorId,state,reason}]}` |
| `POST /api/blocks` | `BlockList.tsx` | `{ok:true, state: BlockState|null}` — the RESULTING state |
| `PATCH /api/subgoals/:id` · `PATCH /api/goals/:id` · `POST /api/goals` | `Today.tsx` (`mutateGoals`) and `GoalEditor.tsx` | `{goals: GoalView[]}` |
| `PATCH /api/tasks` | `Today.tsx` (`toggleTask`) | — |
| `GET /api/gym/history` | `PillarSections.tsx` (lazy, on the first Health drill-down) | `{sessions: Workout[]}` |
| `GET /api/trends`, `/api/goals`, `/api/tasks?all=1` | `Dashboard.tsx` | (see §8) |

**Removed fetches:** `StatsLink` no longer fetches anything. `Today.tsx` no longer fetches
`/api/skills`. Nothing calls `/api/adherence?center=` any more. `Dashboard.tsx` drops
`/api/goals` and `/api/tasks?all=1` (see §8.1).

### 3.3 `src/components/PillarRing.tsx` — owned by RECENT, consumed by SHELL, RECENT, RECORD

```ts
// DEFAULT EXPORT — unchanged, minus `overdrive`.
export default function Ring(props: {
  fill: number | null;          // null = ghost (no arc drawn)
  size: number;
  stroke: number;
  tone: PillarKey | "accent";
  color?: string | null;        // the owner's chosen hue wins
  dashed?: boolean;             // dashed TRACK — "no source"
  bloom?: boolean;              // the hero's lamp
  children?: ReactNode;         // centred content
}): JSX.Element;

export const toneColor: (tone: PillarKey | "accent", color?: string | null) => string;
export const TONE_HEX: Record<PillarKey | "accent", string>;
  // { accent:"#9a6a2e", physical:"#467c6c", portfolio:"#7d5a72" }   ← MUST track globals.css §2.1
export function segmentShade(hue: string, i: number): string;   // unchanged implementation

/** A pillar as ONE segmented donut of ONE thickness (spec §1). */
export function SegmentedRing(props: {
  /** One arc each, in order. `ArcView[]` from rings.ts satisfies this exactly — pass
   *  `ring.arcs` straight through. Weights sum to 1; `fill` null = a dashed ghost arc. */
  arcs: { key: string; weight: number; fill: number | null }[];
  /** The WHOLE ring is a ghost: one dashed full-circle track, no arcs, no fill. Career with
   *  no counted goal (spec §1: an empty dashed ghost labelled "no goals", never "0%"). */
  ghost?: boolean;
  size: number;                 // the SVG's logical box is exactly size × size — no label pad
  stroke: number;
  tone: PillarKey;
  color?: string | null;
  glow?: boolean;               // the pillar's own constant lamp
  spin?: boolean;               // idle rotation, slowed on hover
  kick?: number;                // counter — each increment buys one fast turn
  children?: ReactNode;         // the centre: the pillar %, or "no goals"
}): JSX.Element;
```

**Removed exports** (RECENT deletes them; nobody may import them):
`RingSegment`, `EventItem`, `socialBands`, `portfolioBands`, `bandsForPillar`, `LABEL_PAD_X`,
`LABEL_PAD_Y`, and the `social_capital` entries in `TONE` / `TONE_HEX`. The `mid` and `outer`
bands, the arc-riding label system and the `overdrive` lap all go (spec §1: "No outer laps, no
mid band, no overdrive drawing").

### 3.4 `src/components/PillarSections.tsx` — owned by RECENT, called by SHELL

```ts
export type TrackerDay = { date: string; pct: number; isToday: boolean };

export default function PillarSections(props: {
  /** null until /api/rings lands. */
  health: HealthRingView | null;
  /** Derived client-side from `goals` — never null. See §5.4. */
  career: CareerRingView;
  colors: Partial<Record<PillarKey, string | null>>;
  /** Sessions logged ON the viewed day — the Log buttons' chips. */
  workouts: Workout[];
  /** Every non-dropped goal, for Career opened. [] before the first load. */
  goals: GoalView[];
  /** 8 days ending on the REAL today: 7 past, then today. [] until it lands. */
  tracker: TrackerDay[];
  /** The day the dashboard is standing on. */
  date: string;
  /** The real today — the workout dialog's date cap, and the tracker's anchor. */
  today?: string;
  onSubgoal: (id: number, done: boolean) => Promise<void>;
  onGoalDone: (id: number, done: boolean) => Promise<void>;
  onSaveWorkout: (kind: WorkoutKind, note: string, id: number | null, date: string) => Promise<void>;
  onDeleteWorkout: (id: number) => Promise<void>;
  /** A tracker dot tapped — the dashboard steps to that day (goToDay). */
  onOpenDay: (date: string) => void;
  /** The record — opens in place on desktop, expands to /stats on the phone. */
  onOpenRecord: () => void;
}): JSX.Element;
```

**Removed props:** `rings`, `facts`, `skills`, `skills14`, `socialEvents`, `oneOffEvents`,
`onLogSession`, `onDeleteSession`.

### 3.5 `src/components/AdherenceTracker.tsx` — NEW, owned by RECENT

```ts
export default function AdherenceTracker(props: {
  /** 8 days, oldest first, ending on the REAL today. Fewer than 8 renders the frame and "—". */
  days: TrackerDay[];
  /** The day the dashboard is on — its dot takes a 1.5px ink ring. */
  viewing: string;
  onDay: (date: string) => void;
}): JSX.Element;
```

### 3.6 `src/components/StatsLink.tsx` — owned by RECENT

```ts
export default function StatsLink(props: { onOpen: () => void }): JSX.Element;
```

No `date` prop, no fetch, no sparkline. Keep `aria-haspopup="dialog"`.

### 3.7 `src/components/BlockList.tsx` — owned by BLOCKS, called by SHELL

```ts
export default function BlockList(props: {
  date: string;
  blocks: Block[];          // @/lib/adherence — graphite and all-day are already filtered out
  onChanged: () => void;
  isToday?: boolean;
}): JSX.Element;
```

**Signature unchanged.** The overflow rule is BlockList's own business (§6.1) — SHELL passes no
budget. BlockList does **not** render a section head; SHELL owns the head and the TIMELINE button.

### 3.8 `src/components/DriftPopover.tsx` — NEW, owned by BLOCKS

```ts
export default function DriftPopover(props: {
  /** The row's own box in VIEWPORT coordinates — getBoundingClientRect() of the <li>. */
  anchor: DOMRect;
  title: string;
  /** The block's own span in minutes, for "48 min of 2h". null when it has no usable span. */
  totalMinutes: number | null;
  worked: number;                       // 0..1, follows the thumb
  reason: string;
  onWorked: (v: number) => void;        // every input event
  onCommitWorked: () => void;           // pointerup / keyup / blur
  onReason: (v: string) => void;
  onSave: () => void;                   // Save — commit then close
  onClose: () => void;                  // outside click / Escape — COMMITS, then closes
}): JSX.Element;
```

### 3.9 `src/components/FloatingTasks.tsx` — NEW, owned by SHELL

```ts
export default function FloatingTasks(props: {
  tasks: DayTaskView[];
  onToggle: (id: number, done: boolean) => void;
  /** The hero block — the ring and its caption. FloatingTasks owns the BAND and lays the
   *  rails out either side of this. */
  children: ReactNode;
}): JSX.Element;
```

Returns `children` in a plain centred wrapper when `tasks.length === 0` — no empty rails, no
placeholder (spec §4: "No tasks → nothing is drawn").

### 3.10 `src/components/Timeline.tsx` — owned by GOALS, called by SHELL

```ts
export default function Timeline(props: {
  today: string;
  goals: GoalView[];
  /** NEW: a goal sticky note's tick box. done=true → status 'done'; false → 'active'. */
  onGoalDone: (id: number, done: boolean) => Promise<void>;
}): JSX.Element;
```

### 3.11 `src/components/GoalEditor.tsx` — owned by GOALS

```ts
export default function GoalEditor(props: { initial: GoalView[] }): JSX.Element;
```

`pillars` prop removed (spec §1: "the pillar picker on /goals goes").

### 3.12 `src/components/CalorieInput.tsx` — owned by RECORD, called by SHELL

```ts
export default function CalorieInput(props: {
  date: string;
  today?: string;
  calories: number | null;
  entries: CalorieEntry[];
  streak?: number;
  /** NEW (spec §5): the Health tone, resolved by the caller through toneColor so the owner's
   *  /colours choice reaches this box. Replaces the hard-coded var(--color-physical). */
  tone: string;
  onChanged: () => void;
}): JSX.Element;
```

### 3.13 `src/components/DayChart.tsx` — owned by RECORD

```ts
export type ChartSegment = {
  key: string;
  /** RENAMED from `points`. The stack is MINUTES now — the score is gone, so there is no
   *  second magnitude to carry beside it and the `minutes` side-channel goes with it. */
  minutes: number;
  fill: string;
  label?: string;
};
export type ChartPoint = { date: string; value: number | null; segments?: ChartSegment[] };
// NEW optional prop on DayChart: format?: (n: number) => string
//   — how a value is printed in the tooltip and the legend. The Hours card passes asTime.
```

### 3.14 `src/components/PhoneTabs.tsx` — owned by SHELL

```ts
export type PhoneTab = "today" | "pillars";      // "calendar" is gone
const ORDER: PhoneTab[] = ["today", "pillars"];  // module-private
```

`PhoneSwipe`'s signature is unchanged.

---

## 4. The layout — mockup D, measured

Target: the owner's Chrome window, **1858 × 960 CSS px**. **At rest nothing scrolls** — not the
page, not a window. Things you OPEN may scroll inside themselves.

### 4.1 The budget, derived

```
masthead            ≈  75px   (text-heading 28/1.2 + py-5 + 1px rule)
content padding        48px   (lg:pt-6 + lg:pb-6)
------------------------------
row height          ≈ 837px
window padding         48px   (lg:p-6 top + bottom)
------------------------------
INNER HEIGHT of every window ≈ 789px      ← every worker's height budget
```

```
viewport                    1858px
page padding (lg:px-6)      − 48
two gutters (lg:gap-4)      − 32
------------------------------------
row width                   1778px  split by flex-grow
```

### 4.2 The three windows, left to right

| # | `data-panel` | Surface | `--panel-grow` | `--panel-min` | width @1858 | inner width |
|---|---|---|---|---|---|---|
| 1 | `blocks` | `--color-surface-2` (lilac) | `1` | `15rem` | ≈ 450 | ≈ 402 |
| 2 | `today` | `--color-surface-1` (warm) | `1.7` | `26rem` | ≈ 765 | ≈ 717 |
| 3 | `pillars` | `--color-surface-3` (gold) | `1.25` | `17rem` | ≈ 563 | ≈ 515 |

`order-1 / order-2 / order-3` in that same left-to-right order. Source order stays
**today → blocks → pillars** so the phone's document leads with the day's work, exactly as now.

`.panel-row[data-record]` keeps working untouched: the record still collapses `blocks` to the
rail and `today` to zero. SHELL only has to rename the `data-panel="calendar"` attribute to
`data-panel="blocks"` in Today.tsx **and** SHELL updates the two matching selectors in
globals.css (`.panel-row[data-record] [data-panel="calendar"]` and the `.panel-fade` rule beside
it) to `[data-panel="blocks"]`.

### 4.3 Vertical budget per window (desktop, live day)

**TODAY (789px):**
```
header card (date line + day title)            ≈  92
gap                                                40
hero band (ring 240 + caption ~34)             ≈ 274   ← tasks float inside this band
gap                                                40
checklist (2 cols, ~6 rows × 41 + edit link)   ≈ 266
------------------------------------------------------
                                               ≈ 712   ✓ 77px slack
```
On a past day the catching-up bar adds ≈ 85 (45 + gap) → ≈ 797. That is 8px over; SHELL takes it
back by dropping the hero band gap from `gap-10` to `gap-8` when `back > 0`.

**RECENT (789px):**
```
two rings side by side (200 + 8 + name 22 + 4 + 5 part lines ≈ 100)  ≈ 334
gap                                                                     16
tracker card                                                        ≈ 220
gap                                                                     16
record link                                                         ≈  44
------------------------------------------------------------------------
                                                                    ≈ 630   ✓ 159px slack
```

**BLOCKS (789px):**
```
section head ("Today's blocks" + TIMELINE)   ≈  34
gap                                              16
list                                            739
------------------------------------------------------
full three-line row                          ≈  86  →  8 rows fit
collapsed one-line row                       ≈  34
```

### 4.4 Phone (< 64rem)

Two panes, `PhoneTab = "today" | "pillars"`:
- **Today** — the date card, the hero ring with its floating tasks, **the blocks list**, then the
  checklist. Spec §4: the blocks list sits inside Today, above the checklist.
- **Pillars** — the two rings, the tracker, the record link.
- The BLOCKS window is `hidden lg:flex` on the phone. Its content is rendered a **second time**
  inside Today's pane under `lg:hidden` (§5.6). Two `BlockList` instances mount; only one is ever
  visible. Both read the same `data.blocks` and call the same `refresh`.

---

## 5. SHELL

**Owns:** `src/components/Today.tsx`, `src/components/PhoneTabs.tsx`, `src/app/page.tsx`,
`src/app/globals.css`, new `src/components/FloatingTasks.tsx`, deletions of
`CalendarColumn.tsx` and `NextUp.tsx`, new `archive/social/Today.tsx.md`.

### 5.1 globals.css

Exactly §2. Nothing else.

### 5.2 `src/app/page.tsx`

- Drop `listSkills` from the import and from the `Promise.all`.
- Drop the `skills` prop on `<Today>`.
- Everything else (the `?date=` clamp, `?view=timeline`, `getCalendarForDate`) is unchanged.

### 5.3 `PhoneTabs.tsx`

- `export type PhoneTab = "today" | "pillars";`
- `const ORDER: PhoneTab[] = ["today", "pillars"];`
- Update the docblock: two panes, opens on Today, no calendar pane.
- `PhoneSwipe` body unchanged.

### 5.4 `Today.tsx` — what is DELETED

- `NextUp` and `CalendarColumn` imports and both render sites. **Delete both files** after.
- `calEpoch` state and its `setCalEpoch` in the timeline machine (its only job was remounting the
  calendar column). Leave the explanatory comment inside the timeline docblock, trimmed.
- The whole week-strip `<section className="record-card">` — the percentages row, the 3px
  adherence bars, the productivity stacks, the letters row, the legend, the transparent overlay
  buttons. With it: `StripDay`, `STRIP_GAP_PCT`, `slabFill`, `peak`, `stackKey`, `strip` state,
  `loadStrip`, and the `StreakFlame` in that card's head.
- `scoreDay` state and the `<ProductivityLog>` mount. Today no longer opens a breakdown.
- `socialEvents`, `oneOffEvents`, `skills14`, `facts` state, and their reads in `loadRings`.
- `skills` state, `initialSkills` prop, `mutateSkills`, and the `/api/skills?date=` fetch inside
  `goToDay` (which becomes a single `fetch`, not a `Promise.all`).
- The full-width TASKS band under the checklist (`data.tasks.length > 0 && …`). Tasks float now.
- Imports: `CALENDAR_RATES`, `ProductivitySegment`, `projectedColour`, `SLAB_GYM`, `SLAB_NEUTRAL`,
  `pillarCaption`, `PillarFactInput`, `SkillView`, `SkillSlice`, `ProductivityLog`.
- `max-w-[92rem]` on **both** the masthead's inner grid and the content wrapper.

### 5.5 `Today.tsx` — what is ADDED / CHANGED

**State and loaders**

```ts
const [tracker, setTracker] = useState<TrackerDay[]>([]);
const loadTracker = useCallback(() => {
  fetch(`/api/adherence?days=8&to=${today}`)
    .then((r) => r.json())
    .then((s) => !s.error && setTracker(s.days ?? []))
    .catch(() => {});
}, [today]);
useEffect(loadTracker, [loadTracker]);
// refresh() calls loadTracker() where it used to call loadStrip().
```

`loadRings` keeps only the Health half:
```ts
const [health, setHealth] = useState<HealthRingView | null>(null);
// inside the .then:  setHealth((s.pillars ?? []).find((p) => p.key === "physical") ?? null);
//                    setWorkouts(s.workouts ?? []);
```

**Career is rebuilt on the client** — this is load-bearing, not an optimisation. Ticking a
subtask must move the Career ring without a round trip, and `buildCareerRing` is the same
function `/api/rings` uses, so the two can never disagree:
```ts
import { buildCareerRing } from "@/lib/career";
const career = useMemo(() => buildCareerRing(goals, data.date), [goals, data.date]);
```
The `portfolio` entry that `/api/rings` returns is ignored on this screen.

**A new mutation, passed to two places**
```ts
const onGoalDone = (id: number, done: boolean) =>
  mutateGoals(`/api/goals/${id}`, {
    method: "PATCH",
    body: JSON.stringify({ status: done ? "done" : "active" }),
  });
```

**The habit tone map** — `habitTone` keeps its shape but neutral changes:
```ts
const habitTone = (pillar: PillarKey | null | undefined) =>
  pillar ? toneColor(pillar, colors[pillar]) : "var(--color-neutral)";
```
Note the change: an unassigned habit is now the NEUTRAL warm grey, not the amber accent. **One-off
non-negotiables keep the amber accent** (spec §5) — that branch is separate and stays
`var(--color-accent)`.

**The Steps row** stops hard-coding: `tone={habitTone("physical")}` on its `HabitBox`.
**The Calories row** passes the same: `<CalorieInput … tone={habitTone("physical")} />`.

**The hero** (spec §4): ring 240, stroke 10, 52px numeral, one caption line.
```tsx
<Ring fill={a.pct / 100} size={240} stroke={10} tone="accent" bloom>
  <div className="flex items-end">
    <span className="stat-hero text-hero">{a.pct}</span>
    <span className="stat-hero pb-2 text-body text-[var(--color-muted)]">%</span>
  </div>
</Ring>
<p className="mt-3 text-center text-micro text-[var(--color-muted)]">
  {round1(a.workedHours)} of {round1(a.totalHours)}h blocked
  {a.habitsScheduled > 0 && <> · {a.habitsDone} of {a.habitsScheduled} ticked</>}
</p>
{a.unmarked > 0 && <p className="mt-1 text-center text-micro text-[var(--color-ink)]">{a.unmarked} to mark</p>}
```
Wrap the whole hero block in `<FloatingTasks tasks={data.tasks} onToggle={toggleTask}>…</FloatingTasks>`.

**The checklist** is unchanged except the tone map above and the removal of the tasks band.
It keeps two columns (`repeat(auto-fit, minmax(9rem, 1fr))`), the per-row flames, the dated keys,
the document-habit routing and the empty state.

**The blocks section** (new, and it lives in the BLOCKS window on desktop):
```tsx
const blocksPane = (
  <section>
    <div className="section-head">
      <h2 className="text-small font-semibold">
        {back === 0 ? "Today's blocks" : `Blocks on ${shortDay(data.date)}`}
      </h2>
      {/* The timeline's entry point MOVES here from the old calendar head. A word, not a
          chip, tracked out — it is a place rather than an action. */}
      <button type="button" onClick={openTimeline}
        className="text-micro font-semibold tracking-[0.18em] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]">
        TIMELINE
      </button>
    </div>
    <div className="mt-4">
      {data.calendarConnected
        ? <BlockList date={data.date} isToday={back === 0} blocks={data.blocks} onChanged={refresh} />
        : /* the existing connect prompt, verbatim */ null}
    </div>
  </section>
);
```

### 5.6 `Today.tsx` — the panel row

```tsx
<div data-panel="blocks"
     data-open={undefined}
     style={{ "--panel-grow": 1, "--panel-min": "15rem" } as CSSProperties}
     className={`panel window order-1 hidden bg-[var(--color-surface-2)] p-5 lg:flex lg:flex-col lg:p-6 ${colScroll}`}>
  <div className="panel-fade lg:h-full">{blocksPane}</div>
</div>
```
- No collapsed phone bar on this window — it is `hidden` below `lg`.
- Today's pane renders `{blocksPane}` a **second** time, `lg:hidden`, between the hero band and
  the checklist (spec §4 phone: blocks above the checklist).
- Today's and Pillars' windows keep their existing collapsed phone bars, their `--panel-grow`
  values updated to 1.7 and 1.25, and `--panel-min` on pillars raised to `17rem`.
- `pane()` and `switchTab` are unchanged apart from the two-tab type.

### 5.7 `FloatingTasks.tsx` — placement rules

```
band = flex, items-center, justify-center, gap-5, flex-wrap
  left rail   : flex-1 min-w-0 flex flex-col items-end   justify-center gap-2.5
  {children}  : shrink-0                                  (the ring + caption)
  right rail  : flex-1 min-w-0 flex flex-col items-start justify-center gap-2.5
```
- `tasks.length === 0` → return `<div className="flex justify-center">{children}</div>`. Nothing
  is drawn, no empty rails, no placeholder.
- **Up to 6 cards.** `shown = tasks.slice(0, 6)`. If `tasks.length > 6`, `shown = tasks.slice(0, 5)`
  and the 6th slot is a `+N more` card with `N = tasks.length - 5`.
- **Alternating sides, left first**: index `0,2,4` → left rail top-down; `1,3,5` → right rail
  top-down. The `+N more` card always takes the last slot it would have occupied.
- Card:
  ```tsx
  <li className="record-card w-[11.5rem] max-w-full p-2.5">
    <button onClick={() => onToggle(t.id, !t.done)} aria-pressed={t.done}
            className="flex w-full items-start gap-2.5 text-left">
      <span className="mt-0.5"><HabitBox done={t.done} tone="var(--color-ink)" /></span>
      <span className="min-w-0 flex-1">
        <span className={`block font-serif text-small leading-snug ${t.done ? "text-[var(--color-muted)] line-through decoration-[var(--color-line-strong)]" : ""}`}>
          {t.title}
        </span>
        {!t.done && t.carried > 0 && (
          <span className="mt-0.5 block text-micro text-[var(--color-muted)]">carried {t.carried}d</span>
        )}
      </span>
    </button>
  </li>
  ```
  The title clamps to two lines (`line-clamp-2`). **Ink, not a pillar hue** — a task belongs to no
  pillar, which is the rule the current tasks band already runs under.
- `carried 2d`, exactly as the spec words it. No red, no "overdue", no escalating weight.
- **`+N more`** is a `record-card` button of the same width reading `+{N} more`, `text-small`,
  muted. It opens a `.popover` anchored to the card: `position: fixed`, positioned from the
  card's `getBoundingClientRect()` (see §6.2's clamping recipe), `w-[15rem]`,
  `max-h-[18rem] overflow-y-auto`, holding the remaining tasks as the same tick rows. Escape and
  an outside `pointerdown` close it. Ticking inside it works in place and does not close it.
- No `not scored` label in this layout — the cards are not a list and there is nowhere honest to
  put it. The label survives on `/habits`, which is where tasks are written.
- The rails wrap under the ring on a narrow viewport (`flex-wrap` + `basis-full` on each rail
  below `lg`), so the phone gets the ring with the tasks beneath it.

### 5.8 SHELL's archive file

`archive/social/Today.tsx.md` — the `socialEvents` / `oneOffEvents` state declarations with their
docblocks, and the two `setSocialEvents` / `setOneOffEvents` lines inside `loadRings`, as verbatim
slices with their original line ranges. Match the shape of the existing
`archive/social/rings.ts.md` (read it first). Do **not** edit `archive/social/README.md` — RECENT
adds your row.

---

## 6. BLOCKS

**Owns:** `src/components/BlockList.tsx`, new `src/components/DriftPopover.tsx`.

### 6.1 `BlockList.tsx`

**Keeps, verbatim in spirit:** the THREE-LINE rows (time margin, serif title, state line,
Adhered/Drifted/Skipped chips), the `undo` control, the `mark()` contract that trusts the server's
RESULTING state, `useEffect(() => setOpenReason(null), [date])`, the empty state, the
`spanMinutes`/`asSpan` helpers. The owner rejected one-line rows — do not shorten an unmarked row.

**1. A dismiss control on every row** (spec §2). Beside `undo`, same treatment, same line:
```tsx
<button onClick={() => mark(b, "dismissed")}
        className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline">
  dismiss
</button>
```
It shows on **every** row, marked or not — an invite you were never going to do is usually
unmarked. The existing `const live = blocks.filter((b) => b.state !== "dismissed")` already
removes it from the list on the next refresh, so there is nothing else to draw.

> **Known and accepted, from the foundation:** `engine.markBlock` REFUSES a dismissal of a mark
> that already earned hours and returns the prior state. So dismissing an `adhered` row is a
> no-op and the row stays. Do not special-case it and do not print an error: `mark()` already
> returns the resulting state, and the row simply does not change. That is the honest outcome.

**2. The Drifted editor becomes a POPOVER** (spec §2). The inline `{openReason === b.event_id && …}`
block is removed from the row entirely and replaced by `<DriftPopover>` mounted once, after the
`<ul>`, for whichever row is open.
- Tapping **Drifted** still saves instantly at 0 and then opens the popover — `choose()` is
  unchanged except that it also stores the row's rect.
- Tapping the **Drifted chip** on an already-marked row reopens it, prefilled — `openFor()`
  unchanged, plus the rect.
- New state: `const [anchor, setAnchor] = useState<DOMRect | null>(null);` Capture it from the
  `<li>`'s ref (`rowRefs.current.get(b.event_id)?.getBoundingClientRect()`) at the moment of the
  click. Recompute on `window` resize while open; close on `scroll` of the owning `.window`.
- `commitWorked`, `commitRow` and `savedWorked` move up unchanged and are handed to the popover
  as `onCommitWorked` / `onSave`.
- `onClose` (outside click / Escape) **commits as today**: run `commitRow(b)` then clear
  `openReason`. That is the spec's wording — a slider left at 40% and dismissed with Escape must
  not lose the 40%.

**3. The overflow rule** (spec §4), owned here, measured, no props:
```ts
const ROW_FULL = 86;   // a three-line row at this type scale
const listRef = useRef<HTMLUListElement>(null);
const [collapse, setCollapse] = useState(false);
```
In a `useEffect` keyed on `[blocks]`:
- Bail out below `lg`: `if (!window.matchMedia("(min-width: 64rem)").matches) return setCollapse(false);`
  — on the phone the page scrolls and there is nothing to fit inside.
- `const box = listRef.current?.closest(".window"); if (!box) return;`
  (the same `closest(".window")` idiom `PillarSections` already uses.)
- `const avail = box.clientHeight - (listTop - boxTop) - 24;` where the two tops come from
  `getBoundingClientRect()`. **Guard `if (avail <= 0) return;`** — the phone's second instance is
  `display:none` and measures zero; it must not flip the flag.
- `setCollapse(live.length * ROW_FULL > avail)`.
- Re-measure through a `ResizeObserver` on the same `.window` element; disconnect on unmount.

When `collapse` is true, a row **whose `state != null`** renders as ONE line:
`time · title · state chip`, on the same `.page-margin` rail, `py-1.5`, the title truncated, the
chip at its existing size. **Unmarked rows always stay full** — they carry the three action chips
and shortening them would make marking cost more, which the honest-logging rule forbids. A
collapsed drifted chip is still a button that opens the popover.

**4. Copy.** The empty state's second sentence ("Blocks come from Google Calendar — put something
there and it shows up here to mark.") is an explainer. TEXT IS DATA: trim it to
`Nothing on the calendar today.` / `Nothing on the calendar on Thursday 6 August.`

### 6.2 `DriftPopover.tsx`

- `<div className="popover fixed w-[20rem] p-3.5" style={{ left, top }}>` — `.popover` from §2.3.
- Positioning, computed from `anchor` on every render:
  ```
  W = 320, GUTTER = 8
  left = anchor.right + GUTTER
  if (left + W > innerWidth - GUTTER) left = anchor.left - W - GUTTER   // flip to the left
  if (left < GUTTER) left = GUTTER                                       // then clamp
  top  = Math.min(Math.max(anchor.top, GUTTER), innerHeight - H - GUTTER)  // H measured after mount, else 240
  ```
- Contents, top to bottom — the same controls the inline editor had, in the same order:
  1. The block's title, `text-micro`, muted, truncated. (A popover beside a list must say which
     row it belongs to.)
  2. `how much of it did you work?` + the live percentage, `text-small tabular-nums`.
  3. The `worked-range` slider — **reuse the existing class and its `--worked` custom property
     verbatim**, including `step={Math.round(WORKED_STEP * 100)}`, `onPointerUp` / `onKeyUp` /
     `onBlur` → `onCommitWorked`.
  4. `{asSpan(total * worked)} of {asSpan(total)}` when `totalMinutes != null`.
  5. The reason field (serif, a line not a box, `autoFocus`), Enter → `onSave`, Escape → `onClose`.
  6. `Save` (accent button) and `skip` (quiet text) — `skip` calls `onClose`, which commits.
- Escape and outside `pointerdown` (capture phase, ignoring anything inside the popover) call
  `onClose`.
- `role="dialog"` + `aria-label={`How much of ${title} you worked`}`. Not a `<dialog>` element: a
  modal backdrop over a list you are working down is the wrong contract for a mark-as-you-go
  control.

---

## 7. RECENT

**Owns:** `src/components/PillarRing.tsx`, `src/components/PillarSections.tsx`,
`src/components/StatsLink.tsx`, new `src/components/AdherenceTracker.tsx`, new
`archive/social/PillarRing.tsx.md`, new `archive/social/PillarSections.tsx.md`, and
`archive/social/README.md`.

### 7.1 `PillarRing.tsx`

**Delete:** `socialBands`, `portfolioBands`, `bandsForPillar`, `RingSegment`, `EventItem`, the
`mid` and `outer` band geometry and rendering (`rMid`, `rLap`, `midStroke`, `lapStroke`,
`midSlices`, `laps`), the whole arc-label system (`LABEL_GAP`, `LABEL_CLEAR`, `LABEL_SIZE`,
`labelW`, `labelDist`, `LABEL_PAD_X`, `LABEL_PAD_Y`, `labelMeta`, the fan-out relaxation loop, the
per-frame label writes, the `<text>` nodes), `Ring`'s `overdrive` prop and its second lap, the
`social_capital` entries in `TONE` and `TONE_HEX`, `UNSCORED_SHARE`, the `bare` spacer, and the
`skillDefaultHex` / `METRICS` / `MetricRing` / `SkillSlice` imports.

**Keep:** `LitTrack` and `trackStroke` (the lamp), `PillarBloom`, `BLOOM_BOX`, `BLOOM_MIN_SIZE`,
`toneColor`, `hexToHsl` / `hslToHex` / `SHADE_STEPS` / `segmentShade`, `GAP`, `arcPath`, `at`, the
rotation loop (`SPIN_*`, `KICK_*`, `wantsMotion`, the rAF that writes the group's rotation and the
gradient's counter-rotation — with the label loop removed), the default `Ring`.

**`TONE_HEX.portfolio` becomes `"#7d5a72"`.** Keep and update its must-move-with-globals.css
warning comment.

**`SegmentedRing`'s new body:**
- Box is `size × size`. `<svg width="100%" viewBox={`0 0 ${size} ${size}`}>` inside a wrapper of
  `style={{ width: size, maxWidth: "100%" }}` — so a 200px ring in a 150px column scales down as
  one object instead of clipping. This is what makes the two rings survive a 1280px laptop.
- `r = (size - stroke) / 2`. **One thickness. One radius. No bands.**
- Slices: `cursor = 0`; for each arc, `share = arc.weight` (they sum to 1),
  `span = Math.max(0, share - GAP)`, `fillSpan = arc.fill == null ? 0 : clamp01(arc.fill) * span`.
- Each slice draws a **track** path (`trackStroke(size, trackId)`, dashed when `arc.fill == null`)
  and a **fill** path over it, `pathLength={1}`, `strokeDasharray="1 1"`,
  `strokeDashoffset={span > 0 ? 1 - fillSpan / span : 1}`, `className="motion-arc"`,
  `strokeLinecap="butt"`, `stroke={segmentShade(color ?? TONE_HEX[tone], i)}`.
- `ghost === true` → one dashed full-circle track (`arcPath(0, 0.9999, r)`), no fill paths, and
  no arcs are read at all.
- `arcs.length === 0 && !ghost` → one plain empty track circle ("not loaded yet" is not "no
  source"; dashes mean the latter).
- `glow` → `<PillarBloom size={size} hue={hue} />` first in DOM order, `<svg className="relative">`
  after it, exactly as today.
- `children` stays the absolutely-positioned centred overlay.

### 7.2 `PillarSections.tsx` — closed state

**Delete:** the `ORDER` / `PILLAR_NAME` local maps (import `PILLAR_ORDER`, `PILLAR_NAME` from
`@/lib/rings`), the ring-size solver (`RING_MIN`, `RING_MAX`, `OPEN_RING_MAX`, `TEXT_COL`,
`ROW_FURNITURE`, `LABEL_*`, `RING_GAP`, the `ResizeObserver` effect and both size states), the
ghost/push machinery (`Ghost`, `PUSH_PX`, `GHOST_MS`, `ghosts`, `sectionRefs`, `enterFrom`,
`pillar-ghost` / `pillar-enter` class use), everything skills (`asSessions`, `skillHue`,
`openSkill`, `logSkill`, `SkillLog`, `maxSessions`, `anyRecent`, the whole Skills block), the
Events drill-down, `pillarCaption`, `facts`, `bandsForPillar`, the `mine`/`myS` filters, and the
Goals block as it currently exists (it is rebuilt inside Career, §7.3).

**Keep:** the FLIP (`flip` ref, `ringRefs`, `nameRefs`, the `useLayoutEffect` that measures
before/after and releases a transform, `wantsMotion`, `.ring-flip`) — this is the gesture the
owner liked and it is ~50 lines. Simplify it to the ring and the name only (drop `capRefs`: the
caption is gone). Keep `kick`, `openLog`, `WorkoutLog`, `gymLog` + `wantGymLog` +
`refreshGymLog`, `windowFrom`, `shortDay`, `sessionTitle`, `stepsOpen` + `StepsLog`, `busy`/`run`.

**Closed layout:**
```tsx
<div ref={columnRef} className="flex h-full min-h-0 flex-col gap-4">
  {open == null ? (
    <>
      <div className="flex items-start justify-center gap-5">
        <PillarBlock pk="physical" ring={health} />
        <PillarBlock pk="portfolio" ring={career} />
      </div>
      <AdherenceTracker days={tracker} viewing={date} onDay={onOpenDay} />
      <div className="mt-auto"><StatsLink onOpen={onOpenRecord} /></div>
    </>
  ) : (
    /* §7.3 */
  )}
  {/* WorkoutLog and StepsLog stay mounted here, outside the branch */}
</div>
```

`PillarBlock` (a local, not exported) is a `flex-1 min-w-0` column:
```tsx
<button onClick={() => openPillar(pk)} aria-expanded={false}
        className="flex min-w-0 flex-1 flex-col items-center gap-2 rounded-lg px-1 py-1">
  <span ref={…ringRefs} className="ring-flip inline-flex">
    <SegmentedRing arcs={ring?.arcs ?? []} ghost={ring?.fill == null && pk === "portfolio"}
                   size={200} stroke={12} tone={pk} color={colors[pk]} glow spin
                   kick={kick.pillar === pk ? kick.n : 0}>
      {centre}
    </SegmentedRing>
  </span>
  <span ref={…nameRefs} className="ring-flip block text-body font-semibold">{PILLAR_NAME[pk]}</span>
  <ul className="w-full">{parts}</ul>
</button>
```
- `centre`: `ring?.fill == null && pk === "portfolio"` → `<span className="text-small text-[var(--color-muted)]">no goals</span>`
  (spec §1: **never "0%"**). Otherwise `<span className="stat-hero text-heading">{Math.round((ring?.fill ?? 0) * 100)}%</span>`.
  (`.stat-hero` already carries serif, weight 600 and tabular figures — never add `font-serif` or
  `tabular-nums` beside it. Use it for every number in this pass that is a FIGURE rather than a
  row value: the pillar %, the tracker average, a sheet total.)
  While `health == null` (the fetch has not landed) draw the plain empty track and no centre text.
- `parts`, one `<li>` per arc, `text-micro tabular-nums`, `text-[var(--color-muted)]`, centred:
  - **Health** — `${arc.label} ${arc.fact}` → `Strength 2 of 8`, `Cardio 2 of 2`,
    `ASC.ND routine 11/14`, `Steps 84k of 98k`, `Calories 29k of 35k`. A ghost arc (`fill == null`)
    prints its label and `—`.
  - **Career** — one line per counted goal: the title in **serif** `text-small`, truncated, then
    `arc.fact` (`60% · due 30 Sep`) in `text-micro` muted on the next line. No goals → nothing
    under the name (the ring's centre already says it).
- No caption line anywhere. `pillarCaption` is gone and the spec's layouts show none.

### 7.3 `PillarSections.tsx` — opened state (inside the Recent window)

Spec §4: tapping a ring opens that pillar **inside the Recent window**; the other ring and the
tracker **hide** while it is open; × returns. Implementation: when `open != null`, only that
pillar renders — the other `PillarBlock`, the tracker and the record link simply unmount. No
ghosts, no push. The chosen ring travels on the FLIP; the body arrives on `.detail-enter` with the
existing `--enter-delay` stagger.

```tsx
<div className="flex min-h-0 flex-1 flex-col">
  <div className="detail-enter flex justify-end">
    <button onClick={() => openPillar(open)} aria-label="Back to both pillars" className="…">×</button>
  </div>
  <button onClick={() => openPillar(open)} aria-expanded className="flex flex-col items-center gap-2">
    <span ref={…ringRefs} className="ring-flip inline-flex">
      <SegmentedRing … size={240} stroke={15} … />
    </span>
    <span ref={…nameRefs} className="ring-flip block text-body font-semibold">{PILLAR_NAME[open]}</span>
  </button>
  <div className="mt-4 min-h-0 flex-1 overflow-y-auto pb-6">{body}</div>
</div>
```
The opened body is the **only** thing in this app allowed to scroll at rest-plus-one-tap — it is a
window you opened.

**HEALTH opened** (spec §1) — the five parts as rows, on the existing `divide-y` list, each
`li.detail-enter` with `--enter-delay: ${(i+1)*45}ms`:
- An 18px marker `<Ring fill={arc.fill} dashed={arc.fill == null} size={18} stroke={2.5} tone="physical" color={segmentShade(colors.physical ?? TONE_HEX.physical, i)} />`
  — the index is the arc's index, so the legend and the donut can never disagree.
- The label. `Strength` / `Cardio` are buttons that open the fortnight drill-down (`▸`, the
  existing `gymLog` filter by `arc.workoutKind` and `windowFrom..date`, each row opening
  `WorkoutLog`). `Steps` is a button that opens `StepsLog` (a dialog — **no `▸`**). `ASC.ND
  routine` and `Calories` are plain spans.
- A `Log` pill on the two rows with `arc.workoutKind != null`.
- `arc.fact` on its own line, indented to the label (`pl-[1.875rem]`), `text-micro tabular-nums`.
- Today's sessions of that kind as chips (the existing `workouts.filter(w => w.kind === …)` list).
- Under the list: the `every session logged →` link to `/sessions`, on `.detail-enter`.
- **No goals section, no skills section** (spec §1).

**CAREER opened** (spec §1) — active goals, **with or without a deadline**. (The RING counts only
those with one; the opened list shows all active goals, because a goal with no deadline is still a
goal you are working on.) Per goal:
```
title (serif, text-body)                                 [mark done]
{deadline ? dueLabel(deadline, date) : "no deadline"} · {Math.round(progress*100)}%
[progress bar — the existing accent scaleX bar]
subtasks: the existing tick rows, wording "subtasks"
```
- `mark done` is a quiet pill (`rounded-full border px-2.5 py-1 text-micro`) calling
  `onGoalDone(g.id, true)`. It sets status `done`, which stamps `completed_at` server-side. The
  goal then leaves the active list on the next `goals` update — that is correct and intended.
- Subtask rows keep the existing tick box, serif title, `effectiveWeight` percentage and
  `onSubgoal` call. Rename every user-visible "subgoal" to **subtask**.
- A goal with no subtasks: `No subtasks yet` (muted, micro). Drop the "add a few and this bar
  starts filling" explainer — TEXT IS DATA.
- `g.overAllocated` keeps its existing muted line.
- Foot: an `edit →` link to `/goals`, on `.detail-enter`.
- Empty: `Nothing in flight.` plus a link to `/goals`.

### 7.4 `AdherenceTracker.tsx` — exact drawing rules (spec §4)

A `record-card`. Head: `<div className="section-head">` with `average` on the left and the figure
on the right — `<span className="stat-hero text-heading" style={{color:"var(--color-accent-deep)"}}>{avg}%</span>`.

- `past = days.slice(0, 7)`, `today = days[7]`. `days.length < 8` → render the frame, `—` for the
  average, and nothing in the chart area.
- `avg = Math.round(past.reduce((s,d)=>s+d.pct,0) / 7)` — **every day counts, zeros included**
  (spec). Today is not in it.
- SVG: `width="100%"`, `viewBox="0 0 280 96"`, `preserveAspectRatio="none"` is **forbidden** (it
  would shear the dots) — use the default and let the box scale as one.
- Geometry: `PAD_L = 6, PAD_R = 6, PAD_T = 8, PAD_B = 8`. 8 slots, `x(i) = PAD_L + i * (268 / 7)`,
  `y(pct) = PAD_T + (1 - pct / 100) * 80`. **Y is fixed 0–100** — never scaled to the week's high.
- The **area**: `M x(0) y(p0) L … L x(6) y(p6) L x(6) 88 L x(0) 88 Z`,
  `fill="rgb(var(--color-accent-rgb) / 0.16)"`, no stroke. Today is **not** under it.
- The **line**: a polyline through the 7 past points, `stroke="var(--color-accent)"`,
  `strokeWidth={2}`, `fill="none"`, `strokeLinecap="round"`, `strokeLinejoin="round"`.
- **Today**: one segment from `(x(6), y(p6))` to `(x(7), y(pToday))`, same stroke,
  `strokeDasharray="4 3"`. Its dot is **hollow**: `r=3.5`, `fill="var(--color-surface-3)"`,
  `stroke="var(--color-accent)"`, `strokeWidth={1.75}`.
- Past dots: `r=3`, `fill="var(--color-accent)"`, no stroke.
- The **viewed day**'s dot takes an extra ring: `r=5.5`, `fill="none"`,
  `stroke="var(--color-ink)"`, `strokeWidth={1.5}`.
- **Tap targets**: 8 transparent `<rect>`s, `y=0 height=96`, `width = 268/7`, centred on each
  slot, `fill="transparent"`, `onClick={() => onDay(d.date)}`, wrapped so each is focusable
  (`<g role="button" tabIndex={0}>` with an `onKeyDown` for Enter/Space) and carries
  `aria-label={`${prettyDate(d.date)} · ${d.pct}% — open that day`}`.
- X labels below the SVG: a `flex` row of 8 equal cells, `text-micro`. Slots 0–6 print the
  weekday narrow letter (`toLocaleDateString("en-AU",{weekday:"narrow"})`); slot 7 prints the word
  **`today`**. The viewed day's label is underlined (`decoration-[var(--color-ink)] decoration-2
  underline-offset-4`); today's is `--color-ink`, the rest `--color-muted`.
- **Nothing else.** No tooltips, no gridline numbers, no axis ticks, no productivity, no legend,
  no streak flame, no target line, no comparison. (CLAUDE.md's "no average" rule is REMOVED by the
  owner for this one figure — see spec §4. Do not extend it anywhere else.)

### 7.5 `StatsLink.tsx`

Strip it to §3.6: a `record-card`-free full-width button, `The record` in
`text-small font-semibold` on the left, a muted `→` on the right with `.motion-slide` +
`group-hover:translate-x-0.5`. No fetch, no `days` state, no bars, no `everything, over time`
subtitle. Keep `aria-haspopup="dialog"` and the `-mx-2 w-[calc(100%+1rem)]` bleed.

### 7.6 RECENT's archive files

- `archive/social/PillarRing.tsx.md` — `socialBands` in full, `EventItem`, the `mid`-band prop
  docblock and its rendering block, the `social_capital` entries in `TONE` and `TONE_HEX`, and
  `bandsForPillar`'s `social_capital` branch. Verbatim slices with their original line ranges.
- `archive/social/PillarSections.tsx.md` — the `socialEvents` / `oneOffEvents` props with their
  docblocks, the `PILLAR_NAME`/`ORDER` Social entries, and the Events drill-down (`drills`'s
  `m.key === "social_events"` branch and the event half of the `fortnight` builder).
- `archive/social/README.md` — add these four rows to the "What is here" table and replace the
  closing paragraph (which currently says the UI half is still to come):

| File | Came from |
|---|---|
| `PillarRing.tsx.md` | `src/components/PillarRing.tsx` — `socialBands`, the mid band, `EventItem`, the `social_capital` tone entries |
| `PillarSections.tsx.md` | `src/components/PillarSections.tsx` — the Social props and the Events drill-down |
| `Today.tsx.md` | `src/components/Today.tsx` — the event-list state and its `/api/rings` reads |
| `Dashboard.tsx.md` | `src/components/Dashboard.tsx` — the same state on the record, and the Social entry in its pillar order |

Closing paragraph, replacing the current last one:
> The UI half is now parked too. Nothing in `src/` references Social; `getPillars` filters the
> `social_capital` row out of every listing and the row itself is untouched.

---

## 8. GOALS

**Owns:** `src/components/GoalEditor.tsx`, `src/components/Timeline.tsx`,
`src/app/goals/page.tsx`, `src/app/skills/page.tsx`.

### 8.1 `src/app/goals/page.tsx`

```ts
import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import GoalEditor from "@/components/GoalEditor";

export const dynamic = "force-dynamic";
export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const db = await getDb();
  return <GoalEditor initial={await listGoals(db)} />;
}
```

### 8.2 `src/app/skills/page.tsx` (spec §1: `/skills` redirects to `/`)

```ts
import { redirect } from "next/navigation";

/**
 * SKILLS ARE HIDDEN, not deleted — the owner's ruling of 2026-09-18 (spec §1). Skills are not a
 * current focus and must not sit anywhere as an unfilled thing. Every skill row, session and
 * colour is KEPT in the database and `src/lib/queries.ts` still reads them; this route simply
 * has nowhere to send you. A redirect rather than a deletion, because the address is
 * bookmarkable — removing a route must never strand a screen.
 */
export default function SkillsPage() {
  redirect("/");
}
```
Delete the `metadata`, `dynamic`, `getDb`, `listSkills`, `todayISO` and `SkillsEditor` lines.
**Leave `src/components/SkillsEditor.tsx` on disk, unedited.**

### 8.3 `GoalEditor.tsx`

- Props → `{ initial: GoalView[] }`. Delete `pillars`, `newPillar`, the `<select>` in the create
  form, and the `pillar: newPillar` field in the POST body. Delete the `PillarView` import.
- **A deadline on every goal.** On each goal card, on the line under the title:
  ```tsx
  <label className="flex items-center gap-2 text-micro text-[var(--color-muted)]">
    deadline
    <input type="date" defaultValue={g.deadline ?? ""}
      onBlur={(e) => call(`/api/goals/${g.id}`, {
        method: "PATCH",
        body: JSON.stringify({ deadline: e.target.value || null }),
      })}
      className="border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-micro tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]" />
  </label>
  ```
  An empty field **clears** the deadline (`null`), which the engine accepts. Key the input
  `key={`${g.id}-${g.deadline ?? ""}`}` so a server answer re-seeds the uncontrolled field.
- **A deadline on the create form**, beside the title field, same `type="date"`, posted as
  `{ title, deadline: newDeadline || null }`. Reset it after a successful create.
- **Wording:** every user-visible "subgoal" → **subtask**. `Add a subgoal` → `Add a subtask`;
  `aria-label="Subgoal title"` → `"Subtask title"`; `Delete "${s.title}"?` unchanged;
  `Drop "${g.title}"? Its subgoals are kept.` → `…Its subtasks are kept.`;
  `Weight for ${s.title}, blank for auto` unchanged.
- **Status.** Add a quiet `mark done` / `reopen` text button in the goal card's header row beside
  `drop`, PATCHing `{status: "done"}` / `{status: "active"}`. A done goal's card keeps rendering
  (it is in `listGoals`) with its title muted and `done ${completedAt}` in place of the deadline
  field. This is what makes `/goals` the edit surface the Career drill-down links to.
- Keep the window look, the `record-card page-margin` goal cards, the progress bar, the weight
  fields, the `overAllocated` line and the `confirm()` calls exactly as they are.

### 8.4 `Timeline.tsx` (spec §6)

- New prop `onGoalDone` (§3.10). Thread it down to the goal-window render.
- **A tick box on every goal sticky note.** In the card's header row, before the title:
  ```tsx
  <button type="button"
          onClick={() => onGoalDone(g.id, g.status !== "done")}
          aria-pressed={g.status === "done"}
          aria-label={g.status === "done" ? `Reopen ${g.title}` : `Mark ${g.title} done`}
          className="mt-0.5 shrink-0">
    <HabitBox done={g.status === "done"} tone="var(--color-accent)" />
  </button>
  ```
  `cardDown` already bails out on `a, button, input, textarea`, so the tick cannot start a drag.
  No other change to the gesture machinery is needed — **do not touch the pan/zoom maths**.
- **The note STAYS when ticked**, showing ✓ and the completion date. The last line becomes:
  ```tsx
  {g.status === "done"
    ? <>✓ done{g.completedAt ? ` ${shortDate(g.completedAt)}` : ""}</>
    : next ? <>next · <span className="text-[var(--color-ink)]">{next.title}</span></>
    : g.subgoals.length === 0 ? "no subtasks yet" : "every step ticked"}
  ```
  (`shortDate` = the existing noon-parse `"d MMM"` helper; add one if the file has none.)
  Delete the old `g.status === "done" ? "achieved"` branch.
- A done goal's title takes `text-[var(--color-muted)]`; the progress bar stays.
- `goalsById` already holds done goals (`listGoals` returns everything but `dropped`), so the
  `if (w.kind === "goal" && !g) return null` guard keeps meaning "this goal was dropped from the
  board" and stays as it is.
- The `+ GOAL` picker still filters `status === "active" && !on.has(g.id)` — unchanged.
- Wording: `no subgoals yet` → `no subtasks yet`.

---

## 9. RECORD

**Owns:** `Dashboard.tsx`, `DayLog.tsx`, `SessionHistory.tsx`, `ProductivityLog.tsx`,
`HoursTotal.tsx`, `AdherenceLog.tsx`, `DayChart.tsx`, `NoteLog.tsx`, `ColourEditor.tsx`,
`CalorieInput.tsx`, `StepsLog.tsx`, `WeightLog.tsx`, `CalorieLog.tsx`, `StepsChart.tsx`,
`WorkoutLog.tsx`, `src/app/stats/page.tsx`, `src/app/sessions/page.tsx`,
`src/app/colours/page.tsx`, new `archive/social/Dashboard.tsx.md`.

### 9.1 `Dashboard.tsx`

**Delete:**
- The local `PILLAR_NAME` / `ORDER` maps → import `PILLAR_ORDER`, `PILLAR_NAME` from `@/lib/rings`.
- `socialEvents`, `oneOffEvents`, `skills14` state and their `/api/rings` reads. Park them in
  `archive/social/Dashboard.tsx.md`.
- The **In flight** and **Achieved** sections in full (spec §6), and with them: `goals`, `tasks`
  state, the `/api/goals` and `/api/tasks?all=1` fetches, `active`, `done`, `openTasks`,
  `doneTasks`, `shortDate`'s task uses, the `RecordTask` and `GoalView` imports, and the whole
  two-column board wrapper they sat in. **There is no task history anywhere.**
- `CALENDAR_RATES`, `ProductivitySegment`, `SLAB_GYM`, `pillarCaption`, `PillarFactInput`,
  `bandsForPillar`, `EventItem` imports.
- The `skills, past fortnight` figure.

**Change:**
- `CALORIE_FLOOR` now imports from `@/lib/rings` (its home), not `@/lib/productivity`.
- `StripDay` becomes `{ date: string; pct: number; isToday: boolean; hours: DayHours | null }`.
- `weekHours = week.reduce((s, d) => s + (d.hours?.minutes ?? 0), 0)`.
- The hours series:
  ```ts
  const hours: ChartPoint[] = useMemo(() => (strip ?? []).map((d) => ({
    date: d.date,
    value: d.hours ? d.hours.minutes : null,
    segments: d.hours?.categories.map((c) => ({
      key: c.label,
      minutes: c.minutes,
      fill: projectedColour(c.colorId) ?? SLAB_NEUTRAL,
      label: c.label,
    })),
  })), [strip]);
  ```
  The Hours `<DayChart>` gets `form="stacked"` and the new `format={asTime}`.
- The figures band: **four**, `lg:grid-cols-4`, drop the
  `max-lg:[&>*:last-child]:col-span-2` hack (four is even):
  `adherence, last 7 days` · `hours worked, last 7 days` (opens `HoursTotal`) ·
  `Health, past fortnight` (`facts.workoutSessions`, `href="/sessions"`) · `days logged in a row`.
  Note the label change: `physical` → **Health** (spec §7).
- **The fortnight** — two rings, `grid sm:grid-cols-2` (drop `lg:grid-cols-3`):
  ```tsx
  {(rings ?? []).map((p) => (
    <div key={p.key} className="flex flex-col items-center border-t border-[var(--color-line)] pt-5">
      <SegmentedRing arcs={p.arcs} ghost={p.fill == null && p.key === "portfolio"}
                     size={170} stroke={11} tone={p.key} color={colors[p.key]} spin glow>
        {p.fill == null && p.key === "portfolio"
          ? <span className="text-small text-[var(--color-muted)]">no goals</span>
          : <span className="stat-hero text-heading">{Math.round((p.fill ?? 0) * 100)}%</span>}
      </SegmentedRing>
      <p className="mt-2 text-small font-semibold">{p.name}</p>
    </div>
  ))}
  ```
  No caption under the ring (`pillarCaption` is gone).
- **Every metric** — iterate `(rings ?? []).flatMap((p) => p.arcs.map(...))`, printing
  `PILLAR_NAME[p.key]` · `arc.label` · `arc.fact` · a bar at `arc.fill`. Health gives five rows,
  Career one per counted goal (spec §7).
- Close the `data-panel` gap: `Dashboard` renders inside the pillars window, which is unchanged.

### 9.2 `DayChart.tsx`

- `ChartSegment.points` → `ChartSegment.minutes`; delete the separate optional `minutes` field and
  its docblock about the quarantined score.
- Every internal read (`s.points / p.value!`, the tooltip's `${s.label} ${fmt(s.points)}`, the
  legend) uses `s.minutes`.
- New optional prop `format?: (n: number) => string`, defaulting to the existing `fmt`. Used for
  the hovered value, the segment lines and the latest-value label.
- Everything else — the three forms, the broken runs, the weight bridge, the `marker` floor line,
  the "a day with no entry draws nothing" rule — is untouched.

### 9.3 `ProductivityLog.tsx` — rewritten against the new route

New `Payload` exactly as §3.2. Sections, top to bottom:
1. Head: the long date + ×. Unchanged.
2. `!calendarConnected` → `Google Calendar could not be reached.` and nothing else.
3. **The day's hours**, the figure this sheet adds up to:
   `<span className="stat-hero text-heading">{asTime(hours.minutes)}</span>` with
   `hours worked` beside it in micro muted, on the existing `border-y … py-3` band.
4. **Hours** — one row per `hours.categories[]`: a `projectedColour(c.colorId) ?? SLAB_NEUTRAL`
   swatch, the label, and `asTime(c.minutes)` right-aligned. Empty → `No blocked hours worked.`
5. **Didn't count** — `ignored[]` unchanged in shape: title, `asTime(minutes)` or `all day`, and
   the reason on the line under it, muted, never scolding.
6. The optional `onOpenDay` link at the foot. Keep the prop.

**Delete:** `Rate`, the `score` / `rates` / `habits` / `sessions` / `constants` payload fields, the
Gym and Ticked sections, `asRate`, `SLAB_GYM`, and every printed number that was points.
`data.categories` is available for a legend on an empty day — use it only if the day has no hours
at all, to print the four category names muted; otherwise ignore it.

### 9.4 `HoursTotal.tsx`

- `seg.points` → `seg.minutes` (the `if (!seg.label || !seg.minutes) continue;` guard is unchanged).
- **Delete the closing paragraph** ("Blocked calendar time you marked adhered, counted at the
  share you actually worked. Hours spent — never what came of them."). It is an explainer and it
  talks about scoring. TEXT IS DATA.
- Everything else stands.

### 9.5 `AdherenceLog.tsx`

- `import { CALORIE_FLOOR } from "@/lib/productivity"` → `from "@/lib/rings"`.
- Replace any on-screen word "points" with "parts" — adherence is two 50-part shares, not a score.
  (The docblock may keep the reasoning; the printed copy may not.)
- No other change. The sheet's shape, its blocks/non-negotiables split and the floors are correct.

### 9.6 `DayLog.tsx` (spec §7)

```ts
/** A kind's pillar, for its tab's fill. null = NEUTRAL — the warm grey a habit with no pillar
 *  takes on the checklist, so a tab and a tick row can never disagree about what "no pillar"
 *  looks like. Drift is still absent: it belongs to a calendar block, and its tab is unfilled. */
const KIND_PILLAR: Record<Exclude<LogKind, "drift">, PillarKey | null> = {
  journal: null,
  gym: "physical",
  outreach: "portfolio",
  reading: null,
  ascnd: "physical",
};
```
- The hue resolver becomes `k == null ? "var(--color-neutral)" : toneColor(k, colors[k])`. White
  text on `--color-neutral` measures 4.62:1 — the chip test passes.
- **Remove `skill` everywhere**: from `KIND_LABEL`, from `editable`, from the `entry?.kind === "skill"`
  `SkillLog` block, and from the two `=== "skill"` comparisons the foundation flagged
  (`DayLog.tsx:396`, `:904`). Drop the `SkillLog` import.
- `LogKind` already lacks `"skill"` in `@/lib/dayLog` — do not redeclare it.
- Everything else (the grid, the tabs, the day reader, `reloadSpan`, the journal/gym/NoteLog
  dialogs) is untouched.

### 9.7 `SessionHistory.tsx` (spec §1: no skill chip, no skill rows)

- `type LogKind = WorkoutKind;` `const LOG_KINDS = [...WORKOUT_KINDS];` Delete the `skill: "Skills"`
  entry from `LABEL`.
- `Session` loses `skillId` / `skillName`.
- Delete the `/api/skills/history` fetch and the `Promise.all` that merged it — `all` is now just
  the gym history.
- Delete the `filter === "skill"` branch (the "Log a skill on the board" message), the
  `open?.kind === "skill"` `SkillLog` block, and the `SkillLog` / `SkillSession` imports.
- `hueFor` → always `toneColor("physical", null)`.
- The `?kind=` seed: accept only `strength` / `cardio`; anything else falls through to no filter.
- The search, the paging, the grouping, `sessionTitle` and the `WorkoutLog` dialog are untouched.

### 9.8 `ColourEditor.tsx` + `src/app/colours/page.tsx`

- `page.tsx`: drop `skillColours` from the import and the `Promise.all`; render
  `<ColourEditor initial={pillars} />`.
- `ColourEditor`: drop the `skills` prop, the `skills` state, `setSkill`, the whole Skills section
  and the `skillDefaultHex` import.
- **Delete the intro paragraph** ("Pick a hue for each pillar. It colours that pillar's rings,
  goals and skills…"). It names skills, which are hidden, and it is an explainer. The swatches are
  the interface.
- `initial` already arrives as two pillars named `Health` and `Career` — `getPillars` filters
  `social_capital` and takes the names from `PILLAR_NAME`. Nothing to change there.
- The preview `<Ring fill={0.68} size={36} stroke={3.5} tone={p.key} color={p.color} />` is
  unchanged (the default `Ring` export keeps its signature minus `overdrive`).

### 9.9 `CalorieInput.tsx`

- Add the `tone: string` prop (§3.12) and use it on the `HabitBox`. Delete the
  `var(--color-physical)` literal.
- `import { CALORIE_FLOOR } from "@/lib/rings"` (its home), not from `@/lib/productivity`.

### 9.10 `NoteLog.tsx` (spec §5)

- In `DOC_HABITS`, the `ascnd` entry's `placeholder` becomes **`"What did you do?"`**.
- No other change.

### 9.11 The chart colours that deliberately STAY on `var(--color-physical)`

`StepsLog.tsx:88`, `WeightLog.tsx:82`, `CalorieLog.tsx:204`, `StepsChart.tsx:49`. These are charts
of a **body**, not a pillar tick, and the token *is* Health's default. Spec §5 names only "the
Steps and Calories **boxes**" — the checklist tick boxes — and those are handled in §5.5 and §9.9.
**Add a one-line comment at each site** saying so, so the next reader does not "finish the job".

`WorkoutLog.tsx` — check it for a hard-coded pillar colour. It currently takes a `hue` prop from
its callers; if there is no literal, leave the file untouched.

### 9.12 `src/app/stats/page.tsx`, `src/app/sessions/page.tsx`

Expected to need **no change**. They are listed under RECORD so nobody else opens them. If a type
error appears in either, fix it in place.

### 9.13 RECORD's archive file

`archive/social/Dashboard.tsx.md` — the `socialEvents` / `oneOffEvents` / `skills14` state with
their docblocks, the three `set…` lines in the `/api/rings` effect, and the `social_capital`
entries in the local `PILLAR_NAME` / `ORDER` maps. Verbatim slices with line ranges, matching
`archive/social/rings.ts.md`'s shape. Do not edit the README.

---

## 10. INTEGRATION — run after all five workers report done

Do these **in order**. One person, one terminal.

1. **Typecheck.** `npx tsc --noEmit` → must be **0 errors**. Every one of the 61 pre-existing
   component errors listed in the foundation report must be gone, and no new ones added.
2. **Tests.** `npm test` → must still be **270/270 pass**. No worker touched `src/lib`; if this
   fails, somebody did.
3. **Grep for corpses** — each of these must return nothing under `src/`:
   ```
   grep -rn "social_capital\|socialBands\|bandsForPillar\|pillarCaption\|CALENDAR_RATES" src/
   grep -rn "ProductivitySegment\|PillarFactInput\|MetricRing\|METRICS\b" src/
   grep -rn "CalendarColumn\|NextUp\|calEpoch" src/
   grep -rn "color-social\|motion-spark\|pillar-ghost\|pillar-enter" src/
   grep -rn "skills14\|socialEventList\|oneOffEventList\|/api/skills" src/components src/app/page.tsx
   grep -rn "\.metrics\b\|\.pillar\b" src/components
   ```
   `grep -rn "var(--color-physical)" src/` should return exactly the four chart sites of §9.11.
4. **Files gone:** `src/components/CalendarColumn.tsx`, `src/components/NextUp.tsx`.
   **Files present:** `src/components/FloatingTasks.tsx`, `DriftPopover.tsx`,
   `AdherenceTracker.tsx`, and the four new `archive/social/*.tsx.md`.
5. **Build.** `DATABASE_URL=file:./data/pivot.db NEXT_DIST_DIR=.next-build/pivot npx next build`
   → clean.
6. **Run it** (the one sanctioned command, §0), then walk the screens at **1858 × 960**:
   - `/` on the live day: three windows, Blocks | Today | Recent. **Nothing scrolls** — no page
     scrollbar and no scrollbar inside any window.
   - `/` stepped back two days (‹ ‹): the catching-up bar stands, still nothing scrolls, the
     tracker still ends on the real today with the viewed day's dot ringed.
   - The Health ring opened, then ×. The Career ring opened, then ×.
   - A drift: tap **Drifted** on an unmarked row → the mark saves instantly at 0 and the popover
     opens **beside** the row, not inside it. Drag the slider, press Escape → the fraction is
     kept. Tap the Drifted chip again → it reopens prefilled.
   - **dismiss** on an unmarked row → it leaves the list. **dismiss** on an adhered row → nothing
     changes (the engine refuses it); no error appears.
   - The overflow rule: on a fixture day with many blocks, mark several and confirm the marked
     rows collapse to one line while the unmarked ones stay three.
   - Tasks: with 0 tasks nothing is drawn around the ring; with 3 they alternate left/right; with
     8 there are five cards and a `+3 more` that opens a popover. Ticking works in place.
   - A tracker dot → the whole dashboard steps to that day (atomic swap, catching-up bar).
   - **TIMELINE** in the Blocks head → the windows fall, the timeline fades in, `RETURN TO
     DASHBOARD` brings them back.
   - `/stats` → four figures, two rings, Every metric (5 Health rows + the Career goals), the five
     charts, and **no In flight, no Achieved, no points anywhere**. Open the Hours chart's day
     breakdown and the hours figure's `Where the hours went`.
   - `/stats?view=log` → tabs are journal/gym/outreach/reading/ASC.ND/drift, no skill entries,
     journal and reading tabs in the neutral grey.
   - `/goals` → no pillar picker, a deadline field per goal and on the create form, "subtask"
     wording.
   - The timeline → a goal note has a tick box; ticking leaves the note in place with ✓ and the
     date; unticking returns it to active.
   - `/colours` → two pillars, Health on Moss and Career on Plum, no Skills section.
   - `/sessions` → Strength / Cardio only, no skill chip, no skill rows.
   - `/skills` → redirects to `/`.
7. **Phone, 390px wide:** two panes only (Today, Pillars). Today holds the date card, the hero with
   its tasks, the **blocks list**, then the checklist. Swipe moves between the two. The record
   expands out of the Pillars window and lands on `/stats`.
8. **Colour check:** confirm Career's ring and the `/colours` swatch are Plum `#7d5a72`, and that
   the Journal / Read / Tidy room tick boxes are the neutral warm grey while Steps, Calories,
   Vitamins, Weight and ASC.ND are Moss and Outreach and Calendar are Plum.
9. **Screenshots** for the owner (spec §10): `/` at 1858×960 live and on a past day, the Health
   ring opened, the Career ring opened, `/stats`, `/goals`, the timeline, and 390px phone width.
10. **Stop the dev server**, including any leftover child on port 3001. Leave everything in the
    working tree — **no commit**.

### Out of scope for this pass, and deliberately left open

- Spec §8: rewriting `CLAUDE.md`, `DESIGN.md` and `PRODUCT.md`. They are stale in several places
  (the productivity score, three pillars, the week strip, the Calendar window, "no average",
  In flight / Achieved, skills under Portfolio, `CALORIE_FLOOR`'s home, the phone calendar pane).
  That is its own task after this one lands.
- `/api/adherence`'s `center=` parameter and its per-day `blocks` payload now have no reader.
  Left in place by the foundation's decision.
- `scripts/migrate.mjs` is not mirrored with `pivot_health_career_v1`; `ensure()` runs on every
  boot and a fresh database reaches the same state. Flagged, not changed.
