# The Health & Career pivot — design spec

The owner's rulings of 2026-09-18, settled in a long interview. Every item here is DECIDED;
implementers do not re-litigate them. Where this spec contradicts CLAUDE.md, DESIGN.md or
PRODUCT.md, this spec wins, and those documents are rewritten to match at the end.

Mockups of the chosen layout (D, "Today vs recent") and its alternatives live on the design
canvas https://claude.ai/artifact/Jdzfgybcu9eP5kNgCNuiFy — artboard `TodayVsRecent.dc.html`.

## 0. Working constraints (for whoever implements this)

- Branch `pivot/health-career`. Nothing is pushed or deployed.
- **`.env.local` points `DATABASE_URL` at PRODUCTION Turso. Never run the app, a script or a
  migration with it.** A read-only copy of production lives at `data/pivot.db` (git-ignored).
  Run the app only as:
  `DATABASE_URL=file:./data/pivot.db NEXT_DIST_DIR=.next-build/pivot npx next dev -p 3001`
  (bash env prefix; a shell variable beats `.env.local`). Do not run `scripts/migrate.mjs` or
  `scripts/db-copy.mjs`.
- Production currently has NO row in `google_oauth_tokens`, so the calendar reads as
  disconnected locally too. Visual checks of the blocks list need a dev-only calendar fixture
  (see §10).
- Preserve data: no DROP, no DELETE of user rows. Data changes are one latched, idempotent block
  in `src/lib/db/client.ts` `ensure()`, following the existing `habits_aug24_v1` pattern.
- `npm test` must pass; `npx tsc --noEmit` must be clean. This is Next.js 16 — read
  `node_modules/next/dist/docs/` before touching a Next API.
- House rules that still hold: two font weights (400/600), the five type steps, one amber
  accent, no red except the floor line, no shame copy, TEXT IS DATA (no explainer sentences on
  screen), rules live in `engine.ts`, pure logic in import-free tested modules, `num()` on
  libSQL aggregates.

## 1. Two pillars: HEALTH and CAREER. Social is gone.

- **Social is removed from every screen and every calculation.** Socialising "comes naturally
  in between blocks" and is no longer planned or tracked.
  - The `pillars` row `social_capital` STAYS in the database (goals/habits/tasks FKs) but is
    filtered out of everything that lists pillars (`getPillars` consumers: `/colours`,
    `/goals`, `DayView.pillars`, `/api/pillars`).
  - The Social code — the `outreach` and `social_events` metrics, the `calendar_social`
    source, `SOCIAL_COLOR_ID` counting and event lists in `/api/rings`, `socialBands` and the
    mid band in `PillarRing.tsx`, the Social caption branch, `CalEvent.recurring`'s only use —
    is REMOVED from `src/` and parked verbatim under `archive/social/` (outside `src`, not
    compiled, excluded from Tailwind's scan) with a short README saying what it was and why it
    was parked. The owner asked for it to be kept, not deleted.
- **Physical is displayed as HEALTH, Portfolio as CAREER.** Database keys stay `physical` /
  `portfolio` (renaming a live key is churn). Display names come from one place.
- **Colours.** Health = Moss `#467c6c`. Career = Plum `#7d5a72`. The live Physical colour is Rust
  `#9a6448`, which sits on top of the amber accent; the migration sets it to Moss. `/colours`
  still edits both from the curated palette (Social not listed).
- **Rings are SEGMENTED DONUTS of ONE thickness.** No outer laps, no mid band, no overdrive
  drawing. The circle is split into arcs sized by weight, with a small gap between arcs; each
  arc draws a faint track and a fill of `arcLength × fill`. The centre prints the pillar %.
  Both pillar rings are smaller than the hero adherence ring. A cap still holds per metric
  (fill ≤ 1); overdoing one part never fills another.
- **The rolling window is unchanged**: 14 days ending on the viewed day.

### HEALTH

| Part (label) | Weight | Fill | Source |
|---|---|---|---|
| Strength | 40 | strength sessions ÷ 8 | `gym_sessions` kind strength, per session |
| Cardio | 15 | cardio sessions ÷ 2 | `gym_sessions` kind cardio |
| ASC.ND routine | 15 | days ticked ÷ 14 | habit `system_key='ascnd'` |
| Steps | 15 | SUM(steps) ÷ 98,000 | `health_logs` (`STEPS_FLOOR × WINDOW_DAYS`, derived) |
| Calories | 15 | SUM(kcal) ÷ 35,000 | `calorie_entries` (`CALORIE_FLOOR × WINDOW_DAYS`, derived) |

- Steps and calories are TOTALS over the fortnight: one big day covers quiet ones (the owner's
  ruling, both). An unlogged day adds 0.
- `CALORIE_FLOOR` (2500) moves to `rings.ts` (import-free) and `productivity.ts` /
  `adherence.ts` import it. No copied numbers.
- The ASC.ND habit moves to the Health pillar. It is the owner's daily stretching / skincare /
  posture routine.
- **Health, opened** (tap the ring): the five parts as lines — `Strength 2 of 8`,
  `Cardio 2 of 2`, `ASC.ND routine 11/14`, `Steps 84k of 98k`, `Calories 29k of 35k` — keeping
  the existing Log buttons for strength/cardio sessions, the steps dialog, and the
  "every session logged →" link. No goals section, no skills section.

### CAREER

- **Career fills from GOALS.** A goal is a project; its subgoals are shown as **subtasks**.
- Goals gain an optional **deadline** (`YYYY-MM-DD`).
- **Only goals with status `active` AND a deadline count.** Each counted goal is ONE EQUAL ARC.
- **Arc fill = on pace** = `min(1, progress ÷ expected)` where
  `expected = clamp((today − created date) ÷ (deadline − created date), 0, 1)`.
  - `expected ≤ 0` (a goal created today) → fill 1: nothing is expected of it yet.
  - Past the deadline → expected 1, so the arc shows actual progress. It stays in the ring
    until it is ticked done or dropped. No red, no "overdue" wording.
  - `progress` is the existing `goals.ts` rule (sum of done subgoal weights).
  - Pure, import-free, tested (`src/lib/career.ts` or inside `goals.ts`).
- **Career % = mean of the counted arcs.**
- **No counted goals → the ring is an empty DASHED ghost labelled "no goals"**, never "0%".
- Calendar blocks are NOT linked to goals. The Basil "project hours" lap is gone. Skills are
  not part of Career.
- **Career, opened**: active goals (with or without deadline) — title, deadline, %, a progress
  bar, tickable subtasks, and a **mark done** button (status `done`, stamps `completed_at`).
  An "edit" link to `/goals`.
- **Every goal is a Career goal.** New goals are created under `portfolio`; the pillar picker on
  `/goals` goes.

### SKILLS — hidden

Skills are not a current focus and must not sit anywhere as an unfilled thing. Hidden from the
rings, the dashboard, `/colours`, `/sessions` (no skill chip, no skill rows) and the `/stats`
Log (no skill entries). `/skills` redirects to `/`. All skill data is kept.

## 2. Adherence

- The formula is unchanged (50 blocked hours / 50 non-negotiables incl. the steps and calories
  floors).
- **Graphite events (Google `colorId "8"`) are ignored everywhere**: not in today's block list,
  not in adherence's block hours, not in productivity minutes. ONE place decides this (block
  building). Past days re-read without them — accepted.
