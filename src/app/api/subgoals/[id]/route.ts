import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { updateSubgoal, setSubgoalDone, deleteSubgoal } from "@/lib/engine";

export const runtime = "nodejs";

async function subgoalId(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await subgoalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const db = await getDb();
    if (b.done !== undefined) await setSubgoalDone(db, id, Boolean(b.done));
    if (b.title !== undefined || b.weight !== undefined) {
      await updateSubgoal(db, id, { title: b.title, weight: b.weight });
    }
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await subgoalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    await deleteSubgoal(db, id);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
