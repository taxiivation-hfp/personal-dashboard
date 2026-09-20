import { test } from "node:test";
import assert from "node:assert/strict";
import {
  countedProgress,
  deriveWeights,
  goalProgress,
  isCounted,
} from "./goals.ts";

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

test("all-auto subgoals split evenly", () => {
  const r = deriveWeights([
    { weight: 0, done: true },
    { weight: 0, done: true },
    { weight: 0, done: false },
    { weight: 0, done: false },
  ]);
  r.effective.forEach((w) => close(w, 0.25));
  close(r.progress, 0.5);
  assert.equal(r.overAllocated, false);
});

test("the eight seeded subgoals keep their explicit weights", () => {
  const r = deriveWeights([
    { weight: 0.3, done: true },
    { weight: 0.25, done: true },
    { weight: 0.25, done: false },
    { weight: 0.2, done: false },
  ]);
  assert.deepEqual(r.effective, [0.3, 0.25, 0.25, 0.2]);
  close(r.progress, 0.55);
});

test("autos split only what the overrides leave behind", () => {
  const r = deriveWeights([
    { weight: 0.4, done: false },
    { weight: 0, done: false },
    { weight: 0, done: false },
  ]);
  close(r.effective[0], 0.4);
  close(r.effective[1], 0.3);
  close(r.effective[2], 0.3);
});

test("progress is 0 with no subgoals and nothing is over-allocated", () => {
  const r = deriveWeights([]);
  assert.equal(r.progress, 0);
  assert.deepEqual(r.effective, []);
  assert.equal(r.overAllocated, false);
});

// The one genuinely broken case. An all-auto goal must NOT trip this — under the old
// weightSum test it would have warned "weights total 0%, not 100%" on a well-formed goal.
test("overAllocated fires only when explicit overrides exceed 100%", () => {
  assert.equal(
    deriveWeights([{ weight: 0, done: false }]).overAllocated,
    false,
  );
  assert.equal(
    deriveWeights([
      { weight: 0.6, done: false },
      { weight: 0.6, done: false },
    ]).overAllocated,
    true,
  );
});

test("over-allocation leaves autos with nothing rather than a negative share", () => {
  const r = deriveWeights([
    { weight: 0.7, done: false },
    { weight: 0.7, done: false },
    { weight: 0, done: true },
  ]);
  close(r.effective[2], 0);
  close(r.progress, 0);
});

test("progress never exceeds 1 even when overrides do", () => {
  const r = deriveWeights([
    { weight: 0.8, done: true },
    { weight: 0.8, done: true },
  ]);
  close(r.progress, 1);
});

test("a negative weight is treated as auto, not as a subtraction", () => {
  const r = deriveWeights([
    { weight: -0.5, done: false },
    { weight: 0, done: false },
  ]);
  close(r.effective[0], 0.5);
  close(r.effective[1], 0.5);
});

// ------------------------------------------------------------------ counted goals

test("a counted goal's progress is the true fraction, not a block of ten", () => {
  // The case the rule was written for: 18 of 50 must read 36%, where five blocks of ten
  // could only ever say 20% or 40%.
  assert.equal(countedProgress(18, 50), 0.36);
  assert.equal(countedProgress(1, 150), 1 / 150);
});

test("a count clamps at both ends", () => {
  // Above 1 a goal claims more than it is; below 0 doing a problem would LOWER the figure.
  assert.equal(countedProgress(60, 50), 1);
  assert.equal(countedProgress(-3, 50), 0);
  assert.equal(countedProgress(5, 0), 0);
  assert.equal(countedProgress(Number.NaN, 50), 0);
});

test("a target of null, 0 or a non-number is not a counted goal", () => {
  assert.equal(isCounted(null), false);
  assert.equal(isCounted({ done: 4, target: null }), false);
  assert.equal(isCounted({ done: 4, target: 0 }), false);
  assert.equal(isCounted({ done: 4, target: 50 }), true);
});

test("goalProgress takes the count when there is one and the subgoals when there is not", () => {
  const subs = [
    { weight: 0, done: true },
    { weight: 0, done: false },
  ];
  // Counted wins outright — a count and subgoals are exclusive, so the checklist beside a
  // target is never weighed against it.
  assert.equal(goalProgress({ done: 18, target: 50 }, subs), 0.36);
  assert.equal(goalProgress({ done: 18, target: 50 }, []), 0.36);
  // No target: the subgoal rule, unchanged.
  assert.equal(goalProgress(null, subs), 0.5);
  assert.equal(goalProgress({ done: 0, target: null }, subs), 0.5);
  assert.equal(goalProgress(null, []), 0);
});
