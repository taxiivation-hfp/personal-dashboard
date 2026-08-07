import { getDb } from "@/lib/db/client";
import { listGoals, getPillars } from "@/lib/queries";
import GoalEditor from "@/components/GoalEditor";

export const dynamic = "force-dynamic";

// Its own tab title. Without one it inherits the layout's and every screen in the app is
// called "Today" — which is exactly wrong on the three screens you open BECAUSE you want to
// change something about tomorrow.
export const metadata = { title: "Goals" };

export default async function GoalsPage() {
  const db = await getDb();
  const [goals, pillars] = await Promise.all([listGoals(db), getPillars(db)]);
  return <GoalEditor initial={goals} pillars={pillars} />;
}
