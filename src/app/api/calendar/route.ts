import { getCalendarForDate } from "@/lib/google";
import { todayISO, isISODate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  const date = new URL(req.url).searchParams.get("date");
  const d = isISODate(date) ? date : todayISO();
  try {
    return Response.json(await getCalendarForDate(d));
  } catch (e) {
    // Degrade gracefully — the UI just shows nothing rather than erroring.
    return Response.json({
      connected: false,
      configured: true,
      events: [],
      error: e instanceof Error ? e.message : String(e),
    });
  }
}
