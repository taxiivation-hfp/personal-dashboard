import { getDb } from "@/lib/db/client";
import { addCalories, deleteCalorieEntry } from "@/lib/engine";
import { caloriesForDate } from "@/lib/queries";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";

/** A single addition. 0 is meaningless as an increment — the old absolute field used it to
 *  clear the day, which is what DELETE is for now. */
const MIN_KCAL = 1;
const MAX_KCAL = 20000;

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

    const db = await getDb();
    const id = await addCalories(db, b.date, n);
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
