import { getDb } from "@/lib/db/client";
import { setGymSession, type WorkoutKind } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

const KINDS = new Set<WorkoutKind>(["strength", "cardio", "misc"]);

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const kind = String(b.kind ?? "") as WorkoutKind;
    if (!KINDS.has(kind)) return Response.json({ error: "bad kind" }, { status: 400 });
    const date = isISODate(b.date) ? b.date : todayISO();
    const db = await getDb();
    await setGymSession(db, date, kind, Boolean(b.on));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
