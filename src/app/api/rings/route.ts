import { getDb } from "@/lib/db/client";
import { getRingCounts, getPillarFacts, listGoals } from "@/lib/queries";
import { workoutsOn } from "@/lib/engine";
import {
  buildHealthRing,
  WINDOW_DAYS,
  type PillarRingView,
} from "@/lib/rings";
import { buildCareerRing } from "@/lib/career";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE TWO PILLAR RINGS for the fortnight ending on `?date=` (default today).
 *
 * HEALTH from the database (gym sessions, the ASC.ND habit, steps, the food log) and CAREER
 * from goals. NOTHING HERE READS THE CALENDAR any more: Social's graphite events and the
 * Basil project-hours lap were the only calendar-sourced parts, and both are gone (the old
 * route is parked verbatim in archive/social/). So a Google outage can no longer ghost a
 * ring, and this route costs no Google call.
 *
 * Response:
 *   date      the anchor, 'YYYY-MM-DD'
 *   from      anchor − 13, the window's first day
 *   workouts  the sessions logged ON the anchor day (the Log buttons' state)
 *   facts     { workoutSessions } — gym rows in the window, uncapped
 *   pillars   [HealthRingView, CareerRingView], in PILLAR_ORDER
 *
 * CAREER IS PACED AGAINST THE ANCHOR, the day being viewed — the same rule as the window.
 * Goals themselves are not versioned, so a past day shows today's progress against the pace
 * that day expected. The client can rebuild the same ring from its own goals state with
 * `buildCareerRing(goals, date)`, which is what makes a ticked subtask move the ring
 * without a round trip.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();
    const [counts, workouts, facts, goals] = await Promise.all([
      getRingCounts(db, from, anchor),
      // The part counts are 14-day totals, so they cannot tell the Log buttons what is
      // logged ON the day. One extra lookup rather than a second round trip.
      workoutsOn(db, anchor),
      getPillarFacts(db, from, anchor),
      listGoals(db),
    ]);

    const pillars: PillarRingView[] = [
      buildHealthRing(counts),
      buildCareerRing(goals, anchor),
    ];

    return Response.json({ date: anchor, from, workouts, facts, pillars });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