- **Every block row gets a "dismiss" control** that writes the existing `dismissed` state
  (already honoured by `/api/blocks` and adherence) — for invites and anything never meant to
  be done.

## 3. Productivity — the score is gone

"Quantifying productivity is stupid." No points are printed anywhere. `/stats` keeps an
**hours by category** chart (stacked by the category colours: Work Projects, Work Uni, Work Part
Time, Uni) and the "hours worked, last 7 days" figure, in hours/minutes. The per-day breakdown
it opens shows minutes by category and the "didn't count" list, never points. The gym flat
points and the non-negotiable points disappear from display.

## 4. The dashboard — layout D, "Today vs recent"

Desktop (≥ 64rem). Target: the owner's Chrome window, about **1858 × 960 CSS px**. **At rest
nothing scrolls** — not the page, not a window. Things you OPEN (an expanded pillar, a popover,
a dialog) may scroll inside themselves. Full width: the `max-w-[92rem]` cap goes.

Three windows, left to right:

### BLOCKS window (replaces the Calendar window; lilac `--color-surface-2`)

- Section head **Today's blocks** (a past day: `Blocks on Thu 6 Aug`) with the **TIMELINE**
  button on the right of the head — the timeline's entry point moves here from the old
  calendar head.
- `BlockList` keeps its existing THREE-LINE rows (time margin; serif title; state line;
  Adhered / Drifted / Skipped chips) — the owner rejected one-line rows.
- A **dismiss** text button on every row (next to `undo`).
- **The Drifted editor (worked-fraction slider + optional reason) opens as a small POPOVER
  beside the row**, not as an inline expansion. Tapping Drifted still saves instantly at 0
  (the slider never gates the mark); outside click / Escape closes, committing as today.
- **Overflow rule**: when a day's rows would not fit the window, rows that are already MARKED
  collapse to ONE line (time · title · state chip). Unmarked rows stay full. Normal days do not
  overflow.
- Calendar not connected: the existing connect prompt.
- **Deleted**: `CalendarColumn` (the 9-day view: past and upcoming days are no longer shown),
  the `NextUp` card, `calEpoch`, the `center=` adherence fetch.

### TODAY window (warm `--color-surface-1`)

- Top card unchanged: date line with ‹ › and the day title.
- **Hero adherence ring, 240px**, 52px numeral, caption `3.5h of 6h blocked · 6 of 10 ticked`.
  It stays the largest ring on the screen.
- **TASKS FLOAT in the empty space around the hero ring**: small cards to the left and right of
  the ring, alternating sides, each with a tick box, the title and `carried 2d` when carried.
  Ticking works in place. Up to 6 show; more gives a `+N more` card that opens the rest in a
  popover. No tasks → nothing is drawn. Tasks are still added on `/habits`, still carry, still
  unscored.
