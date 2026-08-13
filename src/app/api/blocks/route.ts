import { getDb } from "@/lib/db/client";
import { markBlock, unmarkBlock } from "@/lib/engine";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";

const STATES = new Set(["adhered", "drifted", "skipped", "dismissed"]);

/** Tap-as-you-go. One call per tap; re-tapping changes the mark rather than stacking. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isISODate(b.date))
      return Response.json({ error: "bad date" }, { status: 400 });
    if (!b.event_id)
      return Response.json({ error: "event_id required" }, { status: 400 });

    const db = await getDb();

    // No state = clear the mark entirely. Unmarked is a real state, distinct from
    // "skipped" — it means nobody has said yet.
    if (b.state == null) {
      await unmarkBlock(db, b.date, String(b.event_id));
      return Response.json({ ok: true, state: null });
    }
    if (!STATES.has(String(b.state)))
      return Response.json({ error: "bad state" }, { status: 400 });

    // The RESULTING state, which is not always the requested one: markBlock rewrites a
    // drift worked in full as an adherence. The client closes its slider row on this answer
    // rather than assuming its own, or it would draw a Drifted chip over an adhered row.
    const state = await markBlock(db, {
      date: b.date,
      event_id: String(b.event_id),
      state: b.state,
      title: b.title ?? null,
      time_start: b.time_start ?? null,
      time_end: b.time_end ?? null,
      // Optional, always. A drift with no reason given is completely valid.
      reason: typeof b.reason === "string" ? b.reason.slice(0, 280) : null,
      // Likewise optional: a drift with the slider untouched is completely valid and worth
      // nothing, which is what every drift was before the slider existed. Clamping and the
      // null/0 distinction are `normaliseFraction`'s job, inside the write.
      worked_fraction:
        typeof b.worked_fraction === "number" ? b.worked_fraction : null,
    });
    return Response.json({ ok: true, state });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
