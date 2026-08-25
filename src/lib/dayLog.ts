// THE WRITTEN RECORD, gathered by day.
//
// Everything in this app that holds the owner's own WORDS lives in a different table and,
// until now, on a different screen: journal pages on /journal, workouts on /sessions, skill
// sessions inside a pillar drill-down, drift reasons nowhere at all. Each of those screens
// answers "show me my gym log" or "show me my diary". None of them answers the question the
// owner actually asks, which is "what did I write down on the 12th".
//
// This module is the shape of that answer, and it is deliberately a READER. It writes
// nothing, derives nothing new, and adds no table: every entry below already exists and is
// already owned by the surface that created it. A combined log that stored its own copy
// would be a second record to keep in step, and the two would eventually disagree about a
// day — which is exactly the failure the app's shared `sessions.ts` exists to prevent.
//
// PURE and import-free, so it runs under `node --test` with no dependencies, on the same
// terms as rings.ts, goals.ts and dates.ts. The SQL lives in queries.ts; what lives here is
// the merge and the ordering, which is the part with rules in it.

/** What a single written thing IS. The discriminator every consumer switches on. */
export type LogKind =
  | "journal"
  | "gym"
  | "skill"
  | "outreach"
  | "reading"
  | "ascnd"
  | "drift";

export type LogEntry = {
  kind: LogKind;
  /** The row's own id in its own table, so a consumer can open the real thing. Journal
   *  pages and sessions have one; a drift reason is identified by its block instead. */
  id: number | null;
  date: string;
  /**
   * The heading — a session's first line, a journal page's opening words, a drifted block's
   * title. NEVER invented: when there is nothing to show this is null and the consumer says
   * so in its own voice, rather than this module inventing "Untitled" and every screen
   * inheriting a word the owner never typed.
   */
  title: string | null;
  /** The rest of it, where there is a rest. A drawing has none — its page is an image. */
  body: string | null;
  /**
   * A short qualifier the consumer prints beside the title: the workout kind, the skill's
   * name, "drawing". Not a label for the KIND — that is `kind`'s job, and a consumer that
   * had to parse this string to know what it was holding would be a consumer that breaks
   * when the wording changes.
   */
  meta: string | null;
  /**
   * How many A4 sheets a handwritten page runs to — a drawing is a SCROLL of sheets since
   * 2026-08-25 (see sheets.ts), and a reader that draws only the first would show a page
   * cut off at the eighteenth line. `null` for a typed page, which has no sheets; absent on
   * every non-journal entry, and absent on a journal entry from a source that never asked.
   * Optional so that nothing already holding a LogEntry has to learn about paper.
   */
  sheets?: number | null;
};

export type LogDay = { date: string; entries: LogEntry[] };

/**
 * The order entries take WITHIN a day, and it is an argument rather than a preference.
 *
 * The journal leads because it is the only entry that is about the day AS A WHOLE — the
 * others are about a thing that happened during it. Sessions follow in the order the body
 * did them; the document habits after them, in the checklist's own order (outreach,
 * reading, then ASC.ND — the 2026-08-24 addition, seeded after the others). Drift reasons
 * come last because they are the smallest and the most incidental: a line explaining why
 * an afternoon went elsewhere is a footnote to a day, not its opening.
 *
 * This is the ONLY place that order is decided. A screen sorting these itself would be a
 * second opinion about the same day.
 */
const ORDER: Record<LogKind, number> = {
  journal: 0,
  gym: 1,
  skill: 2,
  outreach: 3,
  reading: 4,
  ascnd: 5,
  drift: 6,
};

/**
 * Group loose entries into days, newest day first, entries within a day in ORDER.
 *
 * Days with NOTHING written are omitted entirely rather than returned empty. A continuous
 * scroll of mostly-blank days is a scroll that says "you wrote nothing" fourteen times for
 * every once it says something, and this app does not draw absence as a result — the same
 * ruling that makes a day with no entry draw nothing at all on the charts.
 */
export function groupByDay(entries: LogEntry[]): LogDay[] {
  const byDate = new Map<string, LogEntry[]>();
  for (const e of entries) {
    const list = byDate.get(e.date) ?? [];
    list.push(e);
    byDate.set(e.date, list);
  }
  return [...byDate.entries()]
    .sort((a, b) => b[0].localeCompare(a[0]))
    .map(([date, list]) => ({
      date,
      entries: list.sort(
        (a, b) =>
          ORDER[a.kind] - ORDER[b.kind] ||
          // Within a kind, by id — which is insertion order, so two lifts on one Tuesday
          // read in the order they were written rather than in whatever order the join
          // happened to return them.
          (a.id ?? 0) - (b.id ?? 0),
      ),
    }));
}

/**
 * The first non-empty line of a note, and nothing else.
 *
 * Deliberately NOT imported from sessions.ts even though that module owns the same rule for
 * gym and skill sessions: this one also has to cope with a journal page's body and a drift
 * reason, neither of which is a session, and sessions.ts takes a `SessionDoc` with a stored
 * `title` that can win. Rather than widen that type to cover things that are not sessions,
 * the trivial part is restated here — and the callers that DO hold a session still go
 * through sessions.ts, so the rule with the stored-title exception has exactly one home.
 */
export function firstLine(text: string | null | undefined): string | null {
  if (!text) return null;
  for (const line of text.split(/\r?\n/)) {
    const t = line.trim();
    if (t) return t;
  }
  return null;
}
