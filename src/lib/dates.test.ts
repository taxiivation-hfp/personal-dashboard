import { test } from "node:test";
import assert from "node:assert/strict";
import { addDays, daysBetween, sinceLabel } from "./dates.ts";

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

// ---------------------------------------------------------------- sinceLabel
//
// The step count's age, which the checklist prints beside the figure. Every case here is
// a thing the label must not do: round a four-hour-old number up into looking current,
// report "0m ago" for a push that never happened, or count backwards off a clock skew.

const AT = "2026-08-10T04:00:00Z";
const at = (mins: number) => Date.parse(AT) + mins * 60_000;

test("sinceLabel says 'just now' under a minute", () => {
  assert.equal(sinceLabel(AT, at(0)), "just now");
  assert.equal(sinceLabel(AT, at(0) + 59_000), "just now");
});

test("sinceLabel counts minutes up to the hour", () => {
  assert.equal(sinceLabel(AT, at(1)), "1m ago");
  assert.equal(sinceLabel(AT, at(47)), "47m ago");
  assert.equal(sinceLabel(AT, at(59)), "59m ago");
});

test("sinceLabel switches to hours at exactly an hour, and FLOORS", () => {
  assert.equal(sinceLabel(AT, at(60)), "1h ago");
  // 119 minutes is one hour ago, not two. Rounding up here would describe a figure as
  // older than it is; rounding down anywhere would describe it as fresher, which is the
  // failure that matters.
  assert.equal(sinceLabel(AT, at(119)), "1h ago");
  assert.equal(sinceLabel(AT, at(23 * 60 + 59)), "23h ago");
});

test("sinceLabel switches to days at 24 hours", () => {
  assert.equal(sinceLabel(AT, at(24 * 60)), "1d ago");
  assert.equal(sinceLabel(AT, at(3 * 24 * 60 + 30)), "3d ago");
});

test("sinceLabel returns null for nothing recorded, never a zero age", () => {
  assert.equal(sinceLabel(null, at(0)), null);
  assert.equal(sinceLabel("not a date", at(0)), null);
});

test("sinceLabel clamps a future stamp rather than counting backwards", () => {
  // Clock skew between the database host and the phone. "in 4 minutes" is a bug report.
  assert.equal(sinceLabel(AT, at(-4)), "just now");
});

test("sinceLabel is timezone-free: the same instant written two ways reads the same", () => {
  // 2026-08-10T15:00+11:00 IS 04:00Z — the same moment, spelled with an offset instead of
  // a Z. The gap between two instants is the same number of minutes however either end is
  // written, which is why this function takes no timezone.
  assert.equal(sinceLabel("2026-08-10T15:00:00+11:00", at(47)), "47m ago");
});
