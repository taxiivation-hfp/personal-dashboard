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
  /** 0-100, or null when nothing is due yet — which is NOT the same as 0%. */
  pct: number | null;
  adhered: number;
  drifted: number;
  skipped: number;
  /** Due but not yet marked. These count against pct and are the call to action. */
  unmarked: number;
  due: number;
  /** Scheduled non-negotiables not yet in the denominator, so the UI can say so rather
   *  than leaving the number looking unexplained. 0 once the cutoff passes. */
  habitsPending: number;
};

/**
 * The day's non-negotiable tally.
 *
 * `scheduled` is how many applied that weekday; `done` how many were ticked. When `due`
 * is false only `done` counts — see habitsDueOn.
 */
export type HabitTally = { due: boolean; scheduled: number; done: number };

/**
 * Have the day's non-negotiables had their chance?
 *
 * A block becomes due when its end time passes. A habit has no end time, so it becomes
 * due at an evening cutoff. Before that an UNTICKED habit is not in the denominator at
 * all — not missed, not pending — which preserves the rule that the number must not look
 * bad at lunchtime for no reason.
 *
 * Pure: the caller computes the cutoff instant (rfc3339(date, '21:00', APP_TZ)), so this
 * needs no timezone machinery and is trivially testable.
 */
export function habitsDueOn(
  dateISO: string,
  todayISO: string,
  nowMs: number,
  cutoffInstantMs: number,
): boolean {
  if (dateISO < todayISO) return true; // the day is over
  if (dateISO > todayISO) return false; // hasn't happened
  return nowMs >= cutoffInstantMs;
}

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
 * The day's rate over BLOCKS AND NON-NEGOTIABLES, weighted equally — one item is one
 * item. A 15-minute habit and a 3-hour block count the same, which is the same logic that
 * makes working a block badly identical to working it brilliantly.
 *
 * `habits` omitted (or null) = blocks only. That is how days before
 * app_meta['adherence_habits_since'] stay exactly as they were lived: counting habits
 * retroactively would hold four untouched non-negotiables against every past day.
 *
 * Before the cutoff the rate is deliberately OPTIMISTIC — a ticked habit counts in both
 * numerator and denominator, an unticked one is in neither. Ticking has to visibly do
 * something or tap-as-you-go becomes pointless until 21:00, and that outranks tidiness.
 * The number settles when the cutoff passes and the rest join the denominator.
 */
export function adherenceFor(
  blocks: Block[],
  habits?: HabitTally | null,
): Adherence {
  const counted = blocks.filter((b) => b.state !== "dismissed" && b.due);
  const drifted = counted.filter((b) => b.state === "drifted").length;
  const skipped = counted.filter((b) => b.state === "skipped").length;

  let adhered = counted.filter((b) => b.state === "adhered").length;
  let unmarked = counted.filter((b) => b.state == null).length;
  let due = counted.length;
  let habitsPending = 0;

  if (habits) {
    const done = Math.max(0, Math.min(habits.done, habits.scheduled));
    adhered += done;
    if (habits.due) {
      due += habits.scheduled;
      unmarked += habits.scheduled - done;
    } else {
      // Only the ticked ones are in play; the rest have not had their chance.
      due += done;
      habitsPending = habits.scheduled - done;
    }
  }

  return {
    // null, not 0 — "nothing has come due yet" must not render as a 0% failure.
    pct: due ? Math.round((adhered / due) * 100) : null,
    adhered,
    drifted,
    skipped,
    unmarked,
    due,
    habitsPending,
  };
}
