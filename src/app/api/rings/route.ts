import { getDb, type Client } from "@/lib/db/client";
import { getRingCounts, getPillarFacts, listGoals } from "@/lib/queries";
import { workoutsOn } from "@/lib/engine";
import { getCalendarRange } from "@/lib/google";
import { buildBlocks, type BlockState } from "@/lib/adherence";
import { CAREER_HOURS_CATEGORY, categoryOf, workedMinutes } from "@/lib/productivity";
import {
  buildHealthRing,
  WINDOW_DAYS,
  type PillarRingView,
} from "@/lib/rings";
import { buildCareerRing, type CareerHours } from "@/lib/career";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The fortnight's Work Projects hours — the hours half of the Career ring (career.ts).
 *
 * The same blocks the hours chart is built from, by the same rule (`workedMinutes`): an
 * adhered block is whole, a drift is its slider fraction, a skip is nothing. Only the one
 * category counts. `resolved` is whether the calendar answered — when it did not, the arc is
 * a ghost and the goals half stands alone, exactly as a Health part with no source does.
 */
async function careerHoursFor(
  db: Client,
  from: string,
  to: string,
): Promise<CareerHours> {
  const [{ byDate, connected }, marks] = await Promise.all([
    getCalendarRange(from, to),
    db.execute({
      sql: "SELECT date,event_id,state,worked_fraction FROM block_marks WHERE date BETWEEN ? AND ?",
      args: [from, to],
    }),
  ]);
  if (!connected) return { hours: 0, resolved: false };

  const marksByDate = new Map<
    string,
    Map<string, { state: BlockState; reason: null; workedFraction: number | null }>
  >();
  for (const r of marks.rows) {
    const d = String(r.date);
    if (!marksByDate.has(d)) marksByDate.set(d, new Map());
    marksByDate.get(d)!.set(String(r.event_id), {
      state: String(r.state) as BlockState,
      reason: null,
      workedFraction:
        r.worked_fraction == null ? null : Number(r.worked_fraction),
    });
  }

  let minutes = 0;
  for (const [d, events] of byDate) {
    for (const b of buildBlocks(d, events, marksByDate.get(d) ?? new Map())) {
      if (categoryOf(b.colorId) !== CAREER_HOURS_CATEGORY) continue;
      minutes += workedMinutes({
        minutes: b.minutes ?? 0,
        colorId: b.colorId,
        state: b.state,
        workedFraction: b.workedFraction,
      });
    }
  }
  return { hours: minutes / 60, resolved: true };
}

/**
 * THE TWO PILLAR RINGS for the fortnight ending on `?date=` (default today).
 *
 * HEALTH from the database (gym sessions, the ASC.ND habit, steps, the food log). CAREER
 * from the calendar's Work Projects hours and from goals (career.ts). The calendar read is
 * the cached fortnight Today already pulls, so it costs no extra Google call on a page load,
 * and a Google outage ghosts only the hours arc — never a Health part.
 *
 * Response:
 *   date      the anchor, 'YYYY-MM-DD'
 *   from      anchor − 13, the window's first day
 *   workouts  the sessions logged ON the anchor day (the Log buttons' state)
 *   facts     { workoutSessions } — gym rows in the window, uncapped
 *   hours     { hours, resolved } — the Career hours half's input
 *   pillars   [HealthRingView, CareerRingView], in PILLAR_ORDER
 *
 * CAREER IS JUDGED AGAINST THE ANCHOR, the day being viewed — the same rule as the window.
 * The client rebuilds the same ring from its own goals state with
 * `buildCareerRing(goals, date, hours)`, which is what makes a ticked subtask move the ring
 * without a round trip.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();
    const [counts, workouts, facts, goals, hours] = await Promise.all([
      getRingCounts(db, from, anchor),
      // The part counts are 14-day totals, so they cannot tell the Log buttons what is
      // logged ON the day. One extra lookup rather than a second round trip.
      workoutsOn(db, anchor),
      getPillarFacts(db, from, anchor),
      listGoals(db),
      careerHoursFor(db, from, anchor),
    ]);

    const pillars: PillarRingView[] = [
      buildHealthRing(counts),
      buildCareerRing(goals, anchor, hours),
    ];

    return Response.json({ date: anchor, from, workouts, facts, hours, pillars });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
