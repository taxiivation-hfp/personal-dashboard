import { getDb } from "@/lib/db/client";
import { setDayTitle } from "@/lib/engine";
import { dayTitlesBetween } from "@/lib/queries";
import { isISODate } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** Name a day, or clear it with an empty string. An intention, not a record. */
export async function POST(req: Request) {
  try {
    const b = await req.json();
    if (!isISODate(b.date))
      return Response.json({ error: "bad date" }, { status: 400 });
    const db = await getDb();
    await setDayTitle(db, b.date, String(b.title ?? ""));
    const titles = await dayTitlesBetween(db, b.date, b.date);
    return Response.json({ date: b.date, title: titles.get(b.date) ?? null });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** Titles across a range — the days-ahead planner reads several at once. */
export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const from = url.searchParams.get("from");
    const to = url.searchParams.get("to");
    if (!isISODate(from) || !isISODate(to)) {
      return Response.json({ error: "bad range" }, { status: 400 });
    }
    const db = await getDb();
    const titles = await dayTitlesBetween(db, from, to);
    return Response.json({ titles: Object.fromEntries(titles) });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}
