// One-off tasks that carry themselves forward. Import-free on purpose, like rings.ts,
// goals.ts and dates.ts — `npm test` runs this file directly under `node --test`.

/**
 * A TASK IS NOT A NON-NEGOTIABLE, and the difference is the whole design.
 *
 * A non-negotiable is a standing rule with a weekday mask: "weigh in, every day". It is
 * scheduled by definition, it is the same list every Tuesday, and it is worth 30 points of
 * the day's adherence split evenly. A task is a single thing you decided to do on a
 * particular day — "book the physio" — and if you do not do it, it is still outstanding
 * tomorrow. Those two need different storage and they get it: `habits` + `habit_entries`
 * for the first, `day_tasks` for the second.
 *
 * THE CARRY IS DERIVED, NEVER WRITTEN. An undone task is not moved to tomorrow by a
 * nightly job; where it SITS is computed from where it started and what today is. That
 * removes the entire class of bug this feature is usually built with — a cron that runs
 * twice and moves a task two days, a cron that misses a day and strands it, a phone opened
 * at 2am rolling the day forward early. There is no job to fail, and reading the same task
 * twice cannot move it twice.
 *
 * TASKS DO NOT FEED ADHERENCE, and that is deliberate rather than an oversight. The 30-point
 * share is "non-negotiables ticked ÷ non-negotiables SCHEDULED, split evenly" — a fixed
 * denominator known at the start of the day. A carrying backlog is not scheduled: three
 * tasks you keep putting off would join today's denominator through no decision you made
 * today, so each non-negotiable would quietly become worth less and the day's ceiling would
 * drift out of reach. CLAUDE.md already settled this argument for the gym: "an item you are
 * designed to fail teaches distrust of the whole list". A task that has carried for a week
 * is exactly that item, and the fix is to keep it out of the score rather than to hide it.
 *
 * So the list is honest and unscored: it says what is outstanding, it never says you are
 * behind, and nothing about it can move a number.
 */

export type DayTask = {
  id: number;
  title: string;
  /** The day it was first FOR. Never rewritten — this is the task's origin, not its cursor. */
  due: string;
  /** The day it was ticked, or null. Ticking is what fixes a task to a date. */
  doneOn: string | null;
};

/** Whole days from a to b, UTC on the date parts — DST-immune, same as dates.ts. */
function daysBetween(a: string, b: string): number {
  const utc = (iso: string): number => {
    const [y, m, d] = iso.split("-").map(Number);
    return Date.UTC(y!, m! - 1, d!);
  };
  return Math.round((utc(b) - utc(a)) / 86_400_000);
}

/**
 * WHICH DAY a task currently sits on.
 *
 *   done          the day it was done. A finished task belongs to the day you finished it,
 *                 which is what makes yesterday's record still true when you read it back.
 *   due ahead     its own day. A task added for Friday sits on Friday until Friday.
 *   due passed    TODAY. This is the carry, and it is the whole of the carry.
 *
 * `today` is passed in rather than read from the clock so this stays pure and so the caller
 * decides what "today" means — which matters, because the app's day is Melbourne's, not the
 * server's.
 */
export function placementOf(task: DayTask, today: string): string {
  if (task.doneOn) return task.doneOn;
  // ISO dates compare lexically exactly as they compare chronologically, which is the one
  // thing the format is for.
  return task.due > today ? task.due : today;
}

/**
 * Does this task belong on the day being VIEWED?
 *
 * Placement is computed against the REAL today, never against the day being looked at. The
 * first version of this resolved it against `max(date, today)` — trying to be clever about
 * viewing the future — and the effect was that a task carrying on today also appeared on
 * every future day you opened, because on Friday's screen Friday is "today". A carrying task
 * sits on one day, and that day is today.
 */
export function showsOn(task: DayTask, date: string, today: string): boolean {
  return placementOf(task, today) === date;
}

/**
 * How many days a task has been carrying, or 0.
 *
 * Printed as a plain fact ("carried 3 days"), never as a penalty. No red, no "overdue", no
 * escalating styling — the honest-logging rule covers this list too: a task you keep not
 * doing is information, and a list that starts scolding is a list you stop writing to.
 */
export function carriedDays(task: DayTask, today: string): number {
  if (task.doneOn) return 0;
  return Math.max(0, daysBetween(task.due, today));
}

/**
 * The day's tasks, in the order they should read: outstanding first by oldest, then the
 * ones done today.
 *
 * Oldest-first among the outstanding is not a ranking, it is a queue — the thing that has
 * waited longest is the thing most likely to be forgotten again.
 */
export function tasksFor(
  all: DayTask[],
  date: string,
  today: string,
): DayTask[] {
  return all
    .filter((t) => showsOn(t, date, today))
    .sort((a, b) => {
      const ad = a.doneOn ? 1 : 0;
      const bd = b.doneOn ? 1 : 0;
      if (ad !== bd) return ad - bd;
      if (a.due !== b.due) return a.due < b.due ? -1 : 1;
      return a.id - b.id;
    });
}
