import { getDb } from "@/lib/db/client";
import { setHabit } from "@/lib/engine";
import { todayISO, isISODate } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * Binary tick. Addressed by habit_id, not by name — the owner can now rename their
 * non-negotiables, and a name-keyed write would silently stop matching after a rename.
 */
export async function POST(req: Request) {
  try {
    const db = await getDb();
    const b = await req.json();
    const id = Number(b.habit_id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "habit_id required" }, { status: 400 });
    const date = isISODate(b.date) ? b.date : todayISO();
    await setHabit(db, id, date, b.done === undefined ? true : Boolean(b.done));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
