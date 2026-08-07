import { test } from "node:test";
import assert from "node:assert/strict";
import { covers, rangeKey, sliceByDate } from "./calRange.ts";

const K = rangeKey;

test("a range covers itself", () => {
  assert.ok(covers(K("2026-08-01", "2026-08-14"), "2026-08-01", "2026-08-14"));
});

test("a wider range covers a narrower one", () => {
  const fortnight = K("2026-08-01", "2026-08-14");
  assert.ok(covers(fortnight, "2026-08-08", "2026-08-14")); // the week
  assert.ok(covers(fortnight, "2026-08-07", "2026-08-07")); // one day
});

// The whole reason this file exists. Serving a narrower range as though it covered a wider
// request shows fewer events than the calendar holds, with no error anywhere.
test("a narrower range NEVER covers a wider one", () => {
  const week = K("2026-08-08", "2026-08-14");
  assert.equal(covers(week, "2026-08-01", "2026-08-14"), false);
  assert.equal(covers(week, "2026-08-07", "2026-08-14"), false);
  assert.equal(covers(week, "2026-08-08", "2026-08-15"), false);
});

// Off by one here means the first or last day of a window silently loses its events.
test("the ends are INCLUSIVE, on both sides", () => {
  const r = K("2026-08-01", "2026-08-14");
  assert.ok(covers(r, "2026-08-01", "2026-08-01"), "first day");
  assert.ok(covers(r, "2026-08-14", "2026-08-14"), "last day");
  assert.equal(covers(r, "2026-07-31", "2026-08-01"), false, "one day before");
  assert.equal(covers(r, "2026-08-14", "2026-08-15"), false, "one day after");
});

test("a partial overlap is not cover", () => {
  const r = K("2026-08-05", "2026-08-10");
  assert.equal(covers(r, "2026-08-01", "2026-08-07"), false);
  assert.equal(covers(r, "2026-08-08", "2026-08-20"), false);
});

test("a disjoint range covers nothing", () => {
  assert.equal(covers(K("2026-01-01", "2026-01-31"), "2026-08-01", "2026-08-02"), false);
});

// A malformed entry must re-fetch rather than serve a window that was never really held.
test("malformed or reversed input covers nothing", () => {
  assert.equal(covers("nonsense", "2026-08-01", "2026-08-02"), false);
  assert.equal(covers("2026-08-01", "2026-08-01", "2026-08-02"), false);
  assert.equal(covers(K("2026-08-14", "2026-08-01"), "2026-08-05", "2026-08-06"), false);
  assert.equal(covers(K("2026-08-01", "2026-08-14"), "2026-08-10", "2026-08-05"), false);
});

// Year and month boundaries are where a naive numeric comparison would go wrong. String
// comparison on ISO dates handles them, and this pins that.
test("it is correct across month and year boundaries", () => {
  assert.ok(covers(K("2026-12-20", "2027-01-10"), "2026-12-31", "2027-01-01"));
  assert.equal(covers(K("2026-09-01", "2026-09-30"), "2026-09-30", "2026-10-01"), false);
  // '2026-09-9' would sort wrongly; ISO pads, and this is why the format matters.
  assert.ok(covers(K("2026-09-01", "2026-09-30"), "2026-09-09", "2026-09-10"));
});

// ---------------------------------------------------------------- slicing

test("slicing keeps only the days asked for", () => {
  const wide = new Map([
    ["2026-08-01", ["a"]],
    ["2026-08-05", ["b"]],
    ["2026-08-09", ["c"]],
  ]);
  assert.deepEqual(
    [...sliceByDate(wide, "2026-08-05", "2026-08-09").keys()],
    ["2026-08-05", "2026-08-09"],
  );
  assert.deepEqual([...sliceByDate(wide, "2026-08-02", "2026-08-04").keys()], []);
});

// A caller handed the cache's own map could mutate it and poison every later read.
test("the slice is a NEW map — the cache cannot be mutated through it", () => {
  const wide = new Map([["2026-08-01", ["a"]]]);
  const out = sliceByDate(wide, "2026-08-01", "2026-08-01");
  assert.notEqual(out, wide);
  out.delete("2026-08-01");
  assert.equal(wide.size, 1, "the original survived");
});

test("an empty day is preserved, not dropped", () => {
  // A day the calendar genuinely holds nothing on is different from a day outside the
  // window, and the slice must keep that distinction.
  const wide = new Map([["2026-08-03", [] as string[]]]);
  assert.equal(sliceByDate(wide, "2026-08-01", "2026-08-07").size, 1);
});
