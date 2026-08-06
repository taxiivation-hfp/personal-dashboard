import { getDb } from "@/lib/db/client";
import { getPillars } from "@/lib/queries";
import ColourEditor from "@/components/ColourEditor";

export const dynamic = "force-dynamic";

export default async function ColoursPage() {
  const db = await getDb();
  return <ColourEditor initial={await getPillars(db)} />;
}
