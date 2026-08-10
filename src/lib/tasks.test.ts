import { test } from "node:test";
import assert from "node:assert/strict";
import { carriedDays, placementOf, showsOn, tasksFor } from "./tasks.ts";

const t = (id: number, due: string, doneOn: string | null = null) => ({
  id,
  title: `task ${id}`,
  due,
  doneOn,
});

const TODAY = "2026-08-11";

test("a task due in the future sits on its own day, not today", () => {
  assert.equal(placementOf(t(1, "2026-08-14"), TODAY), "2026-08-14");
});

test("a task due today sits on today", () => {
  assert.equal(placementOf(t(1, TODAY), TODAY), TODAY);
});

test("an undone task whose day has passed CARRIES to today", () => {
  assert.equal(placementOf(t(1, "2026-08-02"), TODAY), TODAY);
});

test("a done task belongs to the day it was done, forever", () => {
  // Not to its due date, and not to today: reading last Tuesday back must still show what
  // was actually ticked last Tuesday.
  assert.equal(placementOf(t(1, "2026-08-02", "2026-08-05"), TODAY), "2026-08-05");
  assert.equal(placementOf(t(1, "2026-08-02", "2026-08-05"), "2026-12-01"), "2026-08-05");
});

test("the carry is IDEMPOTENT — reading twice cannot move a task twice", () => {
  // The whole reason placement is derived rather than written by a nightly job.
  const task = t(1, "2026-08-02");
  const once = placementOf(task, TODAY);
  const twice = placementOf(task, TODAY);
  assert.equal(once, twice);
  assert.equal(task.due, "2026-08-02", "reading must not mutate the task");
});

test("an outstanding task appears on today and on NO earlier day", () => {
  const task = t(1, "2026-08-02");
  assert.equal(showsOn(task, TODAY, TODAY), true);
  // The days it carried through are not days it was on the list retrospectively — the
  // record of a past day must not grow new rows because you did not do something since.
  for (const d of ["2026-08-02", "2026-08-05", "2026-08-10"])
    assert.equal(showsOn(task, d, TODAY), false, `should not show on ${d}`);
});

test("viewing a FUTURE day shows what is due then, not what is carrying now", () => {
  const carrying = t(1, "2026-08-02");
  const friday = t(2, "2026-08-14");
  assert.equal(showsOn(friday, "2026-08-14", TODAY), true);
  // The carrying one is on today, and stays there — it does not smear across every day
  // from its due date to the end of time.
  assert.equal(showsOn(carrying, "2026-08-14", TODAY), false);
});

test("carriedDays counts plainly and never goes negative", () => {
  assert.equal(carriedDays(t(1, "2026-08-02"), TODAY), 9);
  assert.equal(carriedDays(t(1, TODAY), TODAY), 0);
  // Due in the future has not carried at all.
  assert.equal(carriedDays(t(1, "2026-08-20"), TODAY), 0);
  // Done is done; it never accrues a carry.
  assert.equal(carriedDays(t(1, "2026-01-01", "2026-01-02"), TODAY), 0);
});

test("carriedDays is DST-immune across both Melbourne transitions", () => {
  assert.equal(carriedDays(t(1, "2026-04-04"), "2026-04-06"), 2);
  assert.equal(carriedDays(t(1, "2026-10-03"), "2026-10-05"), 2);
});

test("the day's list puts outstanding first, oldest first, done last", () => {
  const all = [
    t(1, "2026-08-11", "2026-08-11"),
    t(2, "2026-08-09"),
    t(3, "2026-08-01"),
    t(4, "2026-08-11"),
  ];
  assert.deepEqual(
    tasksFor(all, TODAY, TODAY).map((x) => x.id),
    [3, 2, 4, 1],
  );
});

test("a task done on another day stays out of today's list", () => {
  const all = [t(1, "2026-08-02", "2026-08-03"), t(2, "2026-08-02")];
  assert.deepEqual(
    tasksFor(all, TODAY, TODAY).map((x) => x.id),
    [2],
  );
});
