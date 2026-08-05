import { getDb } from "@/lib/db/client";
import { saveJournalEntry } from "@/lib/engine";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// The page is stored as an IMAGE and nothing else. No transcription, no theme
// extraction, no vision call — writing by hand is the point, and reading it back
// into text was measuring the output rather than the act.
const MAX_IMAGE_BYTES = 4 * 1024 * 1024;

export async function POST(req: Request) {
  try {
    const b = await req.json();
    const date = b.date != null ? String(b.date) : todayISO();
    if (!isISODate(date)) return Response.json({ error: "date must be YYYY-MM-DD" }, { status: 400 });

    const image = String(b.image ?? "");
    if (!/^data:image\/(png|jpeg|webp);base64,/.test(image)) {
      return Response.json({ error: "image must be a PNG/JPEG/WebP data URL" }, { status: 400 });
    }
    if (image.length > MAX_IMAGE_BYTES) return Response.json({ error: "image too large" }, { status: 413 });

    const db = await getDb();
    const id = await saveJournalEntry(db, {
      date,
      image,
      width: b.width != null ? Number(b.width) : null,
      height: b.height != null ? Number(b.height) : null,
    });
    return Response.json({ id, date });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}
