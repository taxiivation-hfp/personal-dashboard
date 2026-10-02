import type { CalEvent } from "./google";
// Explicit .ts extensions so `node --test` can resolve these modules. The type-only import
// above is erased, so every runtime dependency here is itself testable with zero setup:
// dates, worked and rings are import-free. The two floor constants are imported from their
// HOME, rings.ts, rather than restated — the checklist row, the chart's floor line, the
// Health ring and this figure must never disagree about where a line sits, and a copied
// number is how they would start to.
import { APP_TZ } from "./dates.ts";
import { workedFraction, type BlockState } from "./worked.ts";
import { CALORIE_FLOOR, STEPS_FLOOR } from "./rings.ts";

/**
 * Adherence maths.
 *
 * The owner's ruling: the denominator is BLOCKS WHOSE TIME HAS PASSED. A 21:00 block
 * is not counted at 14:00 — it hasn't had its chance yet. That keeps the number from
 * looking bad at lunchtime for no reason, while still meaning something during the day.
 *
 * An unmarked block whose time HAS passed counts against the rate. That is deliberate
 * pressure toward tap-as-you-go, chosen over the gentler alternative. The UI's job is
 * to make that read as "needs marking" rather than as an accusation — the pressure
 * should push toward logging, never toward feeling judged.
 *
 * 'dismissed' blocks are excluded from everything: a birthday or an invite you never
 * chose has no business in an adherence rate.
 */

// Defined in worked.ts, beside the function that says what each state is worth, and
// re-exported here because half the app imports it from this module.
export type { BlockState };

export type Block = {
  event_id: string;
  title: string;
  time_start: string | null;
  time_end: string | null;
  allDay: boolean;
  state: BlockState | null;
  reason: string | null;
  /**
   * How much of a DRIFTED block was worked, 0..1, or null where nobody was asked.
   *
   * Null is not zero. A drift marked before the slider existed, and one where the slider
   * was simply left alone, both read null — and both are worth nothing, because
   * `workedFraction` says so. The distinction is kept for the coach, which is the only
   * reader that cares whether a question was answered or never put.
   */
  workedFraction: number | null;
  /** Its time has passed, so it counts toward today's rate. */
  due: boolean;
  /** Google's palette id, or null for the calendar default. Categorisation only — it
   *  must never be read as status. See The Foreign Hue Rule in DESIGN.md. */
  colorId: string | null;
  /**
   * Scheduled length in minutes, or null when the event has no usable end.
   *
   * FOR THE ARITHMETIC. Adherence weighs blocks by the hour and productivity.ts sums
   * hours worked from it. It is deliberately withheld from /api/adherence's per-day block
   * summary, which lists spans as written ("10am–12pm") and never a duration.
   */
  minutes: number | null;
};

export type Adherence = {
  /**
   * 0-100. Always a number, and it only ever CLIMBS through the day.
   *
   * This replaced a ratio of adhered-to-due, which fell every time a block came due
   * unmarked and dropped again at the habit cutoff. Watching a number you were trying to
   * earn slide backwards all afternoon is demotivating in a way that makes people stop
   * looking, and a number nobody looks at cannot do its job. Now every hour worked and
   * every non-negotiable ticked ADDS, and nothing ever subtracts.
   *
   * Drift is not punished here — it simply does not add FOR THE PART YOU DRIFTED. A
   * drifted block can carry a worked fraction (see worked.ts), and an afternoon whose first
   * forty minutes went as planned adds those forty minutes. The three-state mark still
   * records what happened, and the coach still reads it; the hero figure just stops being
   * the place that holds it against you.
   */
  pct: number;
  /**
   * Blocked hours actually worked — INCLUDING the worked part of a drifted block.
   *
   * Renamed from `adheredHours`, which stopped being true the moment a drift could carry a
   * fraction: the figure now contains hours from blocks that are not adhered, and a name
   * that says otherwise is a trap for the next reader who trusts it.
   */
  workedHours: number;
  /** Blocked hours in the day, worked or not — the denominator for BLOCK_SHARE. */
  totalHours: number;
  adhered: number;
  drifted: number;
  skipped: number;
  /** Marked nothing yet, and their time has passed. The call to action. */
  unmarked: number;
  due: number;
  /**
   * Non-negotiables ticked, and how many apply today. TICKS ONLY: the step and calorie
   * floors enter `pct` through `floorCredit` but are not ticks, so they are not counted
   * here — the caption "3 of 5 ticked" must stay a true sentence.
   */
  habitsDone: number;
  habitsScheduled: number;
};

