import { getDb } from "@/lib/db/client";
import { getCalendarRange } from "@/lib/google";
import { adherenceFor, buildBlocks, type BlockState } from "@/lib/adherence";
import { habitTallyFor } from "@/lib/queries";
import { weekdayBit } from "@/lib/engine";
import { addDays, isISODate, todayISO } from "@/lib/dates";
import { hoursForDay } from "@/lib/productivity";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Adherence per day over a window — the tracker on Today, the record's adherence chart and
 * its hours-by-category chart.
 *
 * Computed from calendar events + marks, NOT from marks alone. Marks-only would
 * silently inflate history: a past day with three blocks where one was marked adhered
 * would read 100%, because the two never marked wouldn't be in the denominator.
 *
 * Each day: { date, isToday, isFuture, ...Adherence, hours, blocks }. `hours` is the day's
 * HOURS WORKED BY CATEGORY (productivity.ts) — minutes, never points; the score is gone.
 * Graphite events never reach any of it: buildBlocks drops them.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    // 366, not 62. /stats asks for a year, and the ceiling is what stops a stray query
    // walking the whole table. The calendar is fetched as ONE ranged request whatever the
    // span, so a long window costs a longer loop rather than more API calls.
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") ?? 7), 1),
      366,
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
    // `connected` is load-bearing for the hours below — do not discard it.
    const { byDate, connected } = await getCalendarRange(start, end);

    const markRows = await db.execute({
      sql: "SELECT date,event_id,state,reason,worked_fraction FROM block_marks WHERE date BETWEEN ? AND ?",
      args: [start, end],
    });
    const marksByDate = new Map<
      string,
      Map<
        string,
        { state: BlockState; reason: string | null; workedFraction: number | null }
      >
    >();
    for (const r of markRows.rows) {
      const d = String(r.date);
      if (!marksByDate.has(d)) marksByDate.set(d, new Map());
      marksByDate.get(d)!.set(String(r.event_id), {
        state: String(r.state) as BlockState,
        reason: r.reason == null ? null : String(r.reason),
        workedFraction:
          r.worked_fraction == null ? null : Number(r.worked_fraction),
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

    // One-off non-negotiables join their day's tally — the same items getDayView counts,
    // read here too so the strip and the hero can never disagree about a day.
    const oneOffRows = await db.execute({
      sql: "SELECT date, done FROM one_off_habits WHERE date BETWEEN ? AND ?",
      args: [start, end],
    });
    const oneOffsByDate = new Map<string, { scheduled: number; done: number }>();
    for (const r of oneOffRows.rows) {
      const d = String(r.date);
      const cur = oneOffsByDate.get(d) ?? { scheduled: 0, done: 0 };
      cur.scheduled++;
      if (Number(r.done)) cur.done++;
      oneOffsByDate.set(d, cur);
    }

    // NO day titles here. The strip used to carry them so the days ahead could be named
    // inline; it ends on today now and names none of them, so the query lost its consumer —
    // and this route is fetched four times a page load (Today, CalendarColumn, Stats,
    // StatsLink). getDayView still reads the viewed day's own title, which is where the one
    // title this app still shows comes from.

    // Calories per day, for the calorie floor's share of adherence. One ranged query rather
    // than one per day. SUM is an aggregate, so libSQL hands it back as a BigInt — Number()
    // at the boundary, as everywhere else.
    const calRows = await db.execute({
      sql: "SELECT date, SUM(kcal) AS total FROM calorie_entries WHERE date BETWEEN ? AND ? GROUP BY date",
      args: [start, end],
    });
    const calByDate = new Map<string, number>();
    for (const r of calRows.rows) calByDate.set(String(r.date), Number(r.total));

    // Steps per day, for the same floor share. `steps IS NOT NULL` because a sleep-only
    // push writes a row with no count, and a day the phone never measured must reach
    // adherenceFor as null — nobody was asked — rather than as a zero nobody said.
    const stepRows = await db.execute({
      sql: "SELECT date, steps FROM health_logs WHERE date BETWEEN ? AND ? AND steps IS NOT NULL",
      args: [start, end],
    });
    const stepsByDate = new Map<string, number>();
    for (const r of stepRows.rows)
      stepsByDate.set(String(r.date), Number(r.steps));

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
      const oo = oneOffsByDate.get(d) ?? { scheduled: 0, done: 0 };
      const tally = habitTallyFor(
        d,
        scheduled.length + oo.scheduled,
        habitsDone + oo.done,
      );

      /**
       * HOURS WORKED, BY CATEGORY — minutes, never points (the score is gone, 2026-09-18).
       * The same function /api/productivity's per-day breakdown calls, so the chart and the
       * workings it opens cannot disagree about a day.
       *
       * Never added to DayView: it answers "where did the hours go", which is the record's
       * question, not the day's.
       *
       * null when the calendar is unreachable, and that gate matters: an outage must read as
       * "no data", not as a day in which nothing was worked.
       */
      const hours = connected
        ? hoursForDay(
            blocks.map((b) => ({
              minutes: b.minutes ?? 0,
              colorId: b.colorId,
              state: b.state,
              workedFraction: b.workedFraction,
            })),
          )
        : null;

      out.push({
        date: d,
        isToday: d === today,
        isFuture: d > today,
        // The floors read here are UNGATED by calendar connectivity, unlike the hours
        // below: food logged is food logged whatever Google is doing, and adherence must
        // not lose two shares to someone else's outage.
        ...adherenceFor(blocks, tally, {
          steps: stepsByDate.get(d) ?? null,
          calories: calByDate.get(d) ?? null,
        }),
        hours,
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
