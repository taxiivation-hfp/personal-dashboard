import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween } from "./dates.ts";

test("addDays walks back 13 days for a 14-day inclusive window", () => {
  assert.equal(addDays("2026-08-05", -13), "2026-07-23");
});

test("daysBetween counts whole days forward", () => {
  assert.equal(daysBetween("2026-07-23", "2026-08-05"), 13);
});

test("daysBetween is zero for the same day", () => {
  assert.equal(daysBetween("2026-08-05", "2026-08-05"), 0);
});

test("daysBetween is negative when b is earlier", () => {
  assert.equal(daysBetween("2026-08-05", "2026-08-01"), -4);
});

test("daysBetween crosses a month boundary", () => {
  assert.equal(daysBetween("2026-07-31", "2026-08-01"), 1);
});

// Melbourne DST ends 2026-04-05 and starts 2026-10-04. Calendar-day arithmetic must
// ignore both — a 23-hour or 25-hour day is still one day.
test("daysBetween is DST-immune across the April transition", () => {
  assert.equal(daysBetween("2026-04-04", "2026-04-06"), 2);
});

test("daysBetween is DST-immune across the October transition", () => {
  assert.equal(daysBetween("2026-10-03", "2026-10-05"), 2);
});
