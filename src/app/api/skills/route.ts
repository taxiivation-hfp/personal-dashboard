import { getDb } from "@/lib/db/client";
import { createSkill } from "@/lib/engine";
import { listSkills } from "@/lib/queries";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

export async function GET(req: Request) {
  try {
    // The 14-day figures are anchored to the date being VIEWED, so the caller passes it.
    const raw = new URL(req.url).searchParams.get("date");
    const db = await getDb();
    return Response.json({
      skills: await listSkills(db, isISODate(raw) ? raw : todayISO()),
    });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** A new skill. Born parked under Portfolio — see createSkill. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    const name = String(b.name ?? "").trim();
    if (!name)
      return Response.json({ error: "name required" }, { status: 400 });
    const db = await getDb();
    const id = await createSkill(db, name);
    return Response.json({ id });
  } catch (e) {
    // The UNIQUE name constraint lands here — say it plainly rather than as SQL.
    const msg = e instanceof Error ? e.message : String(e);
    return Response.json(
      { error: /UNIQUE/i.test(msg) ? "that skill already exists" : msg },
      { status: /UNIQUE/i.test(msg) ? 409 : 500 },
    );
  }
}
