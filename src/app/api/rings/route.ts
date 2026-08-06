import { getDb } from "@/lib/db/client";
import { getRingCounts, getObservedDays } from "@/lib/queries";
import { workoutsOn } from "@/lib/engine";
import { buildRings, WINDOW_DAYS } from "@/lib/rings";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    // Validated before it reaches addDays, which throws RangeError on malformed input.
    // Same guard pattern as /api/adherence.
    const anchor = isISODate(raw) ? raw : todayISO();
    const from = addDays(anchor, -(WINDOW_DAYS - 1));

    const db = await getDb();
    const [counts, observedDays, workouts] = await Promise.all([
      getRingCounts(db, from, anchor),
      getObservedDays(db, anchor),
      // The workout metrics are 14-day counts, so they cannot tell the toggles what is
      // logged TODAY. One extra lookup rather than a second round trip from the client.
      workoutsOn(db, anchor),
    ]);

    return Response.json({
      date: anchor,
      from,
      observedDays,
      workouts,
      pillars: buildRings(counts, observedDays),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
