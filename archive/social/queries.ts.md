# Social in the read models

Parked verbatim from `src/lib/queries.ts` at commit `c86f000` by the owner's ruling of 2026-09-18 (see README.md).
Each block below is an exact slice of that file; the heading gives its original line range.

## `src/lib/queries.ts:308-351` — EventWork / eventWorkIn — the adhered-event map the Social ring and the project lap read

```ts
/** What a marked calendar event was worth over a window: its state, and how much of it was
 *  worked. */
export type EventWork = { state: BlockState; worked: number };

/**
 * Marked calendar events over a window, by event id — the state AND the worked fraction.
 *
 * It used to be `adheredEventIds`, a bare Set of ids marked 'adhered', because the two ring
 * consumers wanted the same thing from it. They no longer do, and the split is the whole
 * reason this returns a map:
 *
 *   - THE SOCIAL RING wants `state === 'adhered'`, strictly. An event on the calendar you
 *     drifted from is not a social fortnight you had, and the fraction has nothing to say
 *     about it — a social event is a thing that happened, not a quantity of hours, so half
 *     an evening out is not half a social event.
 *   - THE PORTFOLIO LAP wants `worked`, because it is measured in HOURS, and an hour worked
 *     is an hour worked wherever it is read.
 *
 * One query rather than two over the same rows, and one place where a fifth reader of the
 * state table would otherwise have appeared.
 */
export async function eventWorkIn(
  db: Client,
  from: string,
  to: string,
): Promise<Map<string, EventWork>> {
  const r = await db.execute({
    sql: `SELECT event_id,state,worked_fraction FROM block_marks
          WHERE date BETWEEN ? AND ?`,
    args: [from, to],
  });
  const m = new Map<string, EventWork>();
  for (const x of r.rows) {
    const state = String(x.state) as BlockState;
    m.set(String(x.event_id), {
      state,
      worked: workedFraction(
        state,
        x.worked_fraction == null ? null : Number(x.worked_fraction),
      ),
    });
  }
  return m;
}
```

## `src/lib/queries.ts:964-1025` — PillarFacts / getPillarFacts with the outreach count

```ts
/**
 * Raw counts for every ring metric over [from, to] inclusive.
 *
 * `resolved` says whether the SOURCE wired up — never whether it found rows. Zero rows
 * in the window is a real, meaningful zero and must stay distinguishable from a metric
 * that has no source at all, or a first day reads as a fortnight of neglect.
 */
/**
 * The plain-words fortnight, one line per pillar.
 *
 * Separate from getRingCounts on purpose. That function answers "how full is the ring",
 * which is a capped, weighted, sufficiency question; this answers "what actually happened",
 * which is a raw count and must never cap. Deriving one from the other would have meant the
 * caption inheriting the ring's cap and printing "8 sessions" on a fortnight of twenty.
 *
 * Grape calendar events are deliberately NOT counted here. The owner logs sessions by hand
 * and does not want them counted twice; the caption follows the ring's rule.
 */
export type PillarFacts = {
  /** Portfolio: skill SESSIONS in the window. Was summed minutes — skills log documents
   *  now, not hours, so the caption counts what the ring counts. */
  skillSessions: number;
  /** Physical: gym_sessions ROWS in the window. Sessions, not days. */
  workoutSessions: number;
  /** Social: outreach non-negotiable ticks in the window. */
  outreach: number;
};

export async function getPillarFacts(
  db: Client,
  from: string,
  to: string,
): Promise<PillarFacts> {
  const [skillRows, sessions, out] = await Promise.all([
    // SESSIONS, not summed minutes — skills stopped being measured in hours. Rows that
    // still carry a `minutes` value are pre-ruling history and count as one session each,
    // which is what they always were.
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM skill_time WHERE date BETWEEN ? AND ?",
      args: [from, to],
    }),
    db.execute({
      sql: "SELECT COUNT(*) AS n FROM gym_sessions WHERE date BETWEEN ? AND ?",
      args: [from, to],
    }),
    db.execute({
      sql: `SELECT COUNT(DISTINCT e.date) AS n
              FROM habit_entries e
              JOIN habits h ON h.id = e.habit_id
             WHERE h.system_key = 'outreach' AND e.value > 0
               AND e.date BETWEEN ? AND ?`,
      args: [from, to],
    }),
  ]);
  // num() at the boundary, every time: libSQL returns aggregates as BigInt and
  // `bigint / number` throws.
  return {
    skillSessions: num(skillRows.rows[0].n),
    workoutSessions: num(sessions.rows[0].n),
    outreach: num(out.rows[0].n),
  };
}
```

## `src/lib/queries.ts:1027-1048` — getRingCounts head, with the external (calendar) counts parameter

```ts
export async function getRingCounts(
  db: Client,
  from: string,
  to: string,
  /**
   * Counts this function cannot get from the database.
   *
   * Calendar events are never persisted — they are read live from Google — so a metric
   * sourced from them has to be counted by the caller that already holds the range. Keyed
   * by metric key; a key that is absent is treated as an unresolved source rather than a
   * zero, so a Google outage reads as "no data" instead of "you did nothing".
   */
  external: Record<string, number | undefined> = {},
): Promise<Record<string, RawCount>> {
  const out: Record<string, RawCount> = {};

  for (const m of METRICS) {
    if (!m.sourceReady) {
      out[m.key] = { count: 0, resolved: false };
      continue;
    }

```

## `src/lib/queries.ts:1074-1082` — the calendar_social / calendar_project_hours branch

```ts
    // Both calendar-sourced metrics come from the caller: Google events are never
    // persisted, so whoever already holds the range counts them. An absent key is an
    // UNRESOLVED source rather than a zero — a Google outage must read "no data", not
    // "you did nothing".
    if (m.source === "calendar_social" || m.source === "calendar_project_hours") {
      const n = external[m.key];
      out[m.key] = n == null ? { count: 0, resolved: false } : { count: n, resolved: true };
      continue;
    }
```
