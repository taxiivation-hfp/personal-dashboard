import { getDb } from "@/lib/db/client";
import { calorieDays } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import CalorieHistory from "@/components/CalorieHistory";

export const dynamic = "force-dynamic";

// Its own tab title, same ruling as /sessions: this is a screen you open to look back.
export const metadata = { title: "Calories" };

/**
 * The whole food backlog — every day with an entry, newest first, and the place any of
 * them gets corrected. Deliberately unpaginated, the gym log's own ruling: years of meals
 * are text, and the owner asked to see the lot.
 */
export default async function CaloriesPage() {
  const db = await getDb();
  const today = todayISO();
  return (
    <CalorieHistory days={await calorieDays(db, "2000-01-01", today)} today={today} />
  );
}
