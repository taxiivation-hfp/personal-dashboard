import { getDb } from "@/lib/db/client";
import { listGoals } from "@/lib/queries";
import GoalEditor from "@/components/GoalEditor";

export const dynamic = "force-dynamic";

// Its own tab title. Without one it inherits the layout's and every screen in the app is
// called "Today" — which is exactly wrong on the three screens you open BECAUSE you want to
// change something about tomorrow.
export const metadata = { title: "Goals" };

// No getPillars: every goal is a Career goal since the Health & Career pivot, so the editor
// has no picker to fill and nothing here needs the pillar list.
export default async function GoalsPage() {
  const db = await getDb();
  return <GoalEditor initial={await listGoals(db)} />;
}
