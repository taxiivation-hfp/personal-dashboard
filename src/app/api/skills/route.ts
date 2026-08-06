import { getDb } from "@/lib/db/client";
import { listSkills } from "@/lib/queries";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // The 14-day figures are anchored to the date being VIEWED, so the caller passes it.
    const raw = new URL(req.url).searchParams.get("date");
    const db = await getDb();
    return Response.json({
      skills: await listSkills(db, isISODate(raw) ? raw : todayISO()),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
