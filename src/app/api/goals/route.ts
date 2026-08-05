import { getDb } from "@/lib/db/client";
import { listGoals, pillarMaps } from "@/lib/queries";
import { createGoal } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function POST(req: Request) {
  try {
    const db = await getDb();
    const b = await req.json();
    if (!b.title || typeof b.title !== "string") return Response.json({ error: "title required" }, { status: 400 });
    // Resolved by KEY, never by a positional id — the seeded ids happen to be 1/2/3 today
    // and relying on that would break the moment a pillar is added or reordered.
    const { byKey } = await pillarMaps(db);
    const pid = byKey.get(String(b.pillar));
    if (pid == null) return Response.json({ error: `unknown pillar '${b.pillar}'` }, { status: 400 });
    const id = await createGoal(db, {
      pillar_id: pid,
      title: b.title.trim(),
      // No target_count: goal progress comes from completed subgoal weights. Deriving it
      // from a count of completed items was an output measure, which this app no longer
      // scores.
      target: b.target ?? null,
    });
    // Mutating routes return the refreshed collection, so the client never needs a second
    // round trip to see its own write.
    return Response.json({ id, goals: await listGoals(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
