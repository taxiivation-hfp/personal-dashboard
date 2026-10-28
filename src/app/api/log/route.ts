import { getDb } from "@/lib/db/client";
import { logDays } from "@/lib/queries";
import { isISODate, todayISO } from "@/lib/dates";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/**
 * The written record, a page of days at a time.
 *
 * PAGED BY DAY, never by row — the screen groups by day, so a row limit would cut a Tuesday
 * in half and the next page would open mid-session. `before` is inclusive and moves back as
 * the scroll advances; the client passes the last date it received minus one.
 *
 * Days holding nothing written never appear at all, which is what makes an infinite scroll
 * over a young app readable: an empty fortnight costs one row of SQL and draws nothing,
 * rather than fourteen cards saying you wrote nothing.
 */

/** Days per page. Small enough that the first screen paints immediately, large enough that
 *  a quiet stretch does not need four fetches to scroll past. */
const PAGE = 20;
const MAX_PAGE = 60;

export async function GET(req: Request) {
  try {
    const url = new URL(req.url);
    const raw = url.searchParams.get("before");
    // Validated before it can reach any date arithmetic, which throws RangeError on
    // malformed input — the same guard /api/rings and /api/adherence use.
    const before = isISODate(raw) ? raw : todayISO();

    const asked = Number(url.searchParams.get("limit"));
    const limit =
      Number.isInteger(asked) && asked > 0 ? Math.min(asked, MAX_PAGE) : PAGE;

    // Optional inclusive floor (the month page's Records): paging ends once it is reached.
    const rawAfter = url.searchParams.get("after");
    const after = isISODate(rawAfter) ? rawAfter : undefined;

    const db = await getDb();
    const days = await logDays(db, before, limit, after);

    /**
     * Where the NEXT page starts, computed here rather than by the client.
     *
     * null means the log is exhausted — the client uses that to stop asking, and it is a
     * different statement from "this page was empty". A short page is not the end: days with
     * nothing written are skipped, so a page can come back thin and still have years behind
     * it. Only a page with no days at all ends the scroll.
     */
    const nextBefore = days.length ? isoBefore(days[days.length - 1]!.date) : null;
    // With a floor, the log is also exhausted once the next page would start below it.
    const done = days.length === 0 || (after !== undefined && nextBefore! < after);

    return Response.json({ days, nextBefore, done });
  } catch (e) {
    return Response.json(
      { error: e instanceof Error ? e.message : String(e) },
      { status: 500 },
    );
  }
}

/** The day before an ISO date. Local, not UTC — every date in this app is a local day, and
 *  `new Date(iso)` parses as UTC, which lands on the wrong day west of Greenwich. */
function isoBefore(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const dt = new Date(y!, m! - 1, d! - 1);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${dt.getFullYear()}-${p(dt.getMonth() + 1)}-${p(dt.getDate())}`;
}
