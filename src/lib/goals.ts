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

  const overrideSum = subgoals.reduce((s, x) => s + (isOverride(x.weight) ? x.weight : 0), 0);
  const autoCount = subgoals.filter((x) => !isOverride(x.weight)).length;
  const autoShare = autoCount > 0 ? Math.max(0, 1 - overrideSum) / autoCount : 0;

  const effective = subgoals.map((x) => (isOverride(x.weight) ? x.weight : autoShare));
  const done = subgoals.reduce((s, x, i) => s + (x.done ? effective[i] : 0), 0);

  return {
    effective,
    progress: Math.min(1, Math.max(0, done)),
    overrideSum,
    overAllocated: overrideSum > 1 + 1e-9,
  };
}
