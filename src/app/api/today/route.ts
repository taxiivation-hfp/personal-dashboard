import { getDb } from "@/lib/db/client";
import { getDayView } from "@/lib/queries";
import { getCalendarForDate } from "@/lib/google";
import { todayISO, isISODate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    const db = await getDb();
    const date = new URL(req.url).searchParams.get("date");
    const d = isISODate(date) ? date : todayISO();
    // Blocks come from the real calendar — the app never invents them.
    const cal = await getCalendarForDate(d);
    return Response.json(await getDayView(db, d, cal.events, cal.connected));
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