/** The day's non-negotiable tally. `scheduled` is how many applied that weekday. */
export type HabitTally = { scheduled: number; done: number };

/**
 * The day's two FLOOR readings, raw — the caller passes what was measured and this module
 * decides what it earns. Null is "nobody measured": a phone that never pushed, a day with
 * no food logged. Both earn nothing, exactly as an unticked habit earns nothing, and the
 * distinction from a genuine 0 is kept because the screens print them differently.
 */
export type FloorReadings = {
  steps: number | null;
  calories: number | null;
};

/**
 * What a floor reading has EARNED of its one share: 0..1, the fraction of the floor
 * reached, capped there. 3,500 steps is half a share; 14,000 is exactly one — the cap is
 * the same statement the rings make, that what you see past the line is true but not worth
 * more.
 *
 * Defensive on the same grounds as `workedFraction`, which is this function's pattern: the
 * value arrives from a REAL column and a running total, so null, NaN and negatives must all
 * die here. Above 1 a floor could outearn its share; below 0, logging could LOWER the
 * figure — the one thing the climbing number must never do.
 *
 * Exported for the drill-down, which prints the fraction it explains and must never
 * re-derive it.
 */
export function floorCredit(
  value: number | null | undefined,
  floor: number,
): number {
  if (typeof value !== "number" || !Number.isFinite(value) || floor <= 0)
    return 0;
  return Math.min(1, Math.max(0, value / floor));
}

/**
 * How many floor items join the non-negotiable denominator EVERY day — Steps and
 * Calories, the owner's ruling. Always two, never "two when the phone pushed": a
 * denominator that wobbled with a battery would change what every other item is worth
 * for reasons nothing you did caused. A day with no reading simply has not earned that
 * share, which is the same statement the whole figure makes.
 */
const FLOOR_ITEMS = 2;

/**
 * THE TWO HALVES, and they are halves on purpose.
 *
 * 50/50, the owner's ruling, replacing 70/30. The old split said an hour of blocked time
 * was worth more than two thirds of a day, which made the figure mostly a story about the
 * calendar — a day with nothing scheduled could barely climb however much of the standing
 * minimum was kept, and a day of long blocks read well with the whole checklist untouched.
 * Even halves say the thing the app actually believes: the hours you said you would work
 * and the things you do every day regardless are worth the same, and a day is answered by
 * both.
 *
 * They must sum to 100 — the figure is a percentage and a test pins it.
 */
/** Share of the day's figure that blocked time can earn. */
export const BLOCK_SHARE = 50;
/** Share the non-negotiables can earn, split evenly between them. */
export const HABIT_SHARE = 50;

const localDateTime = (iso: string): number => new Date(iso).getTime();

/** Has this event finished, as of `nowMs`? All-day events settle at end of day. */
function isDue(ev: CalEvent, dateISO: string, nowMs: number): boolean {
  if (ev.allDay) {
    const endOfDay = new Date(`${dateISO}T23:59:59`).getTime();
    return nowMs > endOfDay;
  }
  const end = ev.end
    ? localDateTime(ev.end)
    : ev.start
      ? localDateTime(ev.start)
      : null;
  if (end == null || Number.isNaN(end)) return false;
  return nowMs >= end;
}

