import { getDb } from "@/lib/db/client";
import { allChapters } from "@/lib/queries";
import { setChapter } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** 'YYYY-MM'. Validated rather than trusted — it is a primary key with a CHECK behind it,
 *  and a malformed one would be a constraint error surfacing as a 500. */
const isMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-\d{2}$/.test(v);

export async function GET() {
  try {
    return Response.json({ chapters: await allChapters(await getDb()) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isMonth(b.month))
      return Response.json({ error: "month must be YYYY-MM" }, { status: 400 });
    const db = await getDb();
    // null or empty clears the name — see setChapter.
    await setChapter(db, b.month, b.name == null ? null : String(b.name));
    return Response.json({ chapters: await allChapters(db) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
