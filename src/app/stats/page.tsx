import { todayISO } from "@/lib/dates";
import Dashboard from "@/components/Dashboard";

export const dynamic = "force-dynamic";
export const metadata = { title: "The record" };

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
 */
export default async function Page() {
  return (
    <div className="h-dvh">
      <Dashboard date={todayISO()} />
    </div>
  );
}
