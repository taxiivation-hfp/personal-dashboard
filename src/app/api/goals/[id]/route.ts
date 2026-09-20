import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import {
  updateGoal,
  deleteGoal,
  setGoalCount,
  isGoalStatus,
} from "@/lib/engine";
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
 * - `count: n` sets a COUNTED goal's tally ABSOLUTELY — never a delta, so a retried tap
 *   cannot advance it twice (engine.setGoalCount). `targetCount` changes how many there
 *   are; null returns the goal to its subtasks.
 *
 * Deliberately no `progress`: it is DERIVED — from the count, or from completed subgoal
 * weights — and must never be settable, or the stored column drifts out of step with the
 * thing that defines it.
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
    let targetCount: number | null | undefined;
    if (b.targetCount !== undefined) {
      targetCount = b.targetCount === null ? null : Number(b.targetCount);
      if (targetCount !== null && !Number.isInteger(targetCount))
        return Response.json(
          { error: "targetCount must be a whole number" },
          { status: 400 },
        );
    }
    if (b.count !== undefined && typeof b.count !== "number")
      return Response.json({ error: "count must be a number" }, { status: 400 });

    const db = await getDb();
    await updateGoal(db, id, {
      title: typeof b.title === "string" ? b.title : undefined,
      target: b.target,
      status: b.status,
      deadline,
      targetCount,
    });
    // AFTER updateGoal, so setting a target and its tally in one request lands the tally
    // against the new target rather than the old one.
    if (typeof b.count === "number") await setGoalCount(db, id, b.count);
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
