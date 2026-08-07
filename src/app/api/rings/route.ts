import { getDb } from "@/lib/db/client";
import { getRingCounts, getObservedDays, getPillarFacts } from "@/lib/queries";
import { workoutsOn } from "@/lib/engine";
import { getCalendarRange } from "@/lib/google";
import { buildRings, WINDOW_DAYS } from "@/lib/rings";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * Graphite. The owner's convention for a social event in the calendar — Church, a night
 * out — so they count toward Social without being logged a second time by hand.
 *
 * One colour, named once. If this ever becomes two, it belongs in a table like
 * CALENDAR_RATES rather than growing a second constant here.
 */
const SOCIAL_COLOR_ID = "8";

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    // Same guard pattern as /api/adherence.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();

    // Social events live only in Google, so they are counted here and handed to
    // getRingCounts rather than queried. `connected` matters: on a calendar failure the
    // count is left UNDEFINED, which resolves to an unresolved source and draws a ghost —
    // a zero would say the fortnight held no social events, which is a different and
    // possibly false claim.
    const cal = await getCalendarRange(from, anchor);
    let socialEvents: number | undefined;
    if (cal.connected) {
      socialEvents = 0;
      for (const events of cal.byDate.values()) {
        socialEvents += events.filter((e) => e.colorId === SOCIAL_COLOR_ID).length;
      }
    }

    const [counts, observedDays, workouts, facts] = await Promise.all([
      getRingCounts(db, from, anchor, { social_events: socialEvents }),
      getObservedDays(db, anchor),
      // The workout metrics are 14-day counts, so they cannot tell the toggles what is
      // logged TODAY. One extra lookup rather than a second round trip from the client.
      workoutsOn(db, anchor),
      getPillarFacts(db, from, anchor),
    ]);

    return Response.json({
      date: anchor,
      from,
      observedDays,
      workouts,
      // The plain-words fortnight printed under each pillar's name. socialEvents rides
      // along from the calendar count above rather than being re-derived — and stays
      // UNDEFINED on a Google failure, so the caption can say "events unavailable" rather
      // than claim a zero.
      facts: { ...facts, socialEvents },
      pillars: buildRings(counts, observedDays),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
