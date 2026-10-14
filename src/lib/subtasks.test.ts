import { test } from "node:test";
import assert from "node:assert/strict";
import {
  HORIZON_DAYS,
  daysLate,
  doneOn,
  subtaskLine,
  subtaskShowsOn,
  type DatedSubtask,
} from "./subtasks.ts";
import { addDays } from "./dates.ts";

const TODAY = "2026-10-15";

const sub = (over: Partial<DatedSubtask> = {}): DatedSubtask => ({
  id: 1,
  title: "Official practice exam",
  due: addDays(TODAY, 3),
  done: false,
  doneOn: null,
  createdAt: addDays(TODAY, -30),
  ...over,
});

// ---------------------------------------------------------------- done as of a day

test("done is judged as of the day: ticked Thursday is not done on Tuesday", () => {
  const s = sub({ done: true, doneOn: TODAY });
  assert.equal(doneOn(s, TODAY), true);
  assert.equal(doneOn(s, addDays(TODAY, 1)), true);
  assert.equal(doneOn(s, addDays(TODAY, -2)), false);
});

test("a tick with no date is done since forever", () => {
  assert.equal(doneOn(sub({ done: true, doneOn: null }), "2000-01-01"), true);
});

test("an unticked subtask is not done on any day", () => {
  assert.equal(doneOn(sub(), addDays(TODAY, 100)), false);
});

// ---------------------------------------------------------------- late

test("late is the days past its date, and 0 until then", () => {
  const s = sub({ due: addDays(TODAY, -3) });
  assert.equal(daysLate(s, TODAY), 3);
  assert.equal(daysLate(s, addDays(TODAY, -3)), 0, "the date itself is not late");
  assert.equal(daysLate(s, addDays(TODAY, -4)), 0);
  assert.equal(daysLate(sub(), TODAY), 0, "not yet due");
});

test("undated or done is never late", () => {
  assert.equal(daysLate(sub({ due: null }), TODAY), 0);
  const s = sub({ due: addDays(TODAY, -5), done: true, doneOn: addDays(TODAY, -4) });
  assert.equal(daysLate(s, TODAY), 0);
  // ...but it WAS late on the day before it was ticked.
  assert.equal(daysLate(s, addDays(TODAY, -5)), 0);
  assert.equal(daysLate(s, addDays(TODAY, -4)), 0);
  assert.equal(daysLate({ ...s, doneOn: addDays(TODAY, -2) }, addDays(TODAY, -3)), 2);
});

// ---------------------------------------------------------------- where the card sits

test("a dated subtask floats from HORIZON_DAYS before its date up to the date", () => {
  const due = addDays(TODAY, 20);
  const s = sub({ due });
  assert.equal(subtaskShowsOn(s, addDays(due, -HORIZON_DAYS - 1), TODAY), false);
  assert.equal(subtaskShowsOn(s, addDays(due, -HORIZON_DAYS), TODAY), true);
  assert.equal(subtaskShowsOn(s, addDays(due, -1), TODAY), true);
  assert.equal(subtaskShowsOn(s, due, TODAY), true);
});

test("past its date it carries on TODAY and only today", () => {
  const s = sub({ due: addDays(TODAY, -3) });
  assert.equal(subtaskShowsOn(s, TODAY, TODAY), true);
  assert.equal(subtaskShowsOn(s, addDays(TODAY, -1), TODAY), false, "a past day between");
  assert.equal(subtaskShowsOn(s, addDays(TODAY, 1), TODAY), false, "a future day");
});

test("a ticked subtask sits on the day it was ticked, and nowhere else", () => {
  const s = sub({ due: TODAY, done: true, doneOn: addDays(TODAY, -2) });
  assert.equal(subtaskShowsOn(s, addDays(TODAY, -2), TODAY), true);
  assert.equal(subtaskShowsOn(s, TODAY, TODAY), false);
  assert.equal(subtaskShowsOn(s, addDays(TODAY, -3), TODAY), false);
});

test("a tick with no date never floats", () => {
  assert.equal(subtaskShowsOn(sub({ done: true, doneOn: null }), TODAY, TODAY), false);
});

test("undated subtasks never float", () => {
  assert.equal(subtaskShowsOn(sub({ due: null }), TODAY, TODAY), false);
});

test("a subtask is not on a day before it was written down", () => {
  const s = sub({ due: TODAY, createdAt: TODAY });
  assert.equal(subtaskShowsOn(s, addDays(TODAY, -1), TODAY), false);
  assert.equal(subtaskShowsOn(s, TODAY, TODAY), true);
});

// ---------------------------------------------------------------- the card's line

test("the line counts down, then counts late", () => {
  const s = sub({ due: TODAY });
  assert.equal(subtaskLine(s, addDays(TODAY, -3)), "due in 3d");
  assert.equal(subtaskLine(s, addDays(TODAY, -1)), "due tomorrow");
  assert.equal(subtaskLine(s, TODAY), "due today");
  assert.equal(subtaskLine(s, addDays(TODAY, 2)), "late 2d");
});

test("a ticked card has no line", () => {
  assert.equal(subtaskLine(sub({ done: true, doneOn: TODAY }), TODAY), null);
  assert.equal(subtaskLine(sub({ due: null }), TODAY), null);
});
