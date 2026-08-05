import { getDb } from "@/lib/db/client";
import { getDayView, listGoals, listSkills } from "@/lib/queries";
import { getCalendarForDate } from "@/lib/google";
import { todayISO } from "@/lib/dates";
import Today from "@/components/Today";

export const dynamic = "force-dynamic";

export default async function Page() {
  const db = await getDb();
  const date = todayISO();
  const cal = await getCalendarForDate(date);
  const [data, goals, skills] = await Promise.all([
    getDayView(db, date, cal.events, cal.connected),
    listGoals(db),
    listSkills(db),
  ]);
  // Goals and skills now live in the right column — there is no separate route.
  return <Today initial={data} goals={goals} skills={skills} />;
}
