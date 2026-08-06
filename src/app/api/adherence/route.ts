import { getDb } from "@/lib/db/client";
import { getCalendarRange } from "@/lib/google";
import { adherenceFor, buildBlocks, type BlockState } from "@/lib/adherence";
import { getAdherenceConfig, habitTallyFor } from "@/lib/queries";
import { weekdayBit } from "@/lib/engine";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The 7-day strip.
 *
 * Computed from calendar events + marks, NOT from marks alone. Marks-only would
 * silently inflate history: a past day with three blocks where one was marked adhered
 * would read 100%, because the two never marked wouldn't be in the denominator.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const days = Math.min(Math.max(Number(url.searchParams.get("days") ?? 7), 1), 62);

    // `center` puts a given day in the MIDDLE of the window — past to its left,
    // upcoming to its right. `to` keeps the old end-anchored behaviour for the
    // calendar column, which looks backwards.
    const center = url.searchParams.get("center");
    const to = url.searchParams.get("to");
    let start: string;
    let end: string;
    if (isISODate(center)) {
      const before = Math.floor((days - 1) / 2);
      start = addDays(center, -before);
      end = addDays(start, days - 1);
    } else {
      end = isISODate(to) ? to : todayISO();
      start = addDays(end, -(days - 1));
    }

    const db = await getDb();
    const { byDate } = await getCalendarRange(start, end);

    const markRows = await db.execute({
      sql: "SELECT date,event_id,state,reason FROM block_marks WHERE date BETWEEN ? AND ?",
      args: [start, end],
    });
    const marksByDate = new Map<string, Map<string, { state: BlockState; reason: string | null }>>();
    for (const r of markRows.rows) {
      const d = String(r.date);
      if (!marksByDate.has(d)) marksByDate.set(d, new Map());
      marksByDate.get(d)!.set(String(r.event_id), {
        state: String(r.state) as BlockState,
        reason: r.reason == null ? null : String(r.reason),
      });
    }

    // Non-negotiables now count toward each day's rate, so the strip and the calendar
    // column need the same tally the Today screen uses. Habit config is read as it is
    // NOW — the schedule is not versioned, which the start stamp bounds the effect of.
    const cfg = await getAdherenceConfig(db);
    const habitRows = await db.execute("SELECT id, days_mask FROM habits WHERE active=1");
    const activeHabits = habitRows.rows.map((r) => ({
      id: Number(r.id),
      mask: Number(r.days_mask),
    }));
    const tickRows = await db.execute({
      sql: "SELECT habit_id, date FROM habit_entries WHERE date BETWEEN ? AND ? AND value > 0",
      args: [start, end],
    });
    const ticksByDate = new Map<string, Set<number>>();
    for (const r of tickRows.rows) {
      const d = String(r.date);
      if (!ticksByDate.has(d)) ticksByDate.set(d, new Set());
      ticksByDate.get(d)!.add(Number(r.habit_id));
    }

    const today = todayISO();
    const nowMs = Date.now();
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const blocks = buildBlocks(d, byDate.get(d) ?? [], marksByDate.get(d) ?? new Map());

      const bit = weekdayBit(d);
      const scheduled = activeHabits.filter((h) => (h.mask & bit) !== 0);
      const ticked = ticksByDate.get(d) ?? new Set<number>();
      const tally = habitTallyFor(
        d,
        scheduled.length,
        scheduled.filter((h) => ticked.has(h.id)).length,
        cfg,
        nowMs,
        today
      );

      out.push({
        date: d,
        isToday: d === today,
        isFuture: d > today,
        ...adherenceFor(blocks, tally),
        // A compact summary so the calendar column can show what the day actually
        // held, not just a percentage — enough to read the pattern at a glance.
        blocks: blocks
          .filter((b) => b.state !== "dismissed")
          .map((b) => ({ time: b.time_start, timeEnd: b.time_end, title: b.title, state: b.state })),
      });
    }
    return Response.json({ days: out });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
