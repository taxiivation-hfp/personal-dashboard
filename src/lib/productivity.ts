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
  // Uni is the calendar's DEFAULT colour — an event you scheduled without thinking about
  // its colour. Peacock briefly sat here too, but that was a stray on a couple of real
  // events rather than a rule; a colour has to be chosen deliberately to mean something.
  { id: null, google: "default", label: "Uni", rate: 0.5 },
  // Gym. This is where a workout enters the score, and it is the ONLY place — see the note
  // on ProductivityInput. Half rate, the owner's ruling: an hour under a bar is an hour
  // spent, and it is not the hour the day was built around.
  { id: "3", google: "Grape", label: "Gym", rate: 0.5 },
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
  /**
   * Non-negotiables ticked that day, numeric ones included — an entry exists or it does not.
   *
   * These DO stay in the score even though adherence counts them too, and that is not a
   * double count: adherence and productivity are two different questions asked of the same
   * day. Ticking a non-negotiable is both "I did what I said I'd do" and "I spent time on
   * it", and it is allowed to answer both.
   */
  habitsDone: number;
};

/**
 * WORKOUTS ARE NOT AN INPUT, AND THAT IS DELIBERATE.
 *
 * A gym session used to score 100 points from its gym_sessions row. It now scores from the
 * CALENDAR instead, as a Grape block, at half rate like any other hour. Both at once would
 * have been a real double count — the same hour paid for twice, once because it was
 * scheduled and again because it was written up afterwards — and it would have quietly
 * rewarded logging rather than training.
 *
 * The consequence worth knowing: a session you did but never put in the calendar scores
 * nothing here. That is consistent with COUNTED_STATES, which only pays for blocks you
 * marked. The Physical ring still counts the logged session, and that is the ring's job.
 */

/**
 * One slab of the day's stacked bar.
 *
 * The bar is the day's productivity broken into what produced it, so the colour of an
 * hour on the chart is the colour of that hour in the calendar. `colorId` is null for the
 * two segments that are not blocked time at all.
 */
export type ProductivitySegment = {
  kind: "time" | "habits";
  colorId: ColorId;
  points: number;
};

export type ProductivityScore = {
  /** UNCAPPED. 1,125 is a valid reading. Always a number, never null. */
  points: number;
  timePoints: number;
  habitPoints: number;
  /** Raw minutes that scored anything at all. */
  minutes: number;
  /** Those minutes after the colour rate is applied. */
  weightedMinutes: number;
  /**
   * The stack, largest first. Segments always sum to `points`.
   *
   * Blocked time is merged BY COLOUR rather than left one-per-event: a day of six Uni
   * blocks would otherwise draw six identical slabs with hairlines between them, which
   * reads as detail the chart is not carrying.
   */
  segments: ProductivitySegment[];
};

export function rateFor(colorId: ColorId): number {
  const hit = CALENDAR_RATES.find((c) => c.id === colorId);
  return hit ? hit.rate : UNLISTED_RATE;
}

export function scoreDay(input: ProductivityInput): ProductivityScore {
  let minutes = 0;
  let weightedMinutes = 0;
  /** Weighted minutes per colour, so the bar can be split the way the calendar was. */
  const byColour = new Map<ColorId, number>();

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
    byColour.set(b.colorId, (byColour.get(b.colorId) ?? 0) + m * rate);
  }

  // Each part is rounded independently so the three always sum to `points` exactly. Adding
  // them first and rounding once would let the parts disagree with the total on screen.
  const timePoints = Math.round(
    (weightedMinutes / MINUTES_PER_HOUR) * POINTS_PER_HOUR,
  );
  const habitPoints = input.habitsDone * POINTS_PER_HABIT;

  // Colour slabs are apportioned out of the ALREADY-ROUNDED timePoints, and the smallest
  // takes the remainder. Rounding each colour independently would let the stack drift a
  // point or two from the total it is supposed to be a picture of.
  const colours = [...byColour.entries()].sort((a, b) => b[1] - a[1]);
  const segments: ProductivitySegment[] = [];
  let assigned = 0;
  colours.forEach(([colorId, wm], i) => {
    const pts =
      i === colours.length - 1
        ? timePoints - assigned
        : Math.round((wm / weightedMinutes) * timePoints);
    assigned += pts;
    if (pts > 0) segments.push({ kind: "time", colorId, points: pts });
  });
  if (habitPoints > 0)
    segments.push({ kind: "habits", colorId: null, points: habitPoints });

  return {
    points: timePoints + habitPoints,
    timePoints,
    habitPoints,
    minutes,
    weightedMinutes,
    segments,
  };
}
