import { getDb } from "@/lib/db/client";
import { listSkills } from "@/lib/queries";
import { logSkillTime, undoSkillTime } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * Any real duration, bounded. The closed {15,30,60} set existed to stop a crafted request
 * logging an absurd day; a range does the same job without blocking a genuine 45 minutes.
 */
const MIN_MINUTES = 1;
const MAX_MINUTES = 600;

async function skillId(ctx: { params: Promise<{ id: string }> }): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await skillId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const minutes = Math.round(Number(b.minutes));
    if (!Number.isFinite(minutes) || minutes < MIN_MINUTES || minutes > MAX_MINUTES) {
      return Response.json({ error: `minutes must be ${MIN_MINUTES}–${MAX_MINUTES}` }, { status: 400 });
    }
    // Validated before it can reach addDays inside listSkills, which throws RangeError on
    // malformed input.
    const date = isISODate(b.date) ? b.date : todayISO();
    const db = await getDb();
    await logSkillTime(db, id, minutes, date);
    return Response.json({ skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function DELETE(req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = await skillId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const raw = new URL(req.url).searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();
    const db = await getDb();
    const removed = await undoSkillTime(db, id, date);
    return Response.json({ removed, skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
