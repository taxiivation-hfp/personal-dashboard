import { getDb } from "@/lib/db/client";
import { getTimeline } from "@/lib/queries";
import {
  addTimelineWindow,
  removeTimelineWindow,
  updateTimelineWindow,
} from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * THE FLOATING WINDOWS — three verbs on one row shape. Every answer is the whole
 * timeline store (getTimeline), so the screen replaces its state with the record rather
 * than patching a copy of it; POST also names the new window's id so the screen can
 * open it for writing straight away.
 */

const fail = (e: unknown) =>
  Response.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 500 },
  );

const idOf = (v: unknown): number | null => {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
};

/** Add: `{ kind: 'goal', goalId, x, y }` or `{ kind: 'text', x, y, month? }`. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const db = await getDb();
    const x = Number(b.x);
    const y = Number(b.y);
    let id: number;
    if (b.kind === "goal") {
      const goalId = idOf(b.goalId);
      if (goalId == null)
        return Response.json({ error: "goalId must be a positive id" }, { status: 400 });
      id = await addTimelineWindow(db, { kind: "goal", goalId, x, y });
    } else if (b.kind === "text") {
      const month = b.month == null ? null : String(b.month);
      id = await addTimelineWindow(db, { kind: "text", x, y, month });
    } else {
      return Response.json({ error: "kind must be goal or text" }, { status: 400 });
    }
    return Response.json({ id, ...(await getTimeline(db)) });
  } catch (e) {
    return fail(e);
  }
}

/** Move, rewrite or recolour: `{ id, x?, y?, text?, color?, month?, months?, allMonths? }` — absent fields are left. */
export async function PATCH(req: Request) {
  try {
    const b = await req.json();
    const id = idOf(b.id);
    if (id == null) return Response.json({ error: "id must be a positive id" }, { status: 400 });
    if (b.months !== undefined && !Array.isArray(b.months))
      return Response.json({ error: "months must be a list of YYYY-MM" }, { status: 400 });
    const db = await getDb();
    await updateTimelineWindow(db, id, {
      months: b.months === undefined ? undefined : (b.months as unknown[]).map(String),
      allMonths: b.allMonths === undefined ? undefined : Boolean(b.allMonths),
      month: b.month === undefined ? undefined : b.month === null ? null : String(b.month),
      x: b.x === undefined ? undefined : Number(b.x),
      y: b.y === undefined ? undefined : Number(b.y),
      text: b.text === undefined ? undefined : String(b.text),
      // null is a real value here (back to paper); only absence means "leave it".
      color: b.color === undefined ? undefined : b.color === null ? null : String(b.color),
    });
    return Response.json(await getTimeline(db));
  } catch (e) {
    return fail(e);
  }
}

/** Remove: `{ id }`. */
export async function DELETE(req: Request) {
  try {
    const b = await req.json();
    const id = idOf(b.id);
    if (id == null) return Response.json({ error: "id must be a positive id" }, { status: 400 });
    const db = await getDb();
    await removeTimelineWindow(db, id);
    return Response.json(await getTimeline(db));
  } catch (e) {
    return fail(e);
  }
}
