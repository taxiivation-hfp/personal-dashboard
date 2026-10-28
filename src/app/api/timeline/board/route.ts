import { getDb } from "@/lib/db/client";
import { getTimeline } from "@/lib/queries";
import { clearBoardPos, setBoardPos } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * A MONTH BOARD'S CARD POSITIONS (2026-10-29) — one upsert verb and one forget verb on
 * month_board. Like its sibling /api/timeline/windows, every answer is the whole timeline
 * store, so the screen replaces its state rather than patching a copy.
 */

const fail = (e: unknown) =>
  Response.json(
    { error: e instanceof Error ? e.message : String(e) },
    { status: 500 },
  );

const monthOk = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);
const itemOk = (v: unknown): v is string =>
  typeof v === "string" && /^(goal|note):[1-9]\d*$/.test(v);

/** Place a card: `{ month, item, x, y }`. */
export async function PATCH(req: Request) {
  try {
    const b = await req.json();
    if (!monthOk(b.month))
      return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
    if (!itemOk(b.item))
      return Response.json({ error: "item must be goal:<id> or note:<id>" }, { status: 400 });
    const x = Number(b.x);
    const y = Number(b.y);
    if (!Number.isFinite(x) || !Number.isFinite(y))
      return Response.json({ error: "x and y must be numbers" }, { status: 400 });
    const db = await getDb();
    await setBoardPos(db, b.month, b.item, x, y);
    return Response.json(await getTimeline(db));
  } catch (e) {
    return fail(e);
  }
}

/** Forget a card's spot: `{ month, item }`. */
export async function DELETE(req: Request) {
  try {
    const b = await req.json();
    if (!monthOk(b.month) || !itemOk(b.item))
      return Response.json({ error: "month and item are required" }, { status: 400 });
    const db = await getDb();
    await clearBoardPos(db, b.month, b.item);
    return Response.json(await getTimeline(db));
  } catch (e) {
    return fail(e);
  }
}
