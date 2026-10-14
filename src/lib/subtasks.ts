// Dated subtasks — when one is late, when it floats, and what its card says. PURE: its only
// import is ./dates.ts, which is import-free, so this runs under `node --test` with no
// setup (the tasks.ts arrangement, and the same rules where the two features overlap).
//
// The owner's ruling of 2026-10-15: a subtask may carry a DUE date. A dated subtask floats
// on the hero rails beside the day's one-off tasks from HORIZON_DAYS before its date, and
// once its date has passed it is LATE — which is what empties its goal's slice of the Career
// ring (career.ts). An undated subtask can be neither, and never floats.
//
// `done_on` IS THE DAY IT WAS TICKED, exactly as day_tasks records it, and for the same
// reason: lateness is judged against the day being viewed, so without a date on the tick a
// subtask ticked on Thursday would read as done on Tuesday and Tuesday's record would
// quietly improve. A tick with no date (a row from before the column existed) is taken as
// done since forever — the least-wrong reading of a fact with no place in a sequence.

import { daysBetween, isISODate } from "./dates.ts";

/** How many days before its date a dated subtask starts to float. */
export const HORIZON_DAYS = 7;

export type DatedSubtask = {
  id: number;
  title: string;
  /** 'YYYY-MM-DD', or null for an undated subtask. */
  due: string | null;
  done: boolean;
  /** The LOCAL day it was ticked, or null — null on a done row is a tick from before the
   *  column existed. */
  doneOn: string | null;
  /** The LOCAL day it was written down. */
  createdAt: string;
};

/** Did it exist on `day`? An unreadable stamp keeps the row rather than hiding it. */
export function subtaskExistedOn(createdAt: string, day: string): boolean {
  return !isISODate(createdAt) || createdAt <= day;
}

/** Was it done AS OF `day`? */
export function doneOn(
  s: Pick<DatedSubtask, "done" | "doneOn">,
  day: string,
): boolean {
  if (!s.done) return false;
  return s.doneOn == null || s.doneOn <= day;
}

/** Days past its date on `day`, or 0 — undated, done, or not yet due. */
export function daysLate(s: DatedSubtask, day: string): number {
  if (!isISODate(s.due) || doneOn(s, day)) return 0;
  return Math.max(0, daysBetween(s.due, day));
}

/**
 * Does this subtask's card belong on the day being VIEWED?
 *
 *   done          the day it was ticked, and only that day — a finished thing belongs to the
 *                 day you finished it, which is what keeps a past day's record true.
 *   in horizon    every day from HORIZON_DAYS before its date up to the date itself.
 *   past its date TODAY, and only today — the carry, exactly as a one-off task carries.
 *                 A past day between the date and today shows nothing, as it does for tasks:
 *                 a carrying item sits on one day.
 *
 * `today` is passed in rather than read, so the caller owns what "today" means.
 */
export function subtaskShowsOn(
  s: DatedSubtask,
  date: string,
  today: string,
): boolean {
  if (!isISODate(s.due) || !subtaskExistedOn(s.createdAt, date)) return false;
  if (s.done) return s.doneOn === date;
  const ahead = daysBetween(date, s.due);
  if (ahead >= 0) return ahead <= HORIZON_DAYS;
  return date === today;
}

/**
 * The card's second line on `date`: "due in 3d", "due tomorrow", "due today", "late 2d" —
 * or null for a ticked card. A fact, never a penalty: no red, no "overdue", the same
 * register "carried 3d" takes on a one-off task.
 */
export function subtaskLine(s: DatedSubtask, date: string): string | null {
  if (!isISODate(s.due) || doneOn(s, date)) return null;
  const ahead = daysBetween(date, s.due);
  if (ahead === 0) return "due today";
  if (ahead === 1) return "due tomorrow";
  if (ahead > 1) return `due in ${ahead}d`;
  return `late ${-ahead}d`;
}
