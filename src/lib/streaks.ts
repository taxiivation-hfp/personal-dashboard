// PER-ITEM STREAKS — one per non-negotiable, one for the food log, one for steps. The
// owner's rulings, 2026-08-21 and 2026-08-24.
//
// A streak here is a PLAIN COUNT of consecutive days. Since 2026-08-24 it is printed with
// a FLAME whose hue walks light yellow → purple over days 1–30 (`streakHue` below) — the
// owner's ruling, revising the earlier no-flames stance. What survives that revision
// unchanged: no "don't break it" copy anywhere it is printed, and a streak of 0 is drawn
// as NOTHING rather than as a zero — a row that greets an off week with "0" is a row that
// scolds, and a list that scolds is a list you stop ticking honestly.
//
// PURE, and its one import is dates.ts (itself import-free), so `node --test` runs this
// file directly — the same terms rings.ts, goals.ts and tasks.ts live under. The SQL that
// feeds it lives in queries.ts; what lives here is the walk, which is the part with rules
// in it.

import { addDays } from "./dates.ts";

/**
 * THE FOOD-LOG FLOOR: a day counts toward the calorie streak once its logged total
 * reaches this. Deliberately BELOW the 2,500 CALORIE_FLOOR, and deliberately not that
 * constant — the two are different questions. The floor asks "did you eat enough", which
 * is the checklist row's and the score's business; the streak asks only "did you log the
 * day", and 2,000 is where a total stops looking like a morning someone gave up on and
 * starts looking like a day written down. A streak pinned to the eating floor would give
 * an honest under-day a reason not to be logged, which is the one failure this app
 * cannot absorb.
 */
export const CALORIE_STREAK_FLOOR = 2000;

/** Where the flame's walk starts and ends, in HSL hue degrees. 50 is a light yellow;
 *  280 is the purple a month-long run wears. Exported so a test can pin the endpoints
 *  without restating them. */
export const STREAK_HUE_START = 50;
export const STREAK_HUE_END = 280;
/** The day the hue stops moving. A run past a month is the same purple as a month. */
export const STREAK_HUE_DAYS = 30;

/**
 * The flame's hue for a run of `days` — CONTINUOUS from light yellow at day 1 to purple
 * at day 30, clamped at both ends. The owner's ruling, 2026-08-24.
 *
 * One function, imported by every surface that draws a streak (the pill's tint, its glow,
 * the emoji's hue-rotate), because two interpolations of the same walk would eventually
 * disagree about what day 17 looks like. Pure arithmetic so it tests under `node --test`.
 */
export function streakHue(days: number): number {
  if (!Number.isFinite(days)) return STREAK_HUE_START;
  const t = Math.min(1, Math.max(0, (days - 1) / (STREAK_HUE_DAYS - 1)));
  return STREAK_HUE_START + t * (STREAK_HUE_END - STREAK_HUE_START);
}

/**
 * The run of consecutive EARNED days ending at `anchor`, walking backwards.
 *
 *   - `earned` is the set of dates the item was done on — a tick, a page, a session, a
 *     ≥2,000 food log. The caller decides what earning means; this only counts.
 *   - A day `scheduledOn` says no to neither counts nor breaks. A Sundays-only item does
 *     not lose its run to six Mondays–Saturdays, and an entry landing on an off day
 *     (a mask edited later, a backdated tick) is skipped rather than double-read.
 *   - `grace` is for an anchor still being LIVED: today unearned at 2pm is "not yet",
 *     never a break, so the run ending yesterday still shows. It applies to the anchor
 *     date alone — a past day that stayed unearned genuinely ended the run.
 *
 * The walk is bounded by the earliest earned date, so a mask that says no to every
 * weekday cannot send it back through an unbounded calendar.
 */
export function streakEnding(
  anchor: string,
  earned: ReadonlySet<string>,
  opts?: {
    scheduledOn?: (date: string) => boolean;
    grace?: boolean;
  },
): number {
  if (earned.size === 0) return 0;
  const scheduledOn = opts?.scheduledOn ?? (() => true);

  let floor = anchor;
  for (const d of earned) if (d < floor) floor = d;

  let count = 0;
  let cur = anchor;
  while (cur >= floor) {
    if (scheduledOn(cur)) {
      if (earned.has(cur)) count++;
      else if (!(opts?.grace && cur === anchor)) break;
    }
    cur = addDays(cur, -1);
  }
  return count;
}
