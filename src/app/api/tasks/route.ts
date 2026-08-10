import { getDb } from "@/lib/db/client";
import {
  createDayTask,
  deleteDayTask,
  setDayTaskDone,
  updateDayTask,
} from "@/lib/engine";
import { openDayTasks } from "@/lib/queries";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * One-off tasks — added for a day, carried forward until ticked.
 *
 * Every response hands back the OPEN list, so a caller gets the new state from the same
 * round trip it used to change it. That is the pattern /api/goals and /api/skills already
 * set, and it is what keeps the planning screen from having to guess.
 *
 * The carry itself has no endpoint because it is not an operation: where a task sits is
 * derived on read from `due` and today (src/lib/tasks.ts). There is nothing to POST at
 * midnight and nothing that can run twice.
 */

/** A row id off the wire. Rejects 0, negatives, floats and anything unparseable. */
function id(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

const TITLE_MAX = 120;

async function openList() {
  const db = await getDb();
  return { tasks: await openDayTasks(db, todayISO()) };
}

export async function GET() {
  try {
    return Response.json(await openList());
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
    if (!title) return Response.json({ error: "title required" }, { status: 400 });
    if (title.length > TITLE_MAX)
      return Response.json({ error: "title too long" }, { status: 400 });
    // Defaults to TOMORROW, not today: this endpoint exists for the thing you are planning
    // to do, and the screen that calls it is the one about the day ahead.
    const due = isISODate(b.due) ? b.due : todayISO();

    const db = await getDb();
    await createDayTask(db, { title, due });
    return Response.json(await openList());
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
    const taskId = id(b.id);
    if (taskId == null)
      return Response.json({ error: "id required" }, { status: 400 });

    const db = await getDb();

    if (b.done !== undefined) {
      // The day the tick BELONGS to, which is the day being viewed — not necessarily
      // today. Marking yesterday's task done from yesterday's screen must stamp yesterday.
      const on = isISODate(b.date) ? b.date : todayISO();
      await setDayTaskDone(db, taskId, on, Boolean(b.done));
      return Response.json(await openList());
    }

    const patch: { title?: string; due?: string } = {};
    if (b.title !== undefined) {
      const t = String(b.title).trim();
      if (!t) return Response.json({ error: "title required" }, { status: 400 });
      if (t.length > TITLE_MAX)
        return Response.json({ error: "title too long" }, { status: 400 });
      patch.title = t;
    }
    if (b.due !== undefined) {
      if (!isISODate(b.due))
        return Response.json({ error: "bad due date" }, { status: 400 });
      patch.due = b.due;
    }
    await updateDayTask(db, taskId, patch);
    return Response.json(await openList());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(req: Request) {
  try {
    const taskId = id(new URL(req.url).searchParams.get("id"));
    if (taskId == null)
      return Response.json({ error: "id required" }, { status: 400 });
    const db = await getDb();
    await deleteDayTask(db, taskId);
    return Response.json(await openList());
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
