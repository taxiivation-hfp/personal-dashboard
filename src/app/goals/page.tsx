import { getDb } from "@/lib/db/client";
import { listGoals, getPillars } from "@/lib/queries";
import GoalEditor from "@/components/GoalEditor";

export const dynamic = "force-dynamic";

export default async function GoalsPage() {
  const db = await getDb();
  const [goals, pillars] = await Promise.all([listGoals(db), getPillars(db)]);
  return <GoalEditor initial={goals} pillars={pillars} />;
}
