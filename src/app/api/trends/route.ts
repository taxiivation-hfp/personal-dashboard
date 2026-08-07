import { getDb } from "@/lib/db/client";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Weight and calories, day by day.
 *
 * TWO SERIES OF FACTS, and deliberately nothing else. No average, no delta, no target
 * line, no seven-day smoothing — every one of those is a judgement about the number, and
 * this app scores adherence, not the body it belongs to. The chart's whole job is to let
 * the owner see their own record.
 *
 * A day with no entry is `null`, never 0. A morning that went unweighed is not a morning
 * that weighed nothing, and a day with no food logged is not a fast; drawing either as
 * zero would invent a reading that was never taken.
 */

/** The weight non-negotiable is found by system_key — the owner can rename it. */
const WEIGHT_KEY = "weight";

/** How far back the chart may look. 366 keeps a full year reachable and stops a stray
 *  query asking for the whole table. */
const MAX_DAYS = 366;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("to");
    // Validated before addDays, which throws RangeError on malformed input — the same
    // guard /api/adherence and /api/rings use.
    const to = isISODate(raw) ? raw : todayISO();
    const days = Math.min(
      Math.max(Number(url.searchParams.get("days") ?? 30), 2),
      MAX_DAYS,
    );
    const from = addDays(to, -(days - 1));

    const db = await getDb();

    const weightRows = await db.execute({
      sql: `SELECT e.date AS date, e.value AS value
              FROM habit_entries e
              JOIN habits h ON h.id = e.habit_id
             WHERE h.system_key = ? AND e.date BETWEEN ? AND ?`,
      args: [WEIGHT_KEY, from, to],
    });
    const weightBy = new Map<string, number>();
    for (const r of weightRows.rows)
      if (r.value != null) weightBy.set(String(r.date), Number(r.value));

    // SUM is an aggregate, so libSQL hands it back as a BigInt — Number() at the boundary,
    // as everywhere else in this codebase.
    const calRows = await db.execute({
      sql: `SELECT date, SUM(kcal) AS total
              FROM calorie_entries
             WHERE date BETWEEN ? AND ?
             GROUP BY date`,
      args: [from, to],
    });
    const calBy = new Map<string, number>();
    for (const r of calRows.rows) calBy.set(String(r.date), Number(r.total));

    // Every day in the window is emitted, present or not, so the chart's x-axis is time
    // rather than "the days that happened to have data" — a gap has to look like a gap.
    const series = [];
    for (let i = 0; i < days; i++) {
      const d = addDays(from, i);
      series.push({
        date: d,
        weight: weightBy.get(d) ?? null,
        calories: calBy.get(d) ?? null,
      });
    }

    return Response.json({ from, to, days, series });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
