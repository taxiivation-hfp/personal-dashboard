// HOURS WORKED, BY CATEGORY. PURE — no DB, no React; its only runtime import is worked.ts,
// which is import-free, so it runs under `node --test` with no dependencies.
//
// THE SCORE IS GONE — the owner's ruling of 2026-09-18: "Quantifying productivity is
// stupid." There are no points anywhere any more: no rate per hour, no flat figure per gym
// session, no points per non-negotiable, no total. What survives is the honest half of it,
// the question the score was a proxy for — WHERE DID THE WEEK'S HOURS GO? — answered in
// minutes, which are a duration you actually spent rather than a number the app invented.
//
// The file keeps its name because /api/productivity and the drill-down still import it;
// what it measures is hours.
//
// It feeds NOTHING: not adherence, not the rings, not the streak. It never reaches DayView.
//
// WHAT COUNTS AS AN HOUR WORKED is decided here and nowhere else:
//   - a block in one of the four CATEGORIES below (by its calendar colour),
//   - scaled by `workedFraction` — adhered is all of it, a partial drift its worked share,
//     unmarked / skipped / dismissed nothing,
//   - with a usable, non-negative duration.
// Graphite is not a category, so it is markable but never hours worked. Grape (gym)
// is not a category either — training is logged as sessions,
// and an hour under a bar is not an hour of work.

import { workedFraction, type BlockState } from "./worked.ts";

/**
 * The calorie floor's HOME is rings.ts since the pivot. Re-exported here, as a re-export
 * and never a copy, for the calorie screens that have always imported it from this module.
 * New code should import it from rings.ts.
 */
export { CALORIE_FLOOR } from "./rings.ts";

/** One union, defined in worked.ts beside the function that says what each state is worth. */
export type { BlockState };

/** Google Calendar colorId. null = the calendar's default colour, which is a real category
 *  here (Uni) and not an absence — Google omits the field for default-coloured events. */
export type ColorId = string | null;

export type HourCategoryLabel =
  | "Work Projects"
  | "Work Uni"
  | "Work Part Time"
  | "Uni";

/** The categories in the order they stack, bottom-up, and are listed. */
export const CATEGORY_ORDER: readonly HourCategoryLabel[] = [
  "Work Projects",
  "Work Uni",
  "Work Part Time",
  "Uni",
];

/**
 * THE TABLE: which calendar colour is which category. Retuning is a one-line change here.
 *
 * Anything NOT listed is not an hour worked, and that is deliberate: an unrecognised colour
 * must never silently join a category, because the failure would be invisible — a week
 * would simply read longer than it was with nothing on screen to say why.
 *
 * ONE CATEGORY MAY OWN TWO COLOURS. Work Part Time holds Lavender and Tomato because the
 * calendar genuinely holds both, and re-colouring a year of history is a worse trade than a
 * two-row table. Everything downstream merges by LABEL, and a category shows itself in its
 * CANONICAL colour — the first id listed for it.
 *
 * CHANGING THIS TABLE REWRITES HISTORY, silently: hours are recomputed from the live calendar
 * on every read, so adding a colour makes every past adhered block of it start counting.
 */
export const HOUR_CATEGORIES: {
  id: ColorId;
  /** Google's own name for the swatch, so the table can be checked against the UI. */
  google: string;
  label: HourCategoryLabel;
}[] = [
  // The owner's own things, the portfolio — the work nobody scheduled and nobody is paying
  // for, which is why it is the first to lose a week.
  { id: "10", google: "Basil", label: "Work Projects" },
  // Their own study in their own time, as distinct from a timetabled class.
  { id: "5", google: "Banana", label: "Work Uni" },
  // The hours sold for money. Two ids, one meaning.
  { id: "1", google: "Lavender", label: "Work Part Time" },
  { id: "11", google: "Tomato", label: "Work Part Time" },
  // The timetable: the calendar's DEFAULT colour.
  { id: null, google: "default", label: "Uni" },
];

/** The category whose hours fill half the CAREER ring (career.ts). */
export const CAREER_HOURS_CATEGORY: HourCategoryLabel = "Work Projects";

/** The category a colour belongs to, or null when it is not an hours category. */
export function categoryOf(colorId: ColorId): HourCategoryLabel | null {
  return HOUR_CATEGORIES.find((c) => c.id === colorId)?.label ?? null;
}

/** The colour a category is drawn in — the first id the table lists for it. */
export function canonicalColor(label: HourCategoryLabel): ColorId {
  return HOUR_CATEGORIES.find((c) => c.label === label)?.id ?? null;
}

/** One block, as far as hours are concerned. */
export type WorkBlock = {
  /** Scheduled minutes. The caller resolves an unknown duration to 0 before it gets here. */
  minutes: number;
  colorId: ColorId;
  /** The mark, or null when unmarked. */
  state: BlockState | null;
  /** How much of a drifted block was worked, 0..1, or null. See worked.ts. */
  workedFraction?: number | null;
};

/** One slab of a day's stacked hours bar. */
export type CategoryMinutes = {
  label: HourCategoryLabel;
  /** The category's canonical colour — see HOUR_CATEGORIES. */
  colorId: ColorId;
  /** Minutes WORKED in this category, whole. */
  minutes: number;
};

/** A day's hours worked. */
export type DayHours = {
  /**
   * The day's total minutes worked — EXACTLY the sum of `categories[].minutes`, so a stack
   * can never disagree with the figure it explains.
   */
  minutes: number;
  /** Non-empty categories only, in CATEGORY_ORDER. Empty for a day with nothing worked. */
  categories: CategoryMinutes[];
};

/**
 * THE MINUTES A BLOCK CONTRIBUTES — 0 for anything that is not an hour worked.
 *
 * The disqualifications hold at ANY fraction: an unlisted colour earns nothing however
 * diligently it was worked. A negative or non-finite duration contributes nothing rather
 * than subtracting from the day, and a corrupt fraction is clamped by workedFraction.
 */
export function workedMinutes(b: WorkBlock): number {
  if (categoryOf(b.colorId) == null) return 0;
  const worked = workedFraction(b.state, b.workedFraction);
  if (worked <= 0) return 0;
  const m = Number.isFinite(b.minutes) ? Math.max(0, b.minutes) : 0;
  return m * worked;
}

/**
 * A day's hours worked, by category.
 *
 * Minutes are accumulated EXACTLY per category and rounded once each — a 50-minute block at
 * 35% is 17.5, and rounding per block would let the slabs drift away from what they sum to.
 * The total is then the sum of those rounded slabs.
 */
export function hoursForDay(blocks: WorkBlock[]): DayHours {
  const raw = new Map<HourCategoryLabel, number>();
  for (const b of blocks) {
    const m = workedMinutes(b);
    if (m <= 0) continue;
    const label = categoryOf(b.colorId)!;
    raw.set(label, (raw.get(label) ?? 0) + m);
  }
  const categories: CategoryMinutes[] = [];
  for (const label of CATEGORY_ORDER) {
    const minutes = Math.round(raw.get(label) ?? 0);
    if (minutes > 0)
      categories.push({ label, colorId: canonicalColor(label), minutes });
  }
  return {
    minutes: categories.reduce((s, c) => s + c.minutes, 0),
    categories,
  };
}
