import { todayISO } from "@/lib/dates";
import Dashboard from "@/components/Dashboard";
import { PhoneTabBar } from "@/components/PhoneTabs";

export const dynamic = "force-dynamic";
export const metadata = { title: "The record" };

/**
 * The record, as a page.
 *
 * The same component the Pillars column expands into — one dashboard, two ways in, so the
 * thing you arrive at is never a second implementation of the thing you expanded. This entry
 * exists for the phone tab and for a bookmarked URL; the expansion is the primary route on a
 * laptop, and it is the one that animates.
 *
 * The TAB BAR rides along on the phone — this page is the fourth tab, and a tab you cannot
 * tab back out of is a dead end, not a tab. In stats mode every pane label is a link home;
 * the bar is lg:hidden, so the desktop page is untouched.
 *
 * The anchor is resolved on the server so the page and its charts agree about what "today"
 * is even if the tab has been open across midnight.
 */
export default async function Page() {
  return (
    <div className="h-dvh">
      <Dashboard date={todayISO()} />
      <PhoneTabBar tab="stats" />
    </div>
  );
}
