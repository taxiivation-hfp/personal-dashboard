import { getDb } from "@/lib/db/client";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The day's step count and the age of it — the ONE read the screen makes when it comes
 * back from somewhere else.
 *
 * Why this is not a GET on /api/health. That path is in proxy.ts's MACHINE_ROUTES, which
 * exempts it from the session cookie entirely so a Shortcut can POST with a shared secret
 * instead. A GET hung off the same path would inherit that exemption and serve the
 * owner's health record to anyone who asked. The exemption is an exact-path match, so a
 * SIBLING path is private by default — which is the property proxy.ts's comment says the
 * explicit list exists to give. The POST is untouched; this only adds.
 *
 * It is deliberately tiny. Today already carries steps in its DayView, but re-reading
 * that means re-reading the Google Calendar for the day, and this fires every time the
 * app is brought back to the front — including the several times an hour it is brought
 * back for reasons that have nothing to do with steps.
 */
export async function GET(req: Request) {
  try {
    const raw = new URL(req.url).searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();

    const db = await getDb();
    const r = await db.execute({
      sql: "SELECT steps, updated_at FROM health_logs WHERE date=?",
      args: [date],
    });

    const row = r.rows[0];
    // steps null and updatedAt null together, always: a row written by some other push
    // has a timestamp that says nothing about a step count, and dating a figure that does
    // not exist is the one thing a staleness label must never do.
    //
    // It cannot go further than that. `updated_at` stamps the ROW, and the POST bumps it
    // for whichever field arrived — so this is the count's own age only for as long as the
    // steps Shortcut is the table's single writer, which today it is. See the same note in
    // queries.ts's getDayView, and the `steps_updated_at` column that would settle it.
    const steps = row && row.steps != null ? Number(row.steps) : null;
    return Response.json({
      date,
      steps,
      updatedAt: steps == null ? null : String(row!.updated_at),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
