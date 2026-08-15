import { getDb } from "@/lib/db/client";
import { allSkillSessions } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * EVERY skill session, newest first — the counterpart to /api/gym/history.
 *
 * Unpaginated for the same reason that one is: a session is text, and years of it is smaller
 * than one screenshot. Paginating would add a control, a state and an off-by-one for a
 * saving nobody would notice — and /sessions searches in memory, which only works because
 * the whole log is already there.
 *
 * Its own route rather than a `kind=skill` on the gym one: these are different tables with
 * different columns, and a single endpoint switching on a query parameter would be two
 * queries wearing one name.
 */
export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ sessions: await allSkillSessions(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
