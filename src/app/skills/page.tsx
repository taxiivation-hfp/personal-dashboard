import { getDb } from "@/lib/db/client";
import { listSkills } from "@/lib/queries";
import { todayISO } from "@/lib/dates";
import SkillsEditor from "@/components/SkillsEditor";

export const dynamic = "force-dynamic";

// Its own tab title, same ruling as /goals and /habits: this is a screen you open
// BECAUSE you want to change something.
export const metadata = { title: "Skills" };

export default async function SkillsPage() {
  const db = await getDb();
  return <SkillsEditor initial={await listSkills(db, todayISO())} />;
}
