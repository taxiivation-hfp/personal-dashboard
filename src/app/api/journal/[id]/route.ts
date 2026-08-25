import { getDb } from "@/lib/db/client";
import {
  deleteJournalEntry,
  journalSheetCount,
  updateJournalEntry,
} from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Same ceilings the POST enforces. A page that could be created but not saved again
 *  after one more sentence would be a limit you only meet while editing. */
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_CHARS = 20000;

/** A row id off the wire. Rejects 0, negatives, floats and anything unparseable. */
function rowId(v: unknown): number | null {
  const n = Number(v);
  return Number.isInteger(n) && n > 0 ? n : null;
}

/**
 * ONE PAGE, as words.
 *
 * The full `body` lives here and nowhere else. Every list in the app carries a 140-character
 * `preview` instead — deliberately, since a year of pages in one response is the reason
 * `[id]/image` exists — but the consequence was that a typed page could be written and then
 * never read again: the shelf showed its first line and there was no way through to the
 * rest. This is that way through.
 *
 * A drawing's bytes are still NOT here. They are served by `[id]/image` as a real image with
 * a cache header, which an <img> and a canvas can both take; re-encoding the same PNG as
 * base64 inside a JSON envelope would be the same page twice at four thirds the size.
 */
export async function GET(
  _req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = rowId((await ctx.params).id);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const db = await getDb();
    const r = await db.execute({
      sql: "SELECT id, date, kind, body, width, height FROM journal_entries WHERE id=?",
      args: [id],
    });
    if (!r.rows.length)
      return Response.json({ error: "not found" }, { status: 404 });
    const row = r.rows[0];
    return Response.json({
      id: Number(row.id),
      date: String(row.date),
      // `kind` is the discriminator everywhere — a text page stores image='', so a caller
      // must never tell them apart by testing emptiness.
      kind: String(row.kind ?? "drawing"),
      body: row.body == null ? null : String(row.body),
      width: row.width == null ? null : Number(row.width),
      height: row.height == null ? null : Number(row.height),
      // How many sheets the scroll runs to (see sheets.ts): ≥1 for a drawing, 0 for words.
      // The reader fetches `[id]/sheet/{seq}` for each; the count is all it needs, since
      // sheets are contiguous by construction.
      sheets: await journalSheetCount(db, id),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/**
 * Rewrite the page.
 *
 * Which half of the body is accepted is decided by the ROW, not by the request: the engine
 * reads the stored `kind` and refuses a patch of the other shape, so no request can turn a
 * drawing into words. See updateJournalEntry.
 */
export async function PATCH(
  req: Request,
  ctx: { params: Promise<{ id: string }> },
) {
  try {
    const id = rowId((await ctx.params).id);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
    const b = await req.json();
    const db = await getDb();

    if (b.body !== undefined) {
      const body = String(b.body ?? "").trim();
      if (!body)
        return Response.json({ error: "body required" }, { status: 400 });
      if (body.length > MAX_BODY_CHARS)
        return Response.json({ error: "page too long" }, { status: 413 });
      const ok = await updateJournalEntry(db, id, { kind: "text", body });
      if (!ok) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ id, kind: "text" });
    }

    if (b.image !== undefined) {
      const image = String(b.image ?? "");
      if (!/^data:image\/(png|jpeg|webp);base64,/.test(image))
        return Response.json(
          { error: "image must be a PNG/JPEG/WebP data URL" },
          { status: 400 },
        );
      if (image.length > MAX_IMAGE_BYTES)
        return Response.json({ error: "image too large" }, { status: 413 });
      const ok = await updateJournalEntry(db, id, {
        kind: "drawing",
        image,
        width: b.width != null ? Number(b.width) : null,
        height: b.height != null ? Number(b.height) : null,
      });
      if (!ok) return Response.json({ error: "not found" }, { status: 404 });
      return Response.json({ id, kind: "drawing" });
    }

    return Response.json({ error: "nothing to update" }, { status: 400 });
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
    // Validated here as it is on the other two verbs. It used to go straight through as
    // Number(id) — NaN, which deleted nothing, which is the right outcome reached the
    // wrong way and reported as a success.
    const id = rowId((await ctx.params).id);
    if (id == null) return Response.json({ error: "bad id" }, { status: 400 });
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
