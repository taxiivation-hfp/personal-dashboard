import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import { createGoal } from "@/lib/engine";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Create a goal: `{ title, target?, deadline? }`.
 *
 * EVERY GOAL IS A CAREER GOAL since the Health & Career pivot — the engine files it under
 * `portfolio`. A `pillar` field from an older client is IGNORED, not refused, so the form
 * that still sends one keeps working until it is rebuilt.
 *
 * `deadline` is optional: a 'YYYY-MM-DD' date, or null / absent / "" for none.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!b.title || typeof b.title !== "string" || !b.title.trim())
      return Response.json({ error: "title required" }, { status: 400 });
    const deadline =
      b.deadline == null || b.deadline === "" ? null : b.deadline;
    if (deadline !== null && !isISODate(deadline))
      return Response.json(
        { error: "deadline must be a YYYY-MM-DD date" },
        { status: 400 },
      );
    const db = await getDb();
    const id = await createGoal(db, {
      title: b.title,
      target: typeof b.target === "string" ? b.target : null,
      deadline,
      // A COUNTED goal — the owner's ruling, 2026-09-20, replacing the note that stood
      // here: that a count of completed items was an output measure this app no longer
      // scores. What reverses it is that a count is a COMPRESSION OF A CHECKLIST (see
      // goals.ts): 1 of 150 and 150 subgoals with one ticked are the same claim about the
      // same commitment, and the counter is the one that fits on a screen. Absent, the
      // goal is an ordinary subtask goal and nothing here changes.
      targetCount: typeof b.targetCount === "number" ? b.targetCount : null,
      doneCount: typeof b.doneCount === "number" ? b.doneCount : 0,
    });
    // Mutating routes return the refreshed collection, so the client never needs a second
    // round trip to see its own write.
    return Response.json({ id, goals: await listGoals(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
