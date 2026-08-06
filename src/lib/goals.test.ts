import { test } from "node:test";
import assert from "node:assert/strict";
import { deriveWeights } from "./goals.ts";

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
