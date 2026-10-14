// The CAREER ring. PURE: no DB, no React. Its imports are ./dates.ts, ./rings.ts and
// ./subtasks.ts, none of which import anything further, so it runs under `node --test`
// with no setup.
//
// THE OWNER'S RULING OF 2026-10-15, replacing the pace rule of 2026-09-18. Career is TWO
// HALVES:
//
//   HOURS      half the ring. Work Projects (Basil) hours worked in the rolling fortnight,
//              by the app's one definition of a worked hour (productivity.ts: adhered is
//              whole, a drift is its slider fraction, a skip is nothing). CAREER_HOURS of
//              them fill the half. Unresolvable (no calendar) is a GHOST arc, never zero.
//
//   DEADLINES  the other half, split EQUALLY across the goals that can be late. A goal's
//              slice is FULL unless something in it is LATE, and then it is EMPTY — a cliff,
//              from the day after the date, no ramp. Late means: a dated subtask unticked
//              past its date, or the goal itself past its deadline and not finished. Nothing
//              is subtracted before a date has passed, however little is done.
//
//              COUNTED GOALS (goals.ts) keep the PACE rule in the run-up, because a count is a
//              pace by nature and a 1-of-150 that read full for three months would be the
//              exact absence of urgency this change exists to fix: fill = progress ÷ the
//              elapsed share of the goal's span. Past the date, late like any other: empty.
//
// WHICH GOALS COUNT: status 'active', created on or before the viewed day, and holding
// SOMETHING THAT CAN BE LATE — a deadline, or a dated subtask. A goal with neither has
// nothing to fail at; it still lists when Career is opened. No goal that can be late is a
// ghost half, and Career is then the hours alone.
//
// `today` is always passed in, never read, so a past day is judged against its own date:
// lateness by the dates, done-ness by `done_on` (subtasks.ts). Counts are not versioned, so
// a past day sees today's tally — the one place this ring still reads the present.

import { daysBetween, isISODate } from "./dates.ts";
import {
  PILLAR_NAME,
  weightedFill,
  type CareerArc,
  type CareerRingView,
} from "./rings.ts";
import {
  daysLate,
  doneOn,
  subtaskExistedOn,
  type DatedSubtask,
} from "./subtasks.ts";

/** Work Projects hours that fill the hours half, per rolling fortnight. */
export const CAREER_HOURS = 48;

/** What the ring needs of a goal. GoalView (queries.ts) satisfies it. */
export type CareerGoal = {
  id: number;
  title: string;
  status: string;
  /** 'YYYY-MM-DD', or null. */
  deadline: string | null;
  /** The LOCAL date the goal was created, 'YYYY-MM-DD'. */
  createdAt: string;
  /** 0..1, from goals.ts. */
  progress: number;
  /** A COUNTED goal's tally, or null for a checklist goal. */
  count: { done: number; target: number } | null;
  subgoals: DatedSubtask[];
};

/** The fortnight's Work Projects hours. `resolved` false = the calendar did not answer. */
export type CareerHours = { hours: number; resolved: boolean };

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/** Did this goal exist on the day being viewed? An unreadable stamp keeps the goal. */
export function existedOn(createdAt: string, today: string): boolean {
  return !isISODate(createdAt) || createdAt <= today;
}

/** The goal's subtasks that existed on `today`. */
const subtasksOn = (g: CareerGoal, today: string): DatedSubtask[] =>
  g.subgoals.filter((s) => subtaskExistedOn(s.createdAt, today));

/** Does this goal take a slice on `today`? Active, existed, and something in it can be late. */
export function countsTowardCareer(g: CareerGoal, today: string): boolean {
  if (g.status !== "active" || !existedOn(g.createdAt, today)) return false;
  return (
    isISODate(g.deadline) ||
    subtasksOn(g, today).some((s) => isISODate(s.due))
  );
}

/** What is late in a goal: the most overdue item, named, and by how many days. */
export type Lateness = { item: string; days: number };

/**
 * The most overdue thing in a goal on `today`, or null when nothing is.
 *
 * The goal's own deadline is an item like any other: past it and not finished, the goal is
 * late by the days since. "Finished" is every subtask ticked as of that day for a checklist
 * goal (a goal with no subtasks has done nothing), or the full count for a counted one.
 */
