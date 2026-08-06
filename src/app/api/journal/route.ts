import { getDb } from "@/lib/db/client";
import { saveJournalEntry } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// A DRAWING is stored as an image and nothing else — no transcription, no theme
// extraction, no vision call. Writing by hand is the point, and reading it back into
// text was measuring the output rather than the act.
//
// A TEXT entry is stored as words. It is not a transcript of anything; it is what was
// typed. The two kinds never convert into each other.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;
const MAX_BODY_CHARS = 20000;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const date = b.date != null ? String(b.date) : todayISO();
    if (!isISODate(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

    const kind = b.kind === "text" ? "text" : "drawing";

    if (kind === "text") {
      const body = String(b.body ?? "").trim();
      if (!body) return Response.json({ error: "body required" }, { status: 400 });
      if (body.length > MAX_BODY_CHARS) return Response.json({ error: "page too long" }, { status: 413 });
      const db = await getDb();
      // image='' — see the schema comment. `kind` is the discriminator, never emptiness.
      const id = await saveJournalEntry(db, { date, kind, image: "", body });
      return Response.json({ id, date, kind });
    }

    const image = String(b.image ?? "");
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) {
      return Response.json({ error: "image must be a PNG/JPEG/WebP data URL" }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_BYTES) return Response.json({ error: "image too large" }, { status: 413 });

    const db = await getDb();
    const id = await saveJournalEntry(db, {
      date,
      kind,
      image,
      width: b.width != null ? Number(b.width) : null,
      height: b.height != null ? Number(b.height) : null,
    });
    return Response.json({ id, date, kind });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
