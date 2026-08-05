import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { createSubgoal } from "@/lib/engine";

export const runtime = "nodejs";

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const title = String(b.title ?? "").trim();
    const goalId = Number(b.goal_id);
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    if (!Number.isInteger(goalId) || goalId <= 0) return Response.json({ error: "bad goal_id" }, { status: 400 });
    const db = await getDb();
    // weight 0 = AUTO: an equal share of whatever the explicit overrides leave behind.
    const id = await createSubgoal(db, { goal_id: goalId, title, weight: Number(b.weight ?? 0) });
    return Response.json({ id, goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
