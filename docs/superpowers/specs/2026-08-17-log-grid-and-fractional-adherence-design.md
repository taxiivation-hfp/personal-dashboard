# Log grid + fractional Steps/Calories adherence — design

2026-08-17. Approved by the owner in conversation; review gates waived ("start building
and don't stop"). Two independent halves.

**Revised in live review, same day** — part B as written here is superseded on three
points by the owner's feedback against the running app: the grid is FULL WIDTH (no
reading-column cap); attachments are titled TABS in the owner's pillar colours, folded
into a journalled tile's edge and unfolding on hover over a solid panel (not a dot rail);
and a tap opens the journal-reader SPREAD (page at reading size, the day's logs beside
it), not a thumbnail overlay. CLAUDE.md's written-log section is the authority.

## A. Adherence: Steps and Calories as fractional non-negotiable shares

Today, Steps and Calories contribute **nothing** to adherence — they are checklist rows
drawn beside the habits, not habit rows (the Steps habit is deactivated; Calories never
was one). This change puts both **into the non-negotiable denominator, every day**, each
worth one item's share, earned **fractionally** against its floor.

### The maths

```
credit(value, floor) = clamp(value / floor, 0, 1)     // null → 0
habitPart = (ticked + credit(steps, STEPS_FLOOR) + credit(calories, CALORIE_FLOOR))
            / (habitsScheduled + 2) × HABIT_SHARE
```

- With 5 daily habits: 7 items at 50/7 ≈ 7.14 points each. 3,500 steps earns half a
  share; 14,000 earns exactly one (the cap).
- **The figure still only climbs.** Both readings are running totals that never fall
  within a day; the clamp forbids a fraction below 0 or above 1. Null earns 0 — nobody
  measured, nothing earned, same as an unticked habit (owner's ruling: always in the
  denominator; no ghost-style exclusion, so the denominator never wobbles with the
  phone's battery).
- Every past day re-reads lower (denominator +2, unearned back then). Accepted — same
  silently-rewrites-history behaviour as retuning the productivity colour table.

### Where the rule lives

- `floorCredit(value: number | null, floor: number): number` — pure, exported from
  `src/lib/adherence.ts`, clamped, test-pinned. The `workedFraction` pattern.
- `adherenceFor(blocks, habits, floors)` — `floors: { steps: number | null;
  calories: number | null }` is a **required** third argument, so no caller can silently
  compute the old figure. The fold happens in exactly one place.
- Floor constants imported from their homes: `STEPS_FLOOR` from `rings.ts`,
  `CALORIE_FLOOR` from `productivity.ts` (both `.ts`-suffixed; chain stays
  `node --test`-clean, no cycles).

### Callers

- `getDayView` (queries.ts): already reads steps + calories a few lines after computing
  adherence — reorder, pass them in.
- `/api/adherence`: already fetches calories per day (calByDate, for productivity);
  gains one ranged `health_logs` query (`WHERE steps IS NOT NULL`) for steps per day.
  Adherence reads calByDate **ungated** by calendar connectivity — food logged is food
  logged whatever Google is doing. (The productivity gate is untouched.)

### What does not change

- Productivity keeps the binary ≥2,500 calorie rule (`POINTS_PER_HABIT` at the floor).
- Checklist UI keeps dashed-until-met boxes.
- Weight stays binary — a reading exists or it does not; it has no floor.
- `habitsDone` / `habitsScheduled` stay the integer tick tally. Today's caption says
  "3 of 5 **ticked**", which stays true; the floors are not ticks.

### Drill-down (`AdherenceLog`)

Steps and Calories rows join both columns using the existing partial-drift idiom:

- Partial: left `Steps · 4,340/7,000 · 62% of its share`, right `the other 38%`.
- Full floor: left column alone. Nothing yet: right column, `not yet`.
- Steps never pushed prints `—/7,000` — never a zero the phone didn't say.
- Imports `floorCredit`; never re-derives the fraction. Footer updated to name the
  two floors.

### Tests

Half-floor = half share; cap at 1; null = 0; clamp below 0; denominator is
scheduled + 2 even with zero habits scheduled; `BLOCK_SHARE + HABIT_SHARE = 100`
stays pinned. Existing `adherenceFor` tests updated for the new required argument.

### CLAUDE.md

Update the calories line ("nothing at all in adherence" is no longer true), the
adherence section's habit-share description, and note the floors in the Steps section.

## B. The Log as a file-explorer grid

`DayLog.tsx` is rewritten. **`/api/log` does not change** — it already returns full
bodies, ids and kinds, paged by day. Infinite scroll, dedup-by-date and the sentinel
stay. A day with nothing written still never appears.

### Shape

- **Month sections**, grouped client-side (a month grows as more of it streams in),
  drawn with the archive's `record-card` + `section-head` idiom, chapter name alongside
  from `/api/chapter`. Months are the "folders" of this explorer.
- **Every day is a tile**, ~3 per row on the phone, auto-fill on desktop. The date sits
  beneath the tile like a filename ("Tue 12" — the month lives in the section head).

### The tile

- **Journalled day:** the page thumbnail is the tile face (same `Sheet` treatment as
  the archive — ruled with the words as texture for typed, the PNG for drawings), a
  narrow rail of small dots beside it, one per attached log, in the pillar hues the log
  already uses (`KIND_HUE`). Two pages on one day: first page is the face, a small `×2`
  count says so.
- **Page-less day:** plain card-stock, deliberately **not** a blank sheet — a
  sheet-shaped tile on a day with no page would claim a page exists. Dots carry their
  short labels (session title / skill name / "drifted") at micro size, truncated;
  past ~4 entries, `+n`.

### Interaction

- **Tap opens the day**: one `<dialog>` overlay (the `AdherenceLog` idiom) — full date
  as its head, page(s) drawn large, then every attached entry with its body unfolded.
  The overlay IS the expansion; nothing inside needs a second tap.
- Reader-only, per the log's standing rule. A page inside links to the journal, where
  a page can actually be rewritten.
- The tile is a single button with a spoken label ("Tuesday 12 August — 1 page,
  2 sessions").

### Deleted

The two-shape system (`JournalDay` card / `ChipDay` row), the opening-line column
beside the page, inline chip expansion.
