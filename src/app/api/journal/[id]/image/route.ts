import { getDb } from "@/lib/db/client";

export const runtime = "nodejs";

/** Serve the page as a real image so the panel can render it with a plain <img>. */
export async function GET(_req: Request, ctx: { params: Promise<{ id: string }> }) {
  try {
    const id = Number((await ctx.params).id);
    if (!Number.isInteger(id) || id <= 0) return new Response("bad id", { status: 400 });
    const db = await getDb();
    const r = await db.execute({ sql: "SELECT image FROM journal_entries WHERE id=?", args: [id] });
    if (!r.rows.length) return new Response("not found", { status: 404 });

    const dataUrl = String(r.rows[0].image);
    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return new Response("bad image", { status: 500 });
    return new Response(Buffer.from(m[2], "base64"), {
      headers: { "content-type": m[1], "cache-control": "private, max-age=3600" },
    });
  } catch {
    return new Response("error", { status: 500 });
  }
}
