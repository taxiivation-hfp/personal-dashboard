import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { updateGoal, deleteGoal } from "@/lib/engine";

export const runtime = "nodejs";

const STATUSES = new Set(["active", "done", "paused", "dropped"]);

async function goalId(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function PATCH(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await goalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    if (b.status !== undefined && !STATUSES.has(String(b.status))) {
      return Response.json({ error: "bad status" }, { status: 400 });
    }
    const db = await getDb();
    // Deliberately no `progress`: it is DERIVED from completed subgoal weights and must
    // never be settable, or the stored column drifts out of step with the subgoals that
    // define it — which is exactly what happened before.
    await updateGoal(db, id, { title: b.title, target: b.target, status: b.status });
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await goalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    await deleteGoal(db, id);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
