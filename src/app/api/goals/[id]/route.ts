import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { updateGoal, deleteGoal, isGoalStatus } from "@/lib/engine";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";

async function goalId(ctx: {
  params: Promise<{ id: string }>;
}): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * Edit a goal: any of `{ title, target, status, deadline }`; an absent field is left alone.
 *
 * - `status: "done"` MARKS IT DONE and stamps `completed_at` with today's local date (kept if
 *   it was already done); `status: "active"` returns it to active and clears the stamp.
 *   'paused' and 'dropped' are accepted as before.
 * - `deadline: "YYYY-MM-DD"` sets it; `deadline: null` or `""` CLEARS it.
 *
 * Deliberately no `progress`: it is DERIVED from completed subgoal weights and must never be
 * settable, or the stored column drifts out of step with the subgoals that define it.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = await goalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    if (b.status !== undefined && !isGoalStatus(b.status)) {
      return Response.json({ error: "bad status" }, { status: 400 });
    }
    let deadline: string | null | undefined;
    if (b.deadline !== undefined) {
      deadline = b.deadline === null || b.deadline === "" ? null : b.deadline;
      if (deadline !== null && !isISODate(deadline))
        return Response.json(
          { error: "deadline must be a YYYY-MM-DD date" },
          { status: 400 },
        );
    }
    const db = await getDb();
    await updateGoal(db, id, {
      title: typeof b.title === "string" ? b.title : undefined,
      target: b.target,
      status: b.status,
      deadline,
    });
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = await goalId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    await deleteGoal(db, id);
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
