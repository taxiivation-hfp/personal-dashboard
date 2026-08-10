import { getDb } from "@/lib/db/client";
import { allJournalPages } from "@/lib/queries";
import JournalArchive from "@/components/JournalArchive";

export const dynamic = "force-dynamic";

// Its own tab title, same ruling as /goals: without one every screen is called "Today",
// which is exactly wrong on the screen you open to look BACK.
export const metadata = { title: "Journal" };

/**
 * The journal's archive — every page, by month.
 *
 * A route, not a shelf at the foot of Today: that screen is where tonight's page gets
 * written, and this is where the written ones live. Same acting/looking split as /stats.
 */
export default async function JournalPage() {
  const db = await getDb();
  return <JournalArchive initial={await allJournalPages(db)} />;
}
