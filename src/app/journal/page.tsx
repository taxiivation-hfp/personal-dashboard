import { redirect } from "next/navigation";

/**
 * THE JOURNAL PAGE IS GONE — the owner's ruling, 2026-09-03: the archive folded into the
 * written log on the record, which already listed every page by month and now also opens
 * them for rewriting. Two shelves for one set of pages meant two places to look.
 *
 * A redirect rather than a deletion, because this address is bookmarkable and linked from
 * old sessions — removing a route must never strand a screen.
 */
export default function JournalPage() {
  redirect("/stats?view=log");
}
