import { getDb } from "@/lib/db/client";
import { saveWorkout, deleteWorkout, workoutsOn, type WorkoutKind } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

const KINDS = new Set<WorkoutKind>(["strength", "cardio", "misc"]);
const MAX_NOTE = 20000;

/** Saving IS logging — there is no separate "did it" toggle to forget. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const kind = String(b.kind ?? "") as WorkoutKind;
    if (!KINDS.has(kind)) return Response.json({ error: "bad kind" }, { status: 400 });
    const note = String(b.note ?? "");
    if (note.length > MAX_NOTE) return Response.json({ error: "note too long" }, { status: 413 });
    const date = isISODate(b.date) ? b.date : todayISO();

    const db = await getDb();
    await saveWorkout(db, date, kind, note);
    return Response.json({ workouts: await workoutsOn(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const kind = String(url.searchParams.get("kind") ?? "") as WorkoutKind;
    if (!KINDS.has(kind)) return Response.json({ error: "bad kind" }, { status: 400 });
    const raw = url.searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();

    const db = await getDb();
    await deleteWorkout(db, date, kind);
    return Response.json({ workouts: await workoutsOn(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
