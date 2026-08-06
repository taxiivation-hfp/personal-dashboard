import { getDb } from "@/lib/db/client";
import { getPillars } from "@/lib/queries";
import { setPillarColor } from "@/lib/engine";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET() {
  try {
    const db = await getDb();
    return Response.json({ pillars: await getPillars(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 500 });
  }
}

export async function PATCH(req: Request) {
  try {
    const b = await req.json();
    const key = String(b.key ?? "");
    if (!key) return Response.json({ error: "key required" }, { status: 400 });
    const db = await getDb();
    // null clears back to the CSS default. Anything outside the curated palette is
    // refused by the engine — a free hex field could make the app unreadable, and the
    // light-beige identity is a product decision rather than a preference.
    await setPillarColor(db, key, b.color == null ? null : String(b.color));
    return Response.json({ pillars: await getPillars(db) });
  } catch (e) {
    return Response.json({ error: e instanceof Error ? e.message : String(e) }, { status: 400 });
  }
}
