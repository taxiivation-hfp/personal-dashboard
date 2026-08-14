import { getDb } from "@/lib/db/client";
import { listSkills } from "@/lib/queries";
import { saveSkillSession, deleteSkillSession } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";

/**
 * A skill SESSION — a text document, the same thing a workout is.
 *
 * The path is still `/time` because renaming a live route is churn for a noun, but nothing
 * here takes minutes any more. It used to require `minutes` in 1..600 and reject the
 * request without one; skills stopped being measured in hours by the owner's ruling, and
 * turning up is the unit.
 *
 * A `minutes` field in the body is IGNORED rather than rejected — a phone holding a stale
 * bundle should log its session, not fail on a field the server stopped caring about.
 */

/**
 * The note is bounded, and generously. A workout log is numbers scribbled between sets and
 * the imported Discord history runs to dozens of lines, so this is a guard against a
 * crafted request rather than a limit anyone writing a real session can reach.
 */
const MAX_NOTE = 20_000;

async function skillId(ctx: {
  params: Promise<{ id: string }>;
}): Promise<number | null> {
  const n = Number((await ctx.params).id);
  return Number.isInteger(n) && n > 0 ? n : null;
}

export async function POST(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = await skillId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();

    // Saving IS logging, so an empty document is the one thing that must not silently
    // create a session — it would be a row nobody wrote, counting toward the ring.
    const note = typeof b.note === "string" ? b.note.trim() : "";
    if (!note) return Response.json({ error: "empty session" }, { status: 400 });
    if (note.length > MAX_NOTE)
      return Response.json({ error: "note too long" }, { status: 400 });

    // Validated before it can reach addDays inside listSkills, which throws RangeError on
    // malformed input.
    const date = isISODate(b.date) ? b.date : todayISO();

    // Present means EDIT. Absent means a new session — a skill may hold several on one day,
    // exactly as a day may hold two lifts.
    const sessionId =
      Number.isInteger(b.id) && Number(b.id) > 0 ? Number(b.id) : null;

    const db = await getDb();
    await saveSkillSession(db, { id: sessionId, skillId: id, date, note });
    return Response.json({ skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Delete one session BY ID.
 *
 * This took only a date and removed whichever row happened to be newest for it, because
 * one session per skill per day was the only shape that existed. Now that a day can hold
 * several, "the last one" is not something the caller can mean precisely — an id is.
 */
export async function DELETE(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = await skillId(ctx);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const url = new URL(req.url);
    const sessionId = Number(url.searchParams.get("session"));
    if (!Number.isInteger(sessionId) || sessionId <= 0)
      return Response.json({ error: "bad session id" }, { status: 400 });

    const raw = url.searchParams.get("date");
    const date = isISODate(raw) ? raw : todayISO();
    const db = await getDb();
    const removed = await deleteSkillSession(db, id, sessionId);
    return Response.json({ removed, skills: await listSkills(db, date) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
