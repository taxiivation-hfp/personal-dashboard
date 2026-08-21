import { getDb } from "@/lib/db/client";
import { setHabit, setHabitValue, setHabitNote } from "@/lib/engine";
import { todayISO, isISODate } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * A tick, or a number for a numeric non-negotiable (weight).
 *
 * Addressed by habit_id, not by name — the owner can rename their non-negotiables, and a
 * name-keyed write would silently stop matching after a rename.
 */
export async function POST(req: Request) {
  try {
    const db = await getDb();
    const b = await req.json();
    const id = Number(b.habit_id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "habit_id required" }, { status: 400 });
    const date = isISODate(b.date) ? b.date : todayISO();

    // A DOCUMENT, for the non-negotiables that carry one. Checked before `value` and
    // `done` because writing one is a complete act on its own: it ticks the day as part of
    // the same upsert, so a caller never has to send two requests and never has to get
    // their order right.
    //
    // `pages` is the quantity logged WITH the document — reading, today. Sent only by the
    // dialog that owns a pages field: absent means "no opinion" and the stored number is
    // left alone, null/empty means "cleared, back to a bare tick". See setHabitNote.
    if (b.note !== undefined) {
      const note = b.note === null ? null : String(b.note);
      if (note != null && note.length > 20_000)
        return Response.json({ error: "note too long" }, { status: 400 });
      let pages: number | null | undefined = undefined;
      if (b.pages !== undefined) {
        pages = b.pages === null || b.pages === "" ? null : Number(b.pages);
        if (pages != null && (!Number.isFinite(pages) || pages <= 0 || pages > 10_000))
          return Response.json({ error: "bad pages" }, { status: 400 });
      }
      await setHabitNote(db, id, date, note, pages);
      return Response.json({ ok: true });
    }

    if (b.value !== undefined) {
      // null / empty clears the day, exactly like unticking.
      const v = b.value === null || b.value === "" ? null : Number(b.value);
      if (v !== null && !Number.isFinite(v))
        return Response.json({ error: "bad value" }, { status: 400 });
      await setHabitValue(db, id, date, v);
      return Response.json({ ok: true });
    }

    await setHabit(db, id, date, b.done === undefined ? true : Boolean(b.done));
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