const hhmm = (iso: string | null): string | null =>
  iso == null
    ? null
    : new Intl.DateTimeFormat("en-AU", {
        hour: "2-digit",
        minute: "2-digit",
        hour12: false,
        timeZone: APP_TZ,
      }).format(new Date(iso));

/** Scheduled length, for scoring. Null rather than 0 when either end is missing or
 *  unparseable — an unknown duration is not a zero-length block. */
const durationMinutes = (
  start: string | null,
  end: string | null,
): number | null => {
  if (!start || !end) return null;
  const a = Date.parse(start);
  const b = Date.parse(end);
  if (Number.isNaN(a) || Number.isNaN(b)) return null;
  return Math.max(0, Math.round((b - a) / 60000));
};

/**
 * Is this calendar event a TIME BLOCK? THE ONE PLACE that decides — every reader of blocks
 * (the day's list, adherence on Today and on the strip, hours worked, the drill-downs) gets
 * them from `buildBlocks`, which asks this.
 *
 * EVERY COLOUR IS A BLOCK, by the owner's ruling of 2026-10-03 (reversing the graphite
 * exclusion of 2026-09-18): any timed event can be adhered, drifted or skipped. Colour
 * still decides hours worked (`categoryOf`), not whether a block can be marked.
 *
 * Not a block: an ALL-DAY entry only (a condition of the day, not eight hours of work you
 * failed to do).
 */
export function isBlockEvent(e: Pick<CalEvent, "allDay">): boolean {
  return !e.allDay;
}

/** Merge live calendar events with stored marks into the day's block list. */
export function buildBlocks(
  dateISO: string,
  events: CalEvent[],
  marks: Map<
    string,
    { state: BlockState; reason: string | null; workedFraction?: number | null }
  >,
  nowMs = Date.now(),
): Block[] {
  return events
    .filter(isBlockEvent)
    .map((e) => {
      const m = marks.get(e.id);
      return {
        event_id: e.id,
        title: e.summary,
        time_start: hhmm(e.start),
        time_end: hhmm(e.end),
        allDay: e.allDay,
        state: m?.state ?? null,
        reason: m?.reason ?? null,
        workedFraction: m?.workedFraction ?? null,
        due: isDue(e, dateISO, nowMs),
        colorId: e.colorId,
        minutes: durationMinutes(e.start, e.end),
      };
    });
}

/**
 * The day's figure: half blocked time, half non-negotiables, climbing from zero.
 *
 * BLOCKED TIME IS WEIGHTED BY THE HOUR, not by the item. A three-hour block is worth three
 * times a one-hour block, which is a deliberate reversal of the old one-item-one-item rule
 * — the owner's call, on the grounds that the day is made of hours and an afternoon spent
 * as planned is simply more of the day than a fifteen-minute errand. Every hour of the
 * day's blocked total is worth BLOCK_SHARE/totalHours.
 *
 * NON-NEGOTIABLES SPLIT HABIT_SHARE EVENLY, and THE TWO FLOORS ARE TWO MORE OF THEM.
 * Habits have no duration, so there is nothing to weight them by, and a checklist where
 * some items quietly matter more than others is a checklist you start gaming. Steps and
 * Calories join the same even split — five habits make seven items — but earn their share
 * FRACTIONALLY, by `floorCredit`: half the step floor is half a share. They are the only
 * fractional items because they are the only ones that ARE quantities; a tick has no
 * halves.
 *
 * `floors` is REQUIRED, not defaulted. A caller that forgot it would silently compute a
 * different denominator for the same day, and two screens disagreeing about one figure is
 * the exact failure worked.ts exists to prevent.
 *
 * THE DENOMINATOR IS THE WHOLE DAY, not the part of it that has elapsed. That is what makes
 * the figure climb: at 8am nothing is worked yet so it reads 0, and it rises as the day is
 * lived rather than starting at 100 and eroding.
 */
