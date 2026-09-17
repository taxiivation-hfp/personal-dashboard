import { redirect } from "next/navigation";

/**
 * SKILLS ARE HIDDEN, not deleted — the owner's ruling of 2026-09-18 (spec §1). Skills are not a
 * current focus and must not sit anywhere as an unfilled thing. Every skill row, session and
 * colour is KEPT in the database and `src/lib/queries.ts` still reads them; this route simply
 * has nowhere to send you. A redirect rather than a deletion, because the address is
 * bookmarkable — removing a route must never strand a screen.
 */
export default function SkillsPage() {
  redirect("/");
}
