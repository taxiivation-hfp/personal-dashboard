import { getDb } from "@/lib/db/client";
import { recentWorkouts, type WorkoutKind } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<WorkoutKind>(["strength", "cardio", "misc"]);

/** The last few sessions of a kind, for the history pane beside the one being written. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = String(url.searchParams.get("kind") ?? "") as WorkoutKind;
    if (!KINDS.has(kind))
      return Response.json({ error: "bad kind" }, { status: 400 });
    const raw = url.searchParams.get("before");
    const before = isISODate(raw) ? raw : todayISO();
    const limit = Number(url.searchParams.get("limit") ?? 5);

    const db = await getDb();
    return Response.json({
      recent: await recentWorkouts(db, kind, before, limit),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
