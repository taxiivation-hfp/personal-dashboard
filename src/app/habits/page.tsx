import { getDb } from "@/lib/db/client";
import { allHabits } from "@/lib/queries";
import HabitEditor from "@/components/HabitEditor";

export const dynamic = "force-dynamic";

export default async function HabitsPage() {
  const db = await getDb();
  return <HabitEditor initial={await allHabits(db)} />;
}
