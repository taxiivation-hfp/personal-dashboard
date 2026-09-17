// The CAREER ring — goals measured against their own pace. PURE: no DB, no React. Its only
// imports are ./dates.ts and ./rings.ts, both import-free, so it runs under `node --test`
// with no setup (the adherence.ts arrangement).
//
// The owner's ruling of 2026-09-18. Career fills from GOALS, and only from goals: calendar
// blocks are not linked to them, the Basil project-hours lap is gone, and skills are not
// part of Career. A goal is a project; its subgoals are its subtasks; `progress` is the
// existing goals.ts rule (the sum of done subgoal weights), derived on read and never here.
//
// WHICH GOALS COUNT: status 'active' AND a deadline, AND created on or before the day being
// viewed. A goal with no deadline has no pace to be on, so it has nothing to say to a ring —
// it still lists when Career is opened. A done or dropped goal has left the ring. A goal made
// after the viewed day was never part of it.
//
// EACH COUNTED GOAL IS ONE EQUAL ARC, filled by whether it is ON PACE:
//
//   expected = clamp((today − created) ÷ (deadline − created), 0, 1)
//   fill     = min(1, progress ÷ expected), and 1 when nothing is expected yet
//
// So a goal half-way through its time and half-way done is a full arc, and a goal created
// this morning is full because nothing is expected of it yet. PAST THE DEADLINE expected is
// 1 and the arc shows actual progress; it stays in the ring until it is ticked done or
// dropped. No red, no "overdue" wording — a thin arc is information, not a verdict.
//
// Career % is the MEAN of the counted arcs. No counted goals is not 0%: it is null, drawn as
// an empty dashed ghost labelled "no goals".
//
// `today` is always passed in, never read, so every function here is testable and a past
// day can be viewed against its own date. Dates are local 'YYYY-MM-DD' strings throughout.

import { daysBetween, isISODate } from "./dates.ts";
import {
  PILLAR_NAME,
  type CareerArc,
  type CareerRingView,
} from "./rings.ts";

/** What the ring needs of a goal. GoalView (queries.ts) satisfies it. */
export type CareerGoal = {
  id: number;
  title: string;
  status: string;
  /** 'YYYY-MM-DD', or null for a goal with no deadline. */
  deadline: string | null;
  /** The LOCAL date the goal was created, 'YYYY-MM-DD'. */
  createdAt: string;
  /** 0..1, from goals.ts. */
  progress: number;
};

const clamp01 = (n: number): number =>
  Number.isFinite(n) ? Math.min(1, Math.max(0, n)) : 0;

/** Does this goal take an arc? Active, with a real deadline. */
export function countsTowardCareer(
  g: Pick<CareerGoal, "status" | "deadline">,
): g is Pick<CareerGoal, "status"> & { deadline: string } {
  return g.status === "active" && isISODate(g.deadline);
}

/**
 * Did this goal exist on the day being viewed? A goal is only ever in the ring of a day at or
 * after its creation — see `buildCareerRing` for why that is a filter rather than a fill.
 */
export function existedOn(createdAt: string, today: string): boolean {
  // An unreadable stamp keeps the goal rather than hiding it: queries.ts already falls back
  // to the first ten characters of a corrupt `created_at`, and a goal is a thing the owner
  // wrote down — it should not vanish from a ring because its date is unparseable.
  return !isISODate(createdAt) || createdAt <= today;
}

/**
 * How much of the goal should be done by `today`, 0..1.
 *
 * - PAST the deadline: 1, always — the arc then shows actual progress.
 * - Otherwise the elapsed share of the goal's own span, clamped. A goal created today
 *   expects 0. (A day BEFORE the goal existed also computes 0 here, but no ring is ever
 *   built from one: `buildCareerRing` drops the goal from that day entirely.)
 * - A goal whose deadline is on or before its creation day has no span to divide. Until
 *   that deadline has passed nothing is expected of it (the created-today rule); after, it
 *   is past its deadline like any other.
 */
export function expectedProgress(
  createdAt: string,
  deadline: string,
  today: string,
): number {
  if (today > deadline) return 1;
  if (!isISODate(createdAt)) return 0;
  const span = daysBetween(createdAt, deadline);
  if (span <= 0) return 0;
  return clamp01(daysBetween(createdAt, today) / span);
}

/**
 * The arc's fill: progress against pace, capped at 1. `expected <= 0` is a full arc —
 * nothing is expected of the goal yet, so nothing can be behind.
 */
export function paceFill(progress: number, expected: number): number {
  if (!(expected > 0)) return 1;
  return Math.min(1, clamp01(progress) / expected);
}

const MONTHS = [
  "Jan", "Feb", "Mar", "Apr", "May", "Jun",
  "Jul", "Aug", "Sep", "Oct", "Nov", "Dec",
];

/**
 * "due 30 Sep" — with the year only when it is not `today`'s year ("due 3 Feb 2027").
 * Written out rather than Intl so the words never depend on the ICU build.
 */
export function dueLabel(deadline: string, today: string): string {
  const [y, m, d] = deadline.split("-").map(Number);
  const year = today.slice(0, 4) === deadline.slice(0, 4) ? "" : ` ${y}`;
  return `due ${d} ${MONTHS[(m ?? 1) - 1] ?? ""}${year}`;
}

/** A goal's line under the Career ring: "60% · due 30 Sep". The percentage is the goal's
 *  real progress (rounded, the app's convention), not its pace. */
export function goalFact(
  progress: number,
  deadline: string,
  today: string,
): string {
  return `${Math.round(clamp01(progress) * 100)}% · ${dueLabel(deadline, today)}`;
}

/**
 * The CAREER ring for the day `today`: one equal arc per counted goal, soonest deadline
 * first (then oldest goal first), and the mean of their fills.
 *
 * A GOAL THAT DID NOT EXIST YET IS NOT IN A PAST DAY'S RING. Without that filter the
 * created-today rule ("nothing is expected of it yet" → a full arc) would also apply to every
 * day before the goal was written down, so stepping back a week would show Career filled by
 * work that had not been decided on — a past day growing a figure out of something done
 * since, which is the backdating rule this app already runs under for tasks. Dropped, the day
 * simply has one arc fewer, or the "no goals" ghost.
 *
 * Goals are not versioned otherwise: a past day still shows TODAY's progress against the pace
 * that day expected. That is stated in /api/rings and is the only honest thing available —
 * nothing records what a goal's progress was on a Tuesday.
 */
export function buildCareerRing(
  goals: CareerGoal[],
  today: string,
): CareerRingView {
  const counted = goals
    .filter((g) => existedOn(g.createdAt, today))
    .filter((g): g is CareerGoal & { deadline: string } =>
      countsTowardCareer(g),
    )
    .sort((a, b) => a.deadline.localeCompare(b.deadline) || a.id - b.id);

  const n = counted.length;
  const arcs: CareerArc[] = counted.map((g) => {
    const expected = expectedProgress(g.createdAt, g.deadline, today);
    return {
      key: `goal-${g.id}`,
      label: g.title,
      weight: 1 / n,
      fill: paceFill(g.progress, expected),
      fact: goalFact(g.progress, g.deadline, today),
      goalId: g.id,
      deadline: g.deadline,
      progress: clamp01(g.progress),
      expected,
    };
  });

  return {
    key: "portfolio",
    name: PILLAR_NAME.portfolio,
    // A plain mean — the arcs are equal. Summed from the fills rather than through the
    // weights, so 1/3 + 1/3 + 1/3 can never read 99.99%.
    fill: n ? arcs.reduce((s, a) => s + (a.fill ?? 0), 0) / n : null,
    arcs,
  };
}
