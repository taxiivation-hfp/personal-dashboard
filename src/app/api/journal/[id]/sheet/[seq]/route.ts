import { getDb } from "@/lib/db/client";
import { saveJournalSheet, journalSheetCount } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// ONE SHEET of a handwritten scroll — see the long comment at the top of src/lib/sheets.ts.
//
// A page is several A4 sheets and each is its own request, in both directions: the reader
// stacks one <img> per sheet from this GET, and the canvas PUTs only the sheets it touched.
// Sheet 0 is the page row itself (`journal_entries.image`, the same bytes `[id]/image`
// serves for thumbnails); sheets 1.. are rows of journal_sheets.

/** Same ceiling the POST and PATCH enforce. A sheet that could be created but not saved
 *  again after one more line would be a limit you only meet while writing. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

/** A row id off the wire. Rejects 0, negatives, floats and anything unparseable. */
function rowId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/** A sheet index off the wire — like rowId, but 0 is a real sheet (the page row). */
function sheetSeq(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n >= 0 ? n : null;
}

type Params = { params: Promise<{ id: string; seq: string }> };

/**
 * The sheet's bytes as a real image, exactly as `[id]/image` serves sheet 0 — an <img> can
 * take it directly and the canvas can draw it as a base, and a cache header means leafing
 * back through a long page does not re-download it. 404 for a text page, a sheet past the
 * end, and a page that does not exist: an <img> should fail visibly rather than render a
 * broken graphic from an empty data URL.
 */
export async function GET(_req: Request, ctx: Params) {
  try {
    const p = await ctx.params;
    const id = rowId(p.id);
    const seq = sheetSeq(p.seq);
    if (id == null) return new Response("bad id", { status: 400 });
    if (seq == null) return new Response("bad sheet", { status: 400 });
    const db = await getDb();

    let dataUrl: string | null = null;
    if (seq === 0) {
      const r = await db.execute({
        sql: "SELECT kind, image FROM journal_entries WHERE id=?",
        args: [id],
      });
      if (!r.rows.length) return new Response("not found", { status: 404 });
      if (String(r.rows[0].kind ?? "drawing") === "text")
        return new Response("not an image", { status: 404 });
      dataUrl = String(r.rows[0].image);
    } else {
      // A text page can have no rows here (the engine refuses to write one), so a miss is
      // a miss whichever way it came about — one 404 covers the page, its kind and the seq.
      const r = await db.execute({
        sql: "SELECT image FROM journal_sheets WHERE entry_id=? AND seq=?",
        args: [id, seq],
      });
      if (!r.rows.length) return new Response("not found", { status: 404 });
      dataUrl = String(r.rows[0].image);
    }

    const m = /^data:(image\/[a-z]+);base64,(.+)$/.exec(dataUrl);
    if (!m) return new Response("bad image", { status: 500 });
    return new Response(Buffer.from(m[2], "base64"), {
      headers: {
        "content-type": m[1],
        "cache-control": "private, max-age=3600",
      },
    });
  } catch {
    return new Response("error", { status: 500 });
  }
}

/**
 * Write one sheet. Body `{image, width, height}` — the same shape the POST takes for a new
 * page, because a sheet is the same object a one-sheet page always was.
 *
 * The engine decides everything about WHERE it lands (sheet 0 → the page row, later →
 * journal_sheets) and what it refuses: a text page, or a seq that would leave a gap. Those
 * refusals come back as its own message — 409 for the gap, since the record is in a state
 * the request did not expect and a resend after the missing sheet would succeed; 400 for
 * the kind, since no resend can make a text page take ink.
 *
 * Returns the new TOTAL, so a caller that just appended knows the count without a second
 * round trip.
 */
export async function PUT(req: Request, ctx: Params) {
  try {
    const p = await ctx.params;
    const id = rowId(p.id);
    const seq = sheetSeq(p.seq);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    if (seq == null)
      return Response.json({ error: "bad sheet" }, { status: 400 });

    const b = await req.json();
    const image = String(b.image ?? "");
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image))
      return Response.json(
        { error: "image must be a PNG/JPEG/WebP data URL" },
        { status: 400 },
      );
    if (image.length > MAX_IMAGE_BYTES)
      return Response.json({ error: "image too large" }, { status: 413 });

    const db = await getDb();
    let ok: boolean;
    try {
      ok = await saveJournalSheet(db, id, seq, {
        image,
        width: b.width != null ? Number(b.width) : null,
        height: b.height != null ? Number(b.height) : null,
      });
    } catch (e) {
      const msg = e instanceof Error ? e.message : String(e);
      // The engine's two refusals, told apart by their wording rather than by a typed
      // error class: they are the only two it throws for this write, and a class would be
      // one more export for a distinction the status code already carries.
      const status = /gap/.test(msg) ? 409 : /text page/.test(msg) ? 400 : 500;
      return Response.json({ error: msg }, { status });
    }
    if (!ok) return Response.json({ error: "not found" }, { status: 404 });

    return Response.json({ id, seq, sheets: await journalSheetCount(db, id) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
