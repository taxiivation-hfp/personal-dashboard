import { getDb } from "@/lib/db/client";
import { allWorkouts, type WorkoutKind } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

const KINDS = new Set<WorkoutKind>(["strength", "cardio", "misc"]);

/**
 * EVERY session, newest first. The whole log.
 *
 * Deliberately unpaginated — a workout log is text, and a few hundred rows of it after years
 * is smaller than one screenshot. Paginating would add a control, a state and an off-by-one
 * for a saving nobody would notice.
 *
 * `kind` narrows it; anything unrecognised is ignored rather than rejected, because a bad
 * filter should show you everything rather than an error page.
 */
export async function GET(req: Request) {
  try {
    const raw = String(new URL(req.url).searchParams.get("kind") ?? "");
    const kind = KINDS.has(raw as WorkoutKind)
      ? (raw as WorkoutKind)
      : undefined;

    const db = await getDb();
    return Response.json({ sessions: await allWorkouts(db, kind) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
