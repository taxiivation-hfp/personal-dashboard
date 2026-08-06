import { getDb } from "@/lib/db/client";
import { deleteJournalEntry } from "@/lib/engine";

export const runtime = "nodejs";

/** The full-resolution page. Kept off the day payload so the board stays light. */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0)
      return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    const r = await db.execute({
      sql: "SELECT id,date,image,transcript,themes,mood FROM journal_entries WHERE id=?",
      args: [id],
    });
    if (!r.rows.length)
      return Response.json({ error: "not found" }, { status: 404 });
    const row = r.rows[0];
    return Response.json({
      id: Number(row.id),
      date: String(row.date),
      image: String(row.image),
      transcript: row.transcript == null ? null : String(row.transcript),
      themes: row.themes == null ? [] : JSON.parse(String(row.themes)),
      mood: row.mood == null ? null : String(row.mood),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function DELETE(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = Number((await ctx.params).id);
    const db = await getDb();
    await deleteJournalEntry(db, id);
    return Response.json({ ok: true });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
