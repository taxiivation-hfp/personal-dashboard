import { todayISO } from "@/lib/dates";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "The record" };

/** 'YYYY-MM', validated rather than trusted — a hand-typed month must land on the plain
 *  log, not on a date-arithmetic RangeError. */
const isMonth = (v: unknown): v is string =>
  typeof v === "string" && /^\d{4}-(0[1-9]|1[0-2])$/.test(v);

/** The month's real last day — day 0 of the month after. It has to be a REAL date:
 *  isISODate on /api/log rejects a rolled-over 'YYYY-02-31' and would quietly fall back
 *  to today, which is precisely the month that was not asked for. */
const monthEnd = (ym: string): string => {
  const [y, m] = ym.split("-").map(Number);
  return `${ym}-${String(new Date(Date.UTC(y!, m!, 0)).getUTCDate()).padStart(2, "0")}`;
};

/**
 * The record, as a page.
 *
 * The same component the Pillars column expands into — one dashboard, two ways in, so the
 * thing you arrive at is never a second implementation of the thing you expanded. This entry
 * exists for a bookmarked URL and for the phone's move onto it; the expansion is the primary
 * route on a laptop, and it is the one that animates.
 *
 * THE BOTTOM TAB BAR IS GONE, by the owner's ruling — the panes are reached by tapping the
 * window you want, which is what was actually being used. The way in here is StatsLink under
 * the pillar rings; the way out is the record's own ×, which falls back to `href="/"` when
 * there is no in-place `onClose` to call. Removing a navigation control must never leave a
 * screen you cannot leave, and this one was checked rather than assumed.
 *
 * The anchor is resolved on the server so the page and its charts agree about what "today"
 * is even if the tab has been open across midnight.
 *
 * `?view=log` opens on the WRITTEN half — the journal's old front door redirects here, and
 * the timeline's month bubbles land here too. `?month=YYYY-MM` anchors the log's scroll at
 * that month's end, so a month chosen on the timeline is the first month on screen; the
 * charts stay anchored to today, because a month is a place in the LOG, not a new question
 * to ask the stats.
 */
export default async function Page({
  searchParams,
}: {
  searchParams: Promise<{ view?: string | string[]; month?: string | string[] }>;
}) {
  const today = todayISO();
  const sp = await searchParams;
  const month = isMonth(sp.month) ? sp.month : null;
  // A month deep-link is a link INTO the log, so it implies the log view even bare.
  const view = sp.view === "log" || month ? ("log" as const) : ("stats" as const);
  return (
    <div className="h-dvh">
      <Dashboard
        date={today}
        initialView={view}
        logAnchor={month ? monthEnd(month) : undefined}
      />
    </div>
  );
}
