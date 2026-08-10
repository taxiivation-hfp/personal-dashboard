import { getDb } from "@/lib/db/client";
import { addCalories, deleteCalorieEntry } from "@/lib/engine";
import { caloriesForDate, calorieDays } from "@/lib/queries";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** A single addition. 0 is meaningless as an increment — the old absolute field used it to
 *  clear the day, which is what DELETE is for now. */
const MIN_KCAL = 1;
const MAX_KCAL = 20000;
/** A food's name is a label, not a journal. Long enough for "leftover birthday cake,
 *  second helping"; short enough that the row it prints on stays a row. */
const MAX_NOTE_CHARS = 80;
/** How far back the dialog's Past days list reads — a fortnight, the owner's call. The
 *  chart beside it carries the month; /stats charts the long run. */
const HISTORY_DAYS = 14;

const rowId = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** ADD to the day's running total. Additive by design — see the schema comment. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isISODate(b.date))
      return Response.json({ error: "bad date" }, { status: 400 });
    const n = Math.round(Number(b.kcal));
    if (!Number.isFinite(n) || n < MIN_KCAL || n > MAX_KCAL) {
      return Response.json(
        { error: `kcal must be ${MIN_KCAL}–${MAX_KCAL}` },
        { status: 400 },
      );
    }

    // The food's name, optional and free-text. Purely a label — no lookup, no database,
    // no parsing. Trimmed here so "  " never becomes a stored name.
    const note =
      typeof b.note === "string" ? b.note.trim().slice(0, MAX_NOTE_CHARS) : null;

    const db = await getDb();
    const id = await addCalories(db, b.date, n, note);
    const { total, entries } = await caloriesForDate(db, b.date);
    return Response.json({ id, total, entries });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Reads, three shapes:
 *   ?date=YYYY-MM-DD  one day's total and entries — the dialog's main pane, any day
 *   ?to=YYYY-MM-DD    the fortnight before that day, grouped — the Past days list.
 *                     EXCLUSIVE of `to` itself: that day is already the main pane.
 */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const db = await getDb();

    const date = url.searchParams.get("date");
    if (date != null) {
      if (!isISODate(date))
        return Response.json({ error: "bad date" }, { status: 400 });
      const { total, entries } = await caloriesForDate(db, date);
      return Response.json({ date, total, entries });
    }

    const raw = url.searchParams.get("to");
    const to = isISODate(raw) ? raw : todayISO();
    return Response.json({
      days: await calorieDays(db, addDays(to, -HISTORY_DAYS), addDays(to, -1)),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Remove ONE entry, by id.
 *
 * By id rather than "undo the last one": after 400, 800 and 300 the entry you want gone is
 * usually not the most recent. The frontend can still implement undo by sending the last
 * id, so this is a strict superset of that.
 */
export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const id = rowId(url.searchParams.get("id"));
    if (id == null)
      return Response.json({ error: "id required" }, { status: 400 });
    const date = url.searchParams.get("date");
    if (!isISODate(date))
      return Response.json({ error: "bad date" }, { status: 400 });

    const db = await getDb();
    const removed = await deleteCalorieEntry(db, id);
    const { total, entries } = await caloriesForDate(db, date);
    return Response.json({ removed, total, entries });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
