import { todayISO } from "@/lib/dates";
import Stats from "@/components/Stats";

export const dynamic = "force-dynamic";

// The tab is how you tell two open windows apart, and both of these are this app.
export const metadata = { title: "The record" };

/**
 * The record. Everything history, nothing you can act on.
 *
 * A route rather than a fourth pane on Today, because the two answer different questions
 * and a screen that showed both at once would invite reading the past as a verdict on the
 * present. The anchor is resolved on the server so the page and its charts agree about
 * what "today" is even if the tab has been open across midnight.
 */
export default async function Page() {
  return <Stats date={todayISO()} />;
}
