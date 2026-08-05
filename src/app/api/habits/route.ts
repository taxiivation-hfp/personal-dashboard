import { getDb } from "@/lib/db/client";
import { createHabit, updateHabit, deleteHabit } from "@/lib/engine";
import { allHabits } from "@/lib/queries";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ habits: await allHabits(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    if (!name) return Response.json({ error: "name required" }, { status: 400 });
    const db = await getDb();
    const id = await createHabit(db, { name, days_mask: Number(b.days_mask ?? 127) });
    return Response.json({ id });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const b = await req.json();
    const id = Number(b.id);
    if (!Number.isInteger(id) || id <= 0) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    // Soft delete only — habit_entries reference habit_id, so a hard delete would
    // orphan real ticks from days that already happened.
    if (b.remove) await deleteHabit(db, id);
    else
      await updateHabit(db, id, {
        name: b.name !== undefined ? String(b.name) : undefined,
        days_mask: b.days_mask !== undefined ? Number(b.days_mask) : undefined,
      });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
