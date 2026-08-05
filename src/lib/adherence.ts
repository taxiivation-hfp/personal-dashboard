import type { CalEvent } from "./google";
import { APP_TZ } from "./dates";

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
};

const localDateTime = (iso: string): number => new Date(iso).getTime();

/** Has this event finished, as of `nowMs`? All-day events settle at end of day. */
function isDue(ev: CalEvent, dateISO: string, nowMs: number): boolean {
  if (ev.allDay) {
    const endOfDay = new Date(`${dateISO}T23:59:59`).getTime();
    return nowMs > endOfDay;
  }
  const end = ev.end ? localDateTime(ev.end) : ev.start ? localDateTime(ev.start) : null;
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

/** Merge live calendar events with stored marks into the day's block list. */
export function buildBlocks(
  dateISO: string,
  events: CalEvent[],
  marks: Map<string, { state: BlockState; reason: string | null }>,
  nowMs = Date.now()
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
      };
    });
}

export function adherenceFor(blocks: Block[]): Adherence {
  const counted = blocks.filter((b) => b.state !== "dismissed" && b.due);
  const adhered = counted.filter((b) => b.state === "adhered").length;
  const drifted = counted.filter((b) => b.state === "drifted").length;
  const skipped = counted.filter((b) => b.state === "skipped").length;
  const unmarked = counted.filter((b) => b.state == null).length;
  return {
    // null, not 0 — "nothing has come due yet" must not render as a 0% failure.
    pct: counted.length ? Math.round((adhered / counted.length) * 100) : null,
    adhered,
    drifted,
    skipped,
    unmarked,
    due: counted.length,
  };
}