export function lateness(g: CareerGoal, today: string): Lateness | null {
  let worst: Lateness | null = null;
  const consider = (item: string, days: number) => {
    if (days > 0 && (!worst || days > worst.days)) worst = { item, days };
  };
  const subs = subtasksOn(g, today);
  for (const s of subs) consider(s.title, daysLate(s, today));
  if (isISODate(g.deadline) && today > g.deadline) {
    const finished = g.count
      ? g.count.done >= g.count.target
      : subs.length > 0 && subs.every((s) => doneOn(s, today));
    if (!finished) consider("deadline", daysBetween(g.deadline, today));
  }
  return worst;
}

/**
 * How much of a COUNTED goal should be done by `today`, 0..1 — the elapsed share of its own
 * span, clamped. A goal created today expects 0; on or past the deadline, 1. A deadline on
 * or before the creation day has no span, so nothing is expected until it has passed.
 */
export function expectedProgress(
  createdAt: string,
  deadline: string,
  today: string,
): number {
  if (today >= deadline) return 1;
  if (!isISODate(createdAt)) return 0;
  const span = daysBetween(createdAt, deadline);
  if (span <= 0) return 0;
  return clamp01(daysBetween(createdAt, today) / span);
}

/** Progress against pace, capped at 1. `expected <= 0` is a full arc — nothing is expected
 *  of the goal yet, so nothing can be behind. */
export function paceFill(progress: number, expected: number): number {
  if (!(expected > 0)) return 1;
  return Math.min(1, clamp01(progress) / expected);
}

/** A goal's slice fill and its line, by the rules above. */
export function goalArcFill(
  g: CareerGoal,
  today: string,
): { fill: number; fact: string; late: Lateness | null } {
  const late = lateness(g, today);
  if (late) return { fill: 0, fact: `late · ${late.item} · ${late.days}d`, late };
  if (g.count && isISODate(g.deadline)) {
    const fill = paceFill(
      g.progress,
      expectedProgress(g.createdAt, g.deadline, today),
    );
    return { fill, fact: fill >= 1 ? "on pace" : "behind pace", late: null };
  }
  return { fill: 1, fact: "on time", late: null };
}

/** "31.5 of 48 h" — one decimal only when it is not whole. */
export function hoursFact(hours: number): string {
  const h = Math.max(0, Number.isFinite(hours) ? hours : 0);
  const shown = Math.round(h * 10) / 10;
  return `${shown} of ${CAREER_HOURS} h`;
}

/** The hours half's fill: min(1, hours ÷ CAREER_HOURS), or null when unresolved. */
export function hoursFill(h: CareerHours): number | null {
  if (!h.resolved) return null;
  return clamp01(h.hours / CAREER_HOURS);
}

/**
 * The CAREER ring for the day `today`: the hours arc (half the circle), then one equal arc
 * per counted goal sharing the other half, soonest deadline first (undated last, then
 * oldest goal first). Career is the weighted mean of the arcs that have a fill — a ghost
 * half is left out, never counted as 0 — and null only when both halves are ghosts.
 *
 * A GOAL THAT DID NOT EXIST YET IS NOT IN A PAST DAY'S RING, nor is a subtask: stepping back
 * a week must not show a day failing at something that had not been decided on. Dropped,
 * the day simply has one arc fewer.
 */
export function buildCareerRing(
  goals: CareerGoal[],
  today: string,
  hours: CareerHours,
): CareerRingView {
  const counted = goals
    .filter((g) => countsTowardCareer(g, today))
    .sort(
      (a, b) =>
        (a.deadline ?? "9999").localeCompare(b.deadline ?? "9999") ||
        a.id - b.id,
    );

  const arcs: CareerArc[] = [
    {
      key: "hours",
      label: "Work Projects",
      weight: 0.5,
      fill: hoursFill(hours),
      // A ghost prints a dash, the app's word for "nobody measured".
      fact: hours.resolved ? hoursFact(hours.hours) : "—",
      goalId: null,
    },
  ];

  const n = counted.length;
  if (n === 0) {
    arcs.push({
      key: "no-goals",
      label: "no goals",
      weight: 0.5,
      fill: null,
      fact: "—",
      goalId: null,
    });
  } else {
    for (const g of counted) {
      const { fill, fact } = goalArcFill(g, today);
      arcs.push({
        key: `goal-${g.id}`,
        label: g.title,
        weight: 0.5 / n,
        fill,
        fact,
        goalId: g.id,
      });
    }
  }

  return {
    key: "portfolio",
    name: PILLAR_NAME.portfolio,
    fill: weightedFill(arcs),
    arcs,
  };
}
