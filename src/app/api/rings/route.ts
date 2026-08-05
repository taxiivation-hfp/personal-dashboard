import { getDb } from "@/lib/db/client";
import { getRingCounts, getObservedDays } from "@/lib/queries";
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
    const [counts, observedDays, gym] = await Promise.all([
      getRingCounts(db, from, anchor),
      getObservedDays(db, anchor),
      // The gym metric is a 14-day count, so it cannot tell the toggle whether TODAY is
      // logged. One extra row lookup rather than a second round trip from the client.
      db.execute({ sql: "SELECT 1 FROM gym_sessions WHERE date=? LIMIT 1", args: [anchor] }),
    ]);

    return Response.json({
      date: anchor,
      from,
      observedDays,
      gymToday: gym.rows.length > 0,
      pillars: buildRings(counts, observedDays),
    });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
