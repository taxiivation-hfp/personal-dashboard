// Goal progress. PURE — no DB, no React, zero imports, so it runs under `node --test`.
//
// Progress is the SUM OF COMPLETED SUBGOAL WEIGHTS. Nothing is inferred from activity
// and no count of finished tasks feeds it — that would be an output measure, which this
// app does not keep.
//
// Goals are the ONE sanctioned accomplishment measure here, and they are quarantined:
// this number feeds nothing else — not adherence, not the streak, not the rings, not the
// coach. That isolation is what keeps "did I do what I said I'd do" from quietly
// becoming "how much did I finish".
//
// weight = 0 means AUTO: the subgoal takes an equal share of whatever the explicit
// overrides leave behind. 0 is already the column default in schema.sql and already
// passes its CHECK, and a subgoal explicitly worth 0% is meaningless — so the value is
// free to carry this meaning and no migration is needed.

export type WeightedSubgoal = { weight: number; done: boolean };

export type WeightBreakdown = {
  /** Parallel to the input. What each subgoal is actually worth right now. */
  effective: number[];
  /** 0..1. */
  progress: number;
  overrideSum: number;
  /** True ONLY when explicit overrides exceed 100% — the one genuinely broken case.
   *  An all-auto goal is well-formed and must never warn. */
  overAllocated: boolean;
};

export function deriveWeights(subgoals: WeightedSubgoal[]): WeightBreakdown {
  // A negative weight is treated as auto rather than as a subtraction: the column's
  // CHECK forbids it, so if one ever appears it is corruption, and silently reducing a
  // goal's progress would be the worst possible response.
  const isOverride = (w: number) => w > 0;

  const overrideSum = subgoals.reduce(
    (s, x) => s + (isOverride(x.weight) ? x.weight : 0),
    0,
  );
  const autoCount = subgoals.filter((x) => !isOverride(x.weight)).length;
  const autoShare =
    autoCount > 0 ? Math.max(0, 1 - overrideSum) / autoCount : 0;

  const effective = subgoals.map((x) =>
    isOverride(x.weight) ? x.weight : autoShare,
  );
  const done = subgoals.reduce((s, x, i) => s + (x.done ? effective[i] : 0), 0);

  return {
    effective,
    progress: Math.min(1, Math.max(0, done)),
    overrideSum,
    overAllocated: overrideSum > 1 + 1e-9,
  };
}

// ------------------------------------------------------------------ COUNTED GOALS
//
// A goal whose progress is a COUNT rather than a checklist — the owner's ruling,
// 2026-09-20, overruling the note left on /api/goals's POST that `target_count` was
// deliberately unwired because "deriving progress from a count of completed items was an
// output measure". The argument that reverses it: a counter is a COMPRESSION OF A
// CHECKLIST, not a new kind of measure. "NeetCode, 1 of 150" and 150 subgoals with one
// ticked say exactly the same thing about exactly the same commitment; the counter just
// does not cost 150 rows and a page you cannot read. It still rates nothing about HOW the
// problems were solved, which is the line this app actually draws.
//
// What keeps that true, and what must not be built on top of it: NO STREAK on a count, no
// problems-per-week chart, no total across goals. The number exists to fill one goal's own
// arc against its own deadline, and it reaches nothing else — the same quarantine goal
// progress has always had.
//
// A COUNT AND SUBGOALS ARE EXCLUSIVE. A goal with a target counts, full stop; weighing a
// tally against a checklist would need a second rule about what each is worth, and two
// rules about one number is how two screens end up disagreeing about the same goal.

/** A goal's tally. `target` null (or ≤ 0) means this is not a counted goal. */
export type GoalCount = { done: number; target: number | null };

/** Is this goal counted? Narrowed so callers get a real target out of it. */
export function isCounted(c: GoalCount | null): c is { done: number; target: number } {
  return !!c && Number.isFinite(c.target) && (c.target ?? 0) > 0;
}

/**
 * A counted goal's progress, 0..1. Clamped at BOTH ends for the same reason
 * `workedFraction` is: above 1 a goal would claim more than it is, and below 0 doing a
 * problem could lower the figure. 18 of 50 is 0.36 — the true fraction, which is the whole
 * point of counting instead of ticking blocks of ten.
 */
export function countedProgress(done: number, target: number): number {
  if (!(target > 0) || !Number.isFinite(done)) return 0;
  return Math.min(1, Math.max(0, done / target));
}

/**
 * THE ONE PLACE a goal's progress is decided, whichever kind it is. Every reader takes the
 * number this returns and none of them knows or cares where it came from — which is why
 * career.ts, the timeline card and the tracker needed no change to gain counted goals.
 */
export function goalProgress(
  count: GoalCount | null,
  subgoals: WeightedSubgoal[],
): number {
  if (isCounted(count)) return countedProgress(count.done, count.target);
  return deriveWeights(subgoals).progress;
}
