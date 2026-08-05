import { getDb } from "@/lib/db/client";
import { setGymSession } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const date = isISODate(b.date) ? b.date : todayISO();
    const db = await getDb();
    await setGymSession(db, date, Boolean(b.on));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
