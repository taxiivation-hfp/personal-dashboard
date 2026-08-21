import { getDb } from "@/lib/db/client";
import {
  createOneOffHabit,
  deleteOneOffHabit,
  setOneOffHabitDone,
} from "@/lib/engine";
import { upcomingOneOffHabits } from "@/lib/queries";
import { addDays, isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off non-negotiables — "Tomorrow, specifically".
 *
 * A single item for a single FUTURE day that joins that day's checklist and its adherence
 * tally as one more even share. Not a task: it never carries and it IS scored, which is
 * why it gets its own table and its own route rather than a flag on either neighbour.
 *
 * POST and DELETE hand back the UPCOMING list, the /api/tasks pattern — the planning
 * screen gets the new state from the round trip that changed it. PATCH returns a plain
 * ok instead: its caller is a day's own checklist, which re-reads its whole day and has
 * no use for a list of other days. The future-only rules live in the engine (create
 * refuses today and the past; delete refuses a day already lived); this route only
 * shapes the wire.
 */

const TITLE_MAX = 120;

async function upcoming() {
  const db = await getDb();
  return { oneOffs: await upcomingOneOffHabits(db, todayISO()) };
}

export async function GET() {
  try {
    return Response.json(await upcoming());
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
    const title = String(b.title ?? "").trim();
    if (!title)
      return Response.json({ error: "title required" }, { status: 400 });
    if (title.length > TITLE_MAX)
      return Response.json({ error: "title too long" }, { status: 400 });
    // Defaults to TOMORROW — the day this feature is named after. Any valid future date
    // is accepted; today and the past are refused by the engine, because an item joining
    // a live day's denominator could make the climbing figure fall.
    const date = isISODate(b.date) ? b.date : addDays(todayISO(), 1);
    if (date <= todayISO())
      return Response.json(
        { error: "a one-off is added for a day ahead" },
        { status: 400 },
      );
    const db = await getDb();
    await createOneOffHabit(db, { title, date });
    return Response.json(await upcoming());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function PATCH(req: Request) {
  try {
    const b = await req.json();
    const oneOffId = Number(b.id);
    if (!Number.isInteger(oneOffId) || oneOffId <= 0)
      return Response.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    // The tick, from the day's own checklist. The row already knows its date, so unlike a
    // task no date travels — ticking last Tuesday's one-off from last Tuesday's screen is
    // just ticking it.
    await setOneOffHabitDone(db, oneOffId, Boolean(b.done));
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
    const oneOffId = Number(new URL(req.url).searchParams.get("id"));
    if (!Number.isInteger(oneOffId) || oneOffId <= 0)
      return Response.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    // False when the row's day has already arrived — a lived day's denominator is part of
    // its record, so the engine refuses and the caller hears it rather than a silent ok.
    const removed = await deleteOneOffHabit(db, oneOffId);
    if (!removed)
      return Response.json(
        { error: "only a one-off still ahead can be removed" },
        { status: 409 },
      );
    return Response.json(await upcoming());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
