// Per-day productivity. PURE — no DB, no React, zero imports, so this runs under
// `node --test` with no dependencies.
//
// A DELIBERATE, OWNER-APPROVED EXCEPTION to CLAUDE.md's "output is never scored" — see the
// Productivity section there before changing anything here.
//
// THE EXCEPTION IS NARROW. It scores HOURS SPENT, never results produced: the only inputs
// are duration and the event's calendar colour, so a block worked badly and a block worked
// brilliantly score identically. Nothing about quality, or what was finished, or how much
// was produced reaches this file.
//
// It is UNCAPPED and comparative — the exact inverse of the ring rule in rings.ts, where
// capping is the entire mechanism. That inversion is why it must NEVER be drawn as a ring
// or as anything else implying a target, and why the two systems share no code.
//
// It feeds NOTHING: not adherence, not the rings, not the streak, not the coach. The
// quarantine is enforced by data flow rather than discipline — the score is assembled in
// /api/adherence and never reaches DayView, which is what the coach reads.

/** Google Calendar colorId. null = the calendar's default colour, which is a real tier
 *  here and not an absence — Google omits the field for default-coloured events. */
export type ColorId = string | null;

/** Re-declared rather than imported: this module must stay import-free. Keep in step with
 *  the identical union in adherence.ts. */
export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

export const POINTS_PER_HOUR = 100;
export const POINTS_PER_HABIT = 25;
export const POINTS_PER_WORKOUT = 100;
export const MINUTES_PER_HOUR = 60;

/**
 * THE tuning knob, and the only one. Retuning is a one-line change here, following the
 * `rings.ts` METRICS precedent — thresholds live in a pure module on purpose so they are
 * unit-testable and so retuning never means touching a query.
 *
 * Anything not listed scores ZERO. That is deliberate: an unrecognised colour must never
 * silently inherit a rate, because the failure would be invisible — a day would simply
 * read higher than it should with nothing on screen to say why.
 */
export const CALENDAR_RATES: {
  id: ColorId;
  /** Google's own name for the swatch, so the table can be checked against the UI. */
  google: string;
  label: string;
  /** Fraction of POINTS_PER_HOUR earned per hour. */
  rate: number;
}[] = [
  { id: "11", google: "Tomato", label: "Work", rate: 1 },
  { id: "7", google: "Peacock", label: "Uni", rate: 0.5 },
  { id: null, google: "default", label: "Uni", rate: 0.5 },
];

export const UNLISTED_RATE = 0;

/**
 * Which marks count as time spent. One place, so the rule is arguable in one line.
 *
 * "adhered" only, by the owner's ruling. A drifted block is by definition time spent on
 * something else; a skipped one didn't happen; an unmarked one is unknown, and counting it
 * would inflate today's figure all morning off blocks never confirmed. The consequence
 * worth knowing: a day you worked but never marked scores no time points. That rewards
 * marking, which is the behaviour the whole app is built to protect.
 */
export const COUNTED_STATES: readonly (BlockState | null)[] = ["adhered"];

export type ProductiveBlock = {
  /** Scheduled minutes. 0 when unknown — the caller resolves null before it gets here. */
  minutes: number;
  colorId: ColorId;
  /** The mark, or null when unmarked. */
  state: BlockState | null;
};

export type ProductivityInput = {
  blocks: ProductiveBlock[];
  /** Non-negotiables ticked that day, numeric ones included — an entry exists or it does not. */
  habitsDone: number;
  /** gym_sessions ROWS that day. Sessions, not days. All three kinds count: "not scored"
   *  is a statement about the Physical ring, and this is a separate system. */
  workouts: number;
};

export type ProductivityScore = {
  /** UNCAPPED. 1,125 is a valid reading. Always a number, never null. */
  points: number;
  timePoints: number;
  habitPoints: number;
  workoutPoints: number;
  /** Raw minutes that scored anything at all. */
  minutes: number;
  /** Those minutes after the colour rate is applied. */
  weightedMinutes: number;
};

export function rateFor(colorId: ColorId): number {
  const hit = CALENDAR_RATES.find((c) => c.id === colorId);
  return hit ? hit.rate : UNLISTED_RATE;
}

export function scoreDay(input: ProductivityInput): ProductivityScore {
  let minutes = 0;
  let weightedMinutes = 0;

  for (const b of input.blocks) {
    if (!COUNTED_STATES.includes(b.state)) continue;
    const rate = rateFor(b.colorId);
    // Not merely worth zero — an unlisted colour was never productive time, so it must not
    // inflate the raw minutes figure either.
    if (rate <= 0) continue;
    // Clamped: a malformed event with an end before its start must not subtract from
    // the day.
    const m = Math.max(0, b.minutes);
    minutes += m;
    weightedMinutes += m * rate;
  }

  // Each part is rounded independently so the three always sum to `points` exactly. Adding
  // them first and rounding once would let the parts disagree with the total on screen.
  const timePoints = Math.round((weightedMinutes / MINUTES_PER_HOUR) * POINTS_PER_HOUR);
  const habitPoints = input.habitsDone * POINTS_PER_HABIT;
  const workoutPoints = input.workouts * POINTS_PER_WORKOUT;

  return {
    points: timePoints + habitPoints + workoutPoints,
    timePoints,
    habitPoints,
    workoutPoints,
    minutes,
    weightedMinutes,
  };
}
