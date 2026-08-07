import { getDb } from "@/lib/db/client";
import { getCalendarRange } from "@/lib/google";
import { adherenceFor, buildBlocks, type BlockState } from "@/lib/adherence";
import {
  habitTallyFor,
  dayTitlesBetween,
} from "@/lib/queries";
import { weekdayBit } from "@/lib/engine";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { scoreDay } from "@/lib/productivity";

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
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") ?? 7), 1),
      62,
    );

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
    // `connected` is load-bearing for the productivity score below — do not discard it.
    const { byDate, connected } = await getCalendarRange(start, end);

    const markRows = await db.execute({
      sql: "SELECT date,event_id,state,reason FROM block_marks WHERE date BETWEEN ? AND ?",
      args: [start, end],
    });
    const marksByDate = new Map<
      string,
      Map<string, { state: BlockState; reason: string | null }>
    >();
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
    const habitRows = await db.execute(
      "SELECT id, days_mask FROM habits WHERE active=1",
    );
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

    // What the owner intends each day to be. Carried on the strip so the days ahead can be
    // named in advance, which is the whole point of an intention.
    const titles = await dayTitlesBetween(db, start, end);

    const today = todayISO();
    const nowMs = Date.now();
    const out = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(start, i);
      const blocks = buildBlocks(
        d,
        byDate.get(d) ?? [],
        marksByDate.get(d) ?? new Map(),
      );

      const bit = weekdayBit(d);
      const scheduled = activeHabits.filter((h) => (h.mask & bit) !== 0);
      const ticked = ticksByDate.get(d) ?? new Set<number>();
      const habitsDone = scheduled.filter((h) => ticked.has(h.id)).length;
      const tally = habitTallyFor(d, scheduled.length, habitsDone);

      /**
       * The productivity score — hours SPENT, never results produced. See CLAUDE.md's
       * Productivity section; it is a deliberate, quarantined exception.
       *
       * Assembled HERE and deliberately never added to DayView. The coach reads
       * getDayView and block_marks, so keeping the score off DayView makes it
       * structurally invisible to the coach rather than merely discouraged by a prompt.
       *
       * null when the calendar is unreachable, and that gate matters: without it a day
       * would still report a number built from its non-negotiables while every scheduled
       * hour silently counted as zero — a wrong number rather than an absent one.
       *
       * Gym sessions are NOT read here any more. A workout scores as a Grape block in the
       * calendar; paying for the logged row as well would be the same hour counted twice.
       */
      const productivity = connected
        ? scoreDay({
            blocks: blocks.map((b) => ({
              minutes: b.minutes ?? 0,
              colorId: b.colorId,
              state: b.state,
            })),
            habitsDone,
          })
        : null;

      out.push({
        date: d,
        isToday: d === today,
        isFuture: d > today,
        ...adherenceFor(blocks, tally),
        productivity,
        title: titles.get(d) ?? null,
        // A compact summary so the calendar column can show what the day actually
        // held, not just a percentage — enough to read the pattern at a glance.
        //
        // `colorId` travels so each event can carry its projected accent; `minutes`
        // deliberately does NOT. The column shows the allocated span as written and never
        // a duration, and the surest way to keep it that way is not to send one.
        blocks: blocks
          .filter((b) => b.state !== "dismissed")
          .map((b) => ({
            time: b.time_start,
            timeEnd: b.time_end,
            title: b.title,
            state: b.state,
            colorId: b.colorId,
          })),
      });
    }
    return Response.json({ days: out });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
