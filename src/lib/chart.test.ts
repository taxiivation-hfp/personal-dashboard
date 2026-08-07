import { test } from "node:test";
import assert from "node:assert/strict";
import { brokenRuns, runPoints } from "./chart.ts";

// A straight line where the coordinate maths is irrelevant, so these tests are about the
// RUNS and nothing else.
const at = (i: number): [number, number] => [i, 0];

test("a solid series is one run", () => {
  assert.deepEqual(brokenRuns([1, 2, 3]), [[0, 2]]);
});

// The whole point of the file. A single polyline through the present days would join the
// two sides of the gap with a straight segment, which reads as steady change nobody
// measured — the chart inventing data exactly where the data is missing.
test("a gap BREAKS the run rather than being drawn through", () => {
  assert.deepEqual(brokenRuns([1, 2, null, 4, 5]), [
    [0, 1],
    [3, 4],
  ]);
});

test("several gaps make several runs", () => {
  assert.deepEqual(brokenRuns([1, null, 3, null, 5]), [
    [0, 0],
    [2, 2],
    [4, 4],
  ]);
});

test("leading and trailing gaps are not runs", () => {
  assert.deepEqual(brokenRuns([null, null, 3, 4, null]), [[2, 3]]);
  assert.deepEqual(brokenRuns([null, null, null]), []);
  assert.deepEqual(brokenRuns([]), []);
});

// ZERO IS A READING. It is the one value most likely to be treated as absent by accident,
// and treating it as absent would erase a real day.
test("zero is present, not missing", () => {
  assert.deepEqual(brokenRuns([0, 0, null, 0]), [
    [0, 1],
    [3, 3],
  ]);
});

test("a negative reading is still a reading", () => {
  assert.deepEqual(brokenRuns([-2, -1]), [[0, 1]]);
});

// ---------------------------------------------------------------- points

test("a run becomes one point per day", () => {
  assert.equal(runPoints([0, 2], at), "0.00,0.00 1.00,0.00 2.00,0.00");
});

// The failure this exists to prevent: a polyline with ONE point draws nothing at all, so a
// first week with a single weighing rendered an empty box under a caption saying it had
// data. Emitted twice, it is a dot on its own day.
test("a lone reading is emitted TWICE, or it draws nothing", () => {
  const pts = runPoints([3, 3], at);
  assert.equal(pts, "3.00,0.00 3.00,0.00");
  assert.equal(pts.split(" ").length, 2);
});

test("every run a series produces is drawable", () => {
  // Two-point minimum is the invariant; anything less is invisible.
  const series = [null, 5, null, 7, 8, null, 9];
  for (const run of brokenRuns(series)) {
    assert.ok(
      runPoints(run, at).split(" ").length >= 2,
      `run ${JSON.stringify(run)} is invisible`,
    );
  }
});
