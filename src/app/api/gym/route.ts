import { getDb } from "@/lib/db/client";
import { saveWorkout, deleteWorkout, workoutsOn, type WorkoutKind } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

const KINDS = new Set<WorkoutKind>(["strength", "cardio", "misc"]);
const MAX_NOTE = 20000;

/** A row id off the wire. Rejects 0, negatives, floats and anything unparseable — an id
 *  that is present but wrong must not silently become "create a new session". */
const rowId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/**
 * Saving IS logging — there is no separate "did it" toggle to forget.
 *
 * `id` absent means a NEW session. A day can hold two lifts and a run, so the id is the
 * only thing that distinguishes "edit the one I opened" from "log another one".
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const kind = String(b.kind ?? "") as WorkoutKind;
    if (!KINDS.has(kind)) return Response.json({ error: "bad kind" }, { status: 400 });
    const note = String(b.note ?? "");
    if (note.length > MAX_NOTE) return Response.json({ error: "note too long" }, { status: 413 });
    const date = isISODate(b.date) ? b.date : todayISO();
    // Distinguish "no id supplied" from "an id was supplied and it was rubbish".
    if (b.id != null && rowId(b.id) == null) {
      return Response.json({ error: "bad id" }, { status: 400 });
    }

    const db = await getDb();
    const id = await saveWorkout(db, { id: rowId(b.id), date, kind, note });
    return Response.json({ id, workouts: await workoutsOn(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

/** Remove ONE session by id. `date` is carried only so the refreshed list can be returned. */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = rowId(url.searchParams.get("id"));
    if (id == null) return Response.json({ error: "id required" }, { status: 400 });
    const raw = url.searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();

    const db = await getDb();
    const removed = await deleteWorkout(db, id);
    return Response.json({ removed, workouts: await workoutsOn(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
