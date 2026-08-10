import { getDb } from "@/lib/db/client";
import {
  setHabitOverride,
  clearHabitOverride,
  weekdayBit,
} from "@/lib/engine";
import { allHabits, habitOverridesFor } from "@/lib/queries";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One date's dressing of the checklist — see habit_overrides in the schema. The UI only
 * ever asks about TOMORROW, but the route takes any valid date: the engine is the rule,
 * and "which day is worth customising" is the screen's opinion, not the API's.
 */

/** The editor's read: every habit scheduled on `date`, its DEFAULT name and pillar, and
 *  whatever override is set — separately, because the editor has to show what will
 *  happen AND what it would reset to. */
export async function GET(req: Request) {
  try {
    const date = new URL(req.url).searchParams.get("date");
    if (!isISODate(date))
      return Response.json({ error: "bad date" }, { status: 400 });
    const db = await getDb();
    const [habits, overrides] = await Promise.all([
      allHabits(db),
      habitOverridesFor(db, date),
    ]);
    const bit = weekdayBit(date);
    return Response.json({
      date,
      habits: habits
        .filter((h) => (h.days_mask & bit) !== 0)
        .map((h) => ({
          id: h.id,
          name: h.name,
          pillar: h.pillar,
          input: h.input,
          override: overrides.get(h.id) ?? null,
        })),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isISODate(b.date))
      return Response.json({ error: "bad date" }, { status: 400 });
    const id = Number(b.habit_id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "bad habit_id" }, { status: 400 });
    const db = await getDb();
    await setHabitOverride(db, b.date, id, {
      name: b.name != null ? String(b.name) : null,
      pillarKey: b.pillar != null ? String(b.pillar) : null,
    });
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const url = new URL(req.url);
    const date = url.searchParams.get("date");
    if (!isISODate(date))
      return Response.json({ error: "bad date" }, { status: 400 });
    const id = Number(url.searchParams.get("habit_id"));
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "bad habit_id" }, { status: 400 });
    const db = await getDb();
    await clearHabitOverride(db, date, id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
