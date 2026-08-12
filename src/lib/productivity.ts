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

/**
 * A GYM SESSION, AS A FLAT FIGURE — the one thing here that is not priced by the clock.
 *
 * The owner's ruling, and the reasoning is the sharpest argument in this file: three hours
 * under a bar is not more productive than two. An hourly rate says it is, and that is the
 * one claim about training this app should not make — it would pay for dawdling between
 * sets and dock a session that was efficient. A session happened or it did not, and it is
 * worth what a session is worth.
 *
 * So it is priced like a non-negotiable rather than like an hour: two of them, in points.
 * The consequence, and it is intended: a two-hour session and a forty-minute one score
 * identically, and a day with two sessions scores twice one.
 */
export const POINTS_PER_SESSION = 100;

/**
 * The calorie FLOOR — a number to reach, never a ceiling to stay under.
 *
 * The owner's, and the direction is the whole point: this is someone training, for whom
 * under-eating is the failure and there is no upper bound worth drawing. It scores exactly
 * one non-negotiable's worth, because that is what it is — a daily thing you either did or
 * did not do.
 *
 * It does NOT reach adherence. Adherence is blocked hours and the non-negotiables list, and
 * calories are on neither; a floor that moved the hero figure would be a target by another
 * name. This is the productivity score, which is allowed to count hours and effort.
 */
export const CALORIE_FLOOR = 2500;
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
  // GRAPE IS DELIBERATELY ABSENT. Gym used to score here at half rate, as hours; it scores
  // from the LOGGED SESSION now, at a flat POINTS_PER_SESSION — see that constant for why,
  // and `workouts` below for the double-count guard that keeps it to one of the two. A
  // Grape block on the calendar is therefore worth nothing on its own, exactly like any
  // other unlisted colour: the session is the record, and the block is just where it was
  // going to happen.
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
  /**
   * The day's calorie total, or null if nothing was logged.
   *
   * At or above CALORIE_FLOOR it scores one non-negotiable's worth and joins the SAME grey
   * slab the non-negotiables occupy. One grey rather than two: both are things you ticked
   * off a day rather than hours you scheduled, and a second achromatic slab would be a
   * distinction the chart cannot draw and the reader cannot use.
   */
  calories?: number | null;
  /**
   * GYM SESSIONS LOGGED THAT DAY — one row per session, so two lifts and a run is 3.
   *
   * This is the ONE place a workout enters the score, and the exclusivity is what keeps it
   * honest: Grape has been removed from CALENDAR_RATES, so a gym block on the calendar pays
   * nothing on its own. Paying both would be the same training bought twice — once for
   * scheduling it and again for doing it.
   *
   * Which of the two is the record was reversed on the owner's ruling, and the argument is
   * in POINTS_PER_SESSION: an hourly rate claims three hours under a bar beat two, and that
   * is a claim about training this app has no business making. The calendar prices time;
   * training is not time, it is a thing that happened.
   *
   * The consequence worth knowing, and it is the mirror of the old one: a session you
   * SCHEDULED but never logged scores nothing here. That is consistent with the rest of the
   * file — COUNTED_STATES only pays for blocks you marked, and this only pays for sessions
   * you wrote up. Both ask you to say what happened. The Physical ring reads the same
   * logged row, which is the ring's job and not a second payment.
   */
  workouts?: number;
};

/**
 * One slab of the day's stacked bar.
 *
 * The bar is the day's productivity broken into what produced it, so the colour of an
 * hour on the chart is the colour of that hour in the calendar. `colorId` is null for the
 * two segments that are not blocked time at all.
 */
export type ProductivitySegment = {
  /**
   * "time" is blocked calendar hours and carries that hour's colour. "habits" is the
   * things you ticked. "sessions" is training logged — not an hour, so it has no colorId
   * and no rate, and the chart gives it its own fill (SLAB_GYM).
   */
  kind: "time" | "habits" | "sessions";
  colorId: ColorId;
  points: number;
  /**
   * The RAW scheduled minutes behind this slab, before the colour's rate. 0 on the habits
   * slab, which is not time at all.
   *
   * Carried so the day's workings can be shown without a second implementation of this
   * rule. A breakdown computed anywhere else would eventually disagree with the bar it is
   * supposed to explain, and a disagreeing explanation is worse than none.
   */
  minutes: number;
  /** The colour's rate, as applied. null on the habits slab, which has no rate. */
  rate: number | null;
};

export type ProductivityScore = {
  /** UNCAPPED. 1,125 is a valid reading. Always a number, never null. */
  points: number;
  timePoints: number;
  habitPoints: number;
  /** Logged training, at a flat rate per session — see POINTS_PER_SESSION. */
  sessionPoints: number;
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
  /** The same split before the rate, so a slab can say what it was made of. */
  const rawByColour = new Map<ColorId, number>();

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
    rawByColour.set(b.colorId, (rawByColour.get(b.colorId) ?? 0) + m);
  }

  // Each part is rounded independently so the three always sum to `points` exactly. Adding
  // them first and rounding once would let the parts disagree with the total on screen.
  const timePoints = Math.round(
    (weightedMinutes / MINUTES_PER_HOUR) * POINTS_PER_HOUR,
  );
  // The calorie floor counts as one more ticked thing. Below it, nothing — a floor you did
  // not reach is not a partial credit, or it would stop being a floor.
  const ticked =
    input.habitsDone +
    ((input.calories ?? 0) >= CALORIE_FLOOR ? 1 : 0);
  const habitPoints = ticked * POINTS_PER_HABIT;
  // Flat per session, never per hour. Clamped and floored, because a caller that has not
  // been taught this input yet sends undefined and a corrupt one could send anything —
  // neither may subtract from a day.
  const sessions = Math.max(0, Math.floor(input.workouts ?? 0));
  const sessionPoints = sessions * POINTS_PER_SESSION;

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
    if (pts > 0)
      segments.push({
        kind: "time",
        colorId,
        points: pts,
        minutes: rawByColour.get(colorId) ?? 0,
        rate: rateFor(colorId),
      });
  });
  // Training sits between the hours and the ticks in the stack: it is not blocked time, but
  // it is more than a box — it keeps its own slab rather than joining the grey, because the
  // owner asked to SEE it and two achromatic slabs cannot be told apart at 80px tall.
  if (sessionPoints > 0)
    segments.push({
      kind: "sessions",
      colorId: null,
      points: sessionPoints,
      minutes: 0,
      rate: null,
    });
  if (habitPoints > 0)
    segments.push({
      kind: "habits",
      colorId: null,
      points: habitPoints,
      minutes: 0,
      rate: null,
    });

  return {
    points: timePoints + sessionPoints + habitPoints,
    timePoints,
    habitPoints,
    sessionPoints,
    minutes,
    weightedMinutes,
    segments,
  };
}
