import { getDb } from "@/lib/db/client";
import { getTimeline } from "@/lib/queries";
import { setTimelineText } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 'YYYY-MM'. Validated rather than trusted — both stores key on it with a CHECK behind
 *  them, and a malformed one would be a constraint error surfacing as a 500. */
const isMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

export async function GET() {
  try {
    return Response.json(await getTimeline(await getDb()));
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * The two TEXT writes — a month's note, a group's name — discriminated by `kind`. They
 * are one contract (empty deletes) on two tables, and two routes for two two-line
 * handlers would be more surface than store. The floating windows have verbs of their
 * own (add, move/rewrite/recolour, remove) and live at ./windows.
 */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const db = await getDb();

    if (b.kind === "note" || b.kind === "group") {
      if (!isMonth(b.month))
        return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
      // null or empty clears the text — see setTimelineText.
      await setTimelineText(db, b.kind, b.month, b.text == null ? null : String(b.text));
      return Response.json(await getTimeline(db));
    }

    return Response.json({ error: "unknown kind" }, { status: 400 });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
