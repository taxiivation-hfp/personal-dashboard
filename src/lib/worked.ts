// HOW MUCH OF A BLOCK WAS WORKED. One rule, five readers.
//
// PURE and import-free, so it runs under `node --test` with no dependencies and so the
// modules that must stay testable can take it without taking anything else.
//
// A block used to be worked or not worked, and the only fractions the maths could express
// were 0 and 1. An afternoon whose first forty minutes went as planned and whose rest did
// not was recorded as though nothing had happened. The slider on a drift is what says
// otherwise, and this is the one place that turns a mark into a quantity.

/**
 * The three states plus 'dismissed', declared HERE and imported by everyone.
 *
 * It used to be written out verbatim in three files — adherence.ts, productivity.ts and
 * engine.ts — which was harmless only while nothing read across them. The fraction reads
 * across all three, so the union moves to the module that defines what the states are
 * WORTH.
 */
export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

/**
 * The fraction of a block's scheduled time that was actually worked: 0..1.
 *
 * THE ARGUMENT, moved here in full from productivity.ts's COUNTED_STATES, because it is
 * now this function that makes the ruling and a rule should sit with its reasoning:
 *
 *   "adhered" only, by the owner's ruling. A drifted block is by definition time spent on
 *   something else; a skipped one didn't happen; an unmarked one is unknown, and counting
 *   it would inflate today's figure all morning off blocks never confirmed. The
 *   consequence worth knowing: a day you worked but never marked scores no time points.
 *   That rewards marking, which is the behaviour the whole app is built to protect.
 *
 * Every clause of that survives. What the slider changes is only the middle one: a drift is
 * time spent on something else FOR THE PART YOU DRIFTED, and the part you worked is time
 * you worked. A drift with no fraction is still worth exactly nothing, which is what every
 * drift in the table before this existed is — and NULL is why they can stay that way
 * honestly rather than being back-filled with a 0 nobody typed.
 *
 * SKIPPED AND DISMISSED TAKE NO FRACTION AT ALL, and unmarked cannot have one. Only a drift
 * is a partial thing; the others are answers about whether the block happened, not about
 * how much of it did.
 *
 * `stored` is defensive on purpose. It arrives from a REAL column and from a JSON body, so
 * it can be null, absent, NaN, negative or 1.4, and none of those may be allowed to reach
 * the arithmetic: a fraction above 1 would let a single block earn more of the day than it
 * occupies, and a negative one would make marking a block LOWER the figure — the one thing
 * the climbing number must never do.
 */
export function workedFraction(
  state: BlockState | null,
  stored: number | null | undefined,
): number {
  if (state === "adhered") return 1;
  if (state !== "drifted") return 0;
  return typeof stored === "number" && Number.isFinite(stored)
    ? Math.min(1, Math.max(0, stored))
    : 0;
}

/**
 * A fraction on its way INTO the database, or null if there is nothing worth storing.
 *
 * Null rather than 0 for an untouched slider, for the same reason the column is nullable:
 * "nobody was asked" and "you said none of it" are different facts, and only one of them
 * should be written on the owner's behalf.
 */
export function normaliseFraction(
  v: number | null | undefined,
): number | null {
  if (typeof v !== "number" || !Number.isFinite(v)) return null;
  return Math.min(1, Math.max(0, v));
}

/**
 * WOULD DISMISSING THIS BLOCK TAKE BACK TIME ALREADY EARNED? True when the mark already on
 * the row is worth hours — an adherence, or a drift carrying a worked fraction above 0.
 *
 * A dismissal is not a fourth state of a block that happened: it means the row was never part
 * of the day — an invite, a birthday, something never meant to be done. Adherence honours
 * that by dropping dismissed blocks from BOTH sides of the block share, which is right for a
 * row that earned nothing and wrong for one that earned something: dismissing an adhered hour
 * out of a two-hour day takes its worked hour out of the numerator and its scheduled hour out
 * of the denominator, and the figure FALLS. The spec puts a dismiss control on every row,
 * including rows already marked — so one stray tap could drop a live day's figure by 25
 * points, and `markBlock` clears `worked_fraction` on the way, so the worked time is not even
 * recoverable by re-marking.
 *
 * "Nothing can make the figure fall, and no fraction may" is the rule this protects, and it
 * is the same clamp argument `workedFraction` already runs under — which is why the question
 * is asked THROUGH `workedFraction` rather than by re-listing the states: whatever a state is
 * worth to the day, it is worth exactly that here.
 *
 * `engine.markBlock` is the one enforcer (rules live in the engine, and a rule enforced in a
 * component is one every other caller walks past); it leaves the stored mark alone and
 * returns it, which the RESULTING-state contract already covers.
 */
export function dismissalWouldErase(
  prev:
    | { state: BlockState | null; workedFraction?: number | null }
    | null
    | undefined,
): boolean {
  return !!prev && workedFraction(prev.state ?? null, prev.workedFraction) > 0;
}

/**
 * The step the slider moves in, as a fraction. 5% — six minutes on a two-hour block.
 *
 * Finer is precision you do not have about an afternoon. The UI is the only consumer, but
 * it lives here so that the value the screen offers and the value the maths accepts are
 * named in one place.
 */
export const WORKED_STEP = 0.05;

/**
 * At the top of the slider a drift IS an adherence — same hours, same points, same lap —
 * so the mark is rewritten rather than left as a record that argues with itself.
 *
 * Exported so `engine.markBlock` and the tests agree on where the edge is, and so the
 * number 1 is not written into a condition somewhere as a magic value.
 */
export const FULLY_WORKED = 1;