export function adherenceFor(
  blocks: Block[],
  habits: HabitTally | null | undefined,
  floors: FloorReadings,
): Adherence {
  const counted = blocks.filter((b) => b.state !== "dismissed");
  // An unknown duration cannot be weighed, so it is left out of both sides rather than
  // silently counted as zero hours — which would make the block unearnable.
  const hoursOf = (b: Block) => (b.minutes ?? 0) / 60;

  const totalHours = counted.reduce((sum, b) => sum + hoursOf(b), 0);
  /**
   * WHAT WAS WORKED, which is no longer the same question as what was adhered.
   *
   * `workedFraction` is 1 for an adhered block and 0 for everything except a drift that
   * carries a slider value — so a day with no partial drifts computes exactly as it did
   * before, and every figure already on record is unchanged. What is new is that a block
   * you worked half of adds half of itself, instead of adding nothing.
   *
   * Drift still is not punished; it simply does not add FOR THE PART YOU DRIFTED. The
   * figure can still only climb, and marking a block can still only ever raise it.
   */
  const workedHours = counted.reduce(
    (sum, b) => sum + hoursOf(b) * workedFraction(b.state, b.workedFraction),
    0,
  );

  const drifted = counted.filter((b) => b.state === "drifted").length;
  const skipped = counted.filter((b) => b.state === "skipped").length;
  const adhered = counted.filter((b) => b.state === "adhered").length;
  const unmarked = counted.filter((b) => b.state == null && b.due).length;

  const habitsScheduled = habits ? Math.max(0, habits.scheduled) : 0;
  const habitsDone = habits
    ? Math.max(0, Math.min(habits.done, habitsScheduled))
    : 0;

  // The floors' earned fractions, 0..1 each — clamped in floorCredit, so nothing here can
  // exceed its item or fall below nothing. The denominator holds both floors whatever was
  // measured; see FLOOR_ITEMS.
  const floorEarned =
    floorCredit(floors.steps, STEPS_FLOOR) +
    floorCredit(floors.calories, CALORIE_FLOOR);
  const habitItems = habitsScheduled + FLOOR_ITEMS;

  const blockPart = totalHours > 0 ? (workedHours / totalHours) * BLOCK_SHARE : 0;
  const habitPart =
    habitItems > 0 ? ((habitsDone + floorEarned) / habitItems) * HABIT_SHARE : 0;

  return {
    pct: Math.round(blockPart + habitPart),
    workedHours,
    totalHours,
    adhered,
    drifted,
    skipped,
    unmarked,
    due: counted.length,
    habitsDone,
    habitsScheduled,
  };
}

/**
 * The next block that has not started, or null once the day's last one has.
 *
 * Lives here rather than in the component because it is the only interesting thing that
 * component does, and a filter with four clauses is worth a test. All four earn their place:
 *
 *   - ALL-DAY events are excluded. They are not a next thing, they are a condition of the
 *     whole day, and putting "Semester 2" where the next lecture should be is useless.
 *   - DISMISSED blocks are excluded, because dismissing one is saying it is not part of the
 *     day.
 *   - A block with no start time cannot be placed, so it cannot be next.
 *   - Strictly AFTER now. The block you are currently inside is not next, it is now.
 *
 * `nowMinutes` is minutes since local midnight, passed in rather than read, so this is
 * testable and so the caller owns what "now" means.
 */
export function nextBlockAfter(
  blocks: Block[],
  nowMinutes: number,
): Block | null {
  const at = (hhmm: string | null): number | null => {
    if (!hhmm) return null;
    const [h, m] = hhmm.split(":").map(Number);
    return Number.isFinite(h) && Number.isFinite(m) ? h * 60 + m : null;
  };
  let best: { b: Block; at: number } | null = null;
  for (const b of blocks) {
    if (b.allDay || b.state === "dismissed") continue;
    const t = at(b.time_start);
    if (t == null || t <= nowMinutes) continue;
    if (!best || t < best.at) best = { b, at: t };
  }
  return best ? best.b : null;
}
