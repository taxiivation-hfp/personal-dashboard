import { todayISO } from "@/lib/dates";
import SessionHistory from "@/components/SessionHistory";

export const dynamic = "force-dynamic";
export const metadata = { title: "Sessions" };

/**
 * The whole gym log, and the place an old session gets written down.
 *
 * A route rather than a taller pane in the log dialog: that dialog shows the last five of a
 * kind as REFERENCE while you write, and a scrollable list of two hundred does not belong
 * beside a textarea. The anchor is resolved on the server so the page and the dialog agree
 * about what "today" is across midnight.
 */
export default async function Page() {
  return <SessionHistory today={todayISO()} />;
}
