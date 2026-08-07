import type { CalEvent } from "./google";
// Explicit .ts extension so `node --test` can resolve this module. The type-only import
// above is erased, so adherence.ts has exactly one runtime dependency and stays testable
// with zero setup.
import { APP_TZ } from "./dates.ts";

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

export type BlockState = "adhered" | "drifted" | "skipped" | "dismissed";

export type Block = {
  event_id: string;
  title: string;
  time_start: string | null;
  time_end: string | null;
  allDay: boolean;
  state: BlockState | null;
  reason: string | null;
  /** Its time has passed, so it counts toward today's rate. */
  due: boolean;
  /** Google's palette id, or null for the calendar default. Categorisation only — it
   *  must never be read as status. See The Foreign Hue Rule in DESIGN.md. */
  colorId: string | null;
  /**
   * Scheduled length in minutes, or null when the event has no usable end.
   *
   * FOR SCORING ONLY. The calendar column shows the allocated span as written
   * ("10am–12pm") and never a duration — no "2h", no "3h left". This field exists so
   * productivity.ts can weigh an hour, and it is deliberately withheld from the API's
   * block summary so the frontend cannot render it by accident.
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
   * Drift is not punished here — it simply does not add. The three-state mark still
   * records what happened, and the coach still reads it; the hero figure just stops being
   * the place that holds it against you.
   */
  pct: number;
  /** Blocked hours actually worked. */
  adheredHours: number;
  /** Blocked hours in the day, worked or not — the denominator for the 70. */
  totalHours: number;
  adhered: number;
  drifted: number;
  skipped: number;
  /** Marked nothing yet, and their time has passed. The call to action. */
  unmarked: number;
  due: number;
  /** Non-negotiables ticked, and how many apply today. */
  habitsDone: number;
  habitsScheduled: number;
};

/** The day's non-negotiable tally. `scheduled` is how many applied that weekday. */
export type HabitTally = { scheduled: number; done: number };

/** Share of the day's figure that blocked time can earn. */
export const BLOCK_SHARE = 70;
/** Share the non-negotiables can earn, split evenly between them. */
export const HABIT_SHARE = 30;

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

/** Merge live calendar events with stored marks into the day's block list. */
export function buildBlocks(
  dateISO: string,
  events: CalEvent[],
  marks: Map<string, { state: BlockState; reason: string | null }>,
  nowMs = Date.now(),
): Block[] {
  return events
    .filter((e) => !e.allDay) // all-day entries are not time blocks
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
        due: isDue(e, dateISO, nowMs),
        colorId: e.colorId,
        minutes: durationMinutes(e.start, e.end),
      };
    });
}

/**
 * The day's figure: 70 parts blocked time, 30 parts non-negotiables, climbing from zero.
 *
 * BLOCKED TIME IS WEIGHTED BY THE HOUR, not by the item. A three-hour block is worth three
 * times a one-hour block, which is a deliberate reversal of the old one-item-one-item rule
 * — the owner's call, on the grounds that the day is made of hours and an afternoon spent
 * as planned is simply more of the day than a fifteen-minute errand. Every hour of the
 * day's blocked total is worth BLOCK_SHARE/totalHours.
 *
 * NON-NEGOTIABLES SPLIT HABIT_SHARE EVENLY — five of them and each is worth six. They have
 * no duration, so there is nothing to weight them by, and a checklist where some items
 * quietly matter more than others is a checklist you start gaming.
 *
 * THE DENOMINATOR IS THE WHOLE DAY, not the part of it that has elapsed. That is what makes
 * the figure climb: at 8am nothing is worked yet so it reads 0, and it rises as the day is
 * lived rather than starting at 100 and eroding.
 */
export function adherenceFor(
  blocks: Block[],
  habits?: HabitTally | null,
): Adherence {
  const counted = blocks.filter((b) => b.state !== "dismissed");
  // An unknown duration cannot be weighed, so it is left out of both sides rather than
  // silently counted as zero hours — which would make the block unearnable.
  const hoursOf = (b: Block) => (b.minutes ?? 0) / 60;

  const totalHours = counted.reduce((sum, b) => sum + hoursOf(b), 0);
  const adheredHours = counted
    .filter((b) => b.state === "adhered")
    .reduce((sum, b) => sum + hoursOf(b), 0);

  const drifted = counted.filter((b) => b.state === "drifted").length;
  const skipped = counted.filter((b) => b.state === "skipped").length;
  const adhered = counted.filter((b) => b.state === "adhered").length;
  const unmarked = counted.filter((b) => b.state == null && b.due).length;

  const habitsScheduled = habits ? Math.max(0, habits.scheduled) : 0;
  const habitsDone = habits
    ? Math.max(0, Math.min(habits.done, habitsScheduled))
    : 0;

  const blockPart = totalHours > 0 ? (adheredHours / totalHours) * BLOCK_SHARE : 0;
  const habitPart =
    habitsScheduled > 0 ? (habitsDone / habitsScheduled) * HABIT_SHARE : 0;

  return {
    pct: Math.round(blockPart + habitPart),
    adheredHours,
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
