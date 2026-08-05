import { getDb } from "@/lib/db/client";
import { setDailyCalories } from "@/lib/engine";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isISODate(b.date)) return Response.json({ error: "bad date" }, { status: 400 });
    const raw = b.calories;
    const n = raw == null || raw === "" ? null : Math.round(Number(raw));
    if (n != null && (!Number.isFinite(n) || n < 0 || n > 20000)) {
      return Response.json({ error: "calories must be 0–20000" }, { status: 400 });
    }
    const db = await getDb();
    await setDailyCalories(db, b.date, n);
    return Response.json({ ok: true, calories: n });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