- **The checklist** below the ring, two columns across the window, per-row streak flames as
  today.
- The catching-up bar on past days as today.
- **Removed**: the "seven days to today" card (per-day % row, 3px bars, productivity stacks,
  legend, app-wide streak flame).

### RECENT window (gold `--color-surface-3`)

- **Top: the HEALTH and CAREER rings side by side** (~200px), each name centred under its ring
  and its part list under the name (Health: the five parts; Career: one line per counted goal,
  title in serif + `60% · due 30 Sep`).
- **Middle: the ADHERENCE TRACKER card.**
- **Foot: a plain `The record →` link** (the 14-bar sparkline is removed).
- **Tapping a ring opens that pillar INSIDE the Recent window**; the other ring and the tracker
  hide while it is open; × returns.

### The ADHERENCE TRACKER

- A **line chart with the area filled under it**, for the **7 days BEFORE today**, always
  anchored to the real today (like the old strip).
- **Today** is drawn as a HOLLOW dot joined by a DASHED segment — on the line, not under the
  area, not in the average.
- Y axis fixed 0–100. X labels: weekday letters, then `today`.
- **The AVERAGE** = mean of the 7 past days' `pct` (every day counts, zeros included), printed
  28px serif in an amber darker than the area. Label `average`.
- No tooltips, no gridline numbers, no productivity, no legend, no streak flame.
- **Tapping a day's dot switches the dashboard to that day** (`goToDay`, the existing atomic
  swap and catching-up bar).
- CLAUDE.md's "no average" rule is REMOVED by the owner.

### Phone (< 64rem)

Two panes: **Today** (with the blocks list inside it, above the checklist as today) and
**Pillars** (the two rings, the tracker, the record link). No calendar pane.

## 5. The checklist

- Tick colours follow the habit's pillar:
  - **Health (Moss)**: ASC.ND, Weight, Vitamins, Steps, Calories.
  - **Career (Plum)**: Outreach, Calendar.
  - **Neutral (warm grey, a new token)** for pillar NULL: Journal, Read, Tidy room.
  - One-offs keep the amber accent.
- The Steps and Calories boxes stop hard-coding `--color-physical` and take the Health tone.
- Renames: `Read 10 pages` → **Read**; `One outreach message` → **Outreach**.
- ASC.ND stays a document habit; its NoteLog placeholder becomes **"What did you do?"**.

## 6. Goals and the timeline

- `/goals`: an optional **deadline** date on each goal (and when creating one); no pillar picker
  (created under Career); "subtasks" wording.
- **Timeline goal sticky notes get a tick box.** Ticking marks the goal done (status `done`,
  `completed_at`); the note STAYS on the timeline showing ✓ and the completion date. Unticking
  returns it to active. The + GOAL picker still lists active goals not yet placed.
- `/stats` loses **In flight** and **Achieved**, including their task lists. There is no task
  history anywhere.

## 7. `/stats` and the written log

- "The fortnight": two rings, Health and Career.
- "Every metric": Health's five parts and Career's goals.
- Figures: no skills figure; "physical" wording becomes Health.
- Hours per §3.
- The Log (`DayLog`): `KIND_PILLAR` — journal and reading → neutral, outreach → Career,
  ascnd → Health, gym → Health; skill entries are not shown.

## 8. Documentation

CLAUDE.md, DESIGN.md and PRODUCT.md are rewritten to match this spec, removing superseded rules:
three pillars and Social mechanics, the Calendar window and "a full day costs scroll", "no
average", the week strip and productivity score, In flight / Achieved, skills under Portfolio,
the phone calendar pane. Keep the reasoning style of those documents.

## 9. The data migration — latched block `pivot_health_career_v1`

Idempotent, in `client.ts` `ensure()`. No deletes.

- `pillars`: `physical` → name `Health`, color `#467c6c`; `portfolio` → name `Career`.
- `habits`:
  - `system_key='ascnd'` → pillar `physical`.
  - `system_key='outreach'` → pillar `portfolio`, name `Outreach`.
  - name `Calendar` with pillar NULL → pillar `portfolio`.
  - `system_key='reading'` → name `Read`, pillar NULL.
  - `system_key='journal'` → pillar NULL.
  - name `Tidy room` → pillar NULL.
- `goals`: `ADD COLUMN deadline TEXT` (nullable, `GLOB '????-??-??'` when present), via the
  existing `ensure()` column-adding pattern.

## 10. Verification

- `npm test`, `npx tsc --noEmit`, `npm run build` (with the local env) all clean.
- A **dev-only calendar fixture** (e.g. `DEV_CALENDAR_FIXTURE=<json path>`, honoured only when
  `NODE_ENV !== "production"`) so the blocks list can be seen locally without Google.
- Screenshots of `/` at 1858×960 (live day and a past day), the Health and Career rings opened,
  `/stats`, `/goals`, the timeline, and a 390px phone width. Nothing scrolls at rest on desktop.
