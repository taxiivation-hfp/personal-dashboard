import { getDb } from "@/lib/db/client";
import { allHabits } from "@/lib/queries";
import HabitEditor from "@/components/HabitEditor";

export const dynamic = "force-dynamic";

// Its own tab title. Without one it inherits the layout's and every screen in the app is
// called "Today" — which is exactly wrong on the three screens you open BECAUSE you want to
// change something about tomorrow.
export const metadata = { title: "Non-negotiables" };

export default async function HabitsPage() {
  const db = await getDb();
  return <HabitEditor initial={await allHabits(db)} />;
}
