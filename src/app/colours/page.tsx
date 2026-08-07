import { getDb } from "@/lib/db/client";
import { getPillars } from "@/lib/queries";
import ColourEditor from "@/components/ColourEditor";

export const dynamic = "force-dynamic";

// Its own tab title. Without one it inherits the layout's and every screen in the app is
// called "Today" — which is exactly wrong on the three screens you open BECAUSE you want to
// change something about tomorrow.
export const metadata = { title: "Colours" };

export default async function ColoursPage() {
  const db = await getDb();
  return <ColourEditor initial={await getPillars(db)} />;
}
