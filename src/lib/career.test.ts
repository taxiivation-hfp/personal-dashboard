import { test } from "node:test";
import assert from "node:assert/strict";
import {
  buildCareerRing,
  countsTowardCareer,
  dueLabel,
  existedOn,
  expectedProgress,
  goalFact,
  paceFill,
  type CareerGoal,
} from "./career.ts";
import { PILLAR_NAME } from "./rings.ts";
import { addDays } from "./dates.ts";

const TODAY = "2026-09-18";

/** An active goal with a deadline — the kind that takes an arc — overridable per test. */
const goal = (over: Partial<CareerGoal> = {}): CareerGoal => ({
  id: 1,
  title: "Ship the portfolio site",
  status: "active",
  createdAt: addDays(TODAY, -10),
  deadline: addDays(TODAY, 10),
  progress: 0,
  ...over,
});

const close = (a: number, b: number) =>
  assert.ok(Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

// ---------------------------------------------------------------- which goals count

test("a new goal is a FULL arc — nothing is expected of it yet", () => {
  const g = goal({ createdAt: TODAY, deadline: addDays(TODAY, 30), progress: 0 });
  assert.equal(expectedProgress(g.createdAt, g.deadline!, TODAY), 0);
  const ring = buildCareerRing([g], TODAY);
  assert.equal(ring.arcs[0]!.fill, 1);
  assert.equal(ring.fill, 1);
});

test("on pace is full: half the time gone and half done", () => {
  const g = goal({ progress: 0.5 }); // created 10 days ago, due in 10
  const expected = expectedProgress(g.createdAt, g.deadline!, TODAY);
  assert.equal(expected, 0.5);
  assert.equal(paceFill(g.progress, expected), 1);
  assert.equal(buildCareerRing([g], TODAY).fill, 1);
});

test("ahead of pace still caps at a full arc", () => {
  const ring = buildCareerRing([goal({ progress: 0.9 })], TODAY);
  assert.equal(ring.arcs[0]!.fill, 1);
});

test("behind pace is the share of the pace reached", () => {
  // Half the time gone, a quarter done: half of where it should be.
  const ring = buildCareerRing([goal({ progress: 0.25 })], TODAY);
  assert.equal(ring.arcs[0]!.fill, 0.5);
  assert.equal(ring.arcs[0]!.expected, 0.5);
  assert.equal(ring.arcs[0]!.progress, 0.25);
});

test("past the deadline expected is 1, so the arc shows actual progress — and it STAYS", () => {
  const g = goal({
    createdAt: addDays(TODAY, -40),
    deadline: addDays(TODAY, -5),
    progress: 0.6,
  });
  assert.equal(expectedProgress(g.createdAt, g.deadline!, TODAY), 1);
  const ring = buildCareerRing([g], TODAY);
  assert.equal(ring.arcs.length, 1, "still in the ring until done or dropped");
  assert.equal(ring.arcs[0]!.fill, 0.6);
});

test("on the deadline day itself, all of it is expected", () => {
  const g = goal({ createdAt: addDays(TODAY, -20), deadline: TODAY });
  assert.equal(expectedProgress(g.createdAt, g.deadline!, TODAY), 1);
});

test("a goal with NO deadline takes no arc", () => {
  const g = goal({ deadline: null, progress: 0.3 });
  assert.equal(countsTowardCareer(g), false);
  const ring = buildCareerRing([g], TODAY);
  assert.deepEqual(ring.arcs, []);
});

test("a DONE goal has left the ring, and so has anything not active", () => {
  for (const status of ["done", "paused", "dropped"]) {
    const g = goal({ status, progress: 1 });
    assert.equal(countsTowardCareer(g), false, status);
    assert.deepEqual(buildCareerRing([g], TODAY).arcs, [], status);
  }
});

test("a malformed deadline is not a deadline", () => {
  assert.equal(countsTowardCareer(goal({ deadline: "30 Sep" })), false);
  assert.equal(countsTowardCareer(goal({ deadline: "2026-02-30" })), false);
});

// ---------------------------------------------------------------- no goals

test("no counted goals is NULL — a ghost labelled 'no goals', never 0%", () => {
  const empty = buildCareerRing([], TODAY);
  assert.equal(empty.fill, null);
  assert.deepEqual(empty.arcs, []);
  const none = buildCareerRing(
    [goal({ deadline: null }), goal({ id: 2, status: "done" })],
    TODAY,
  );
  assert.equal(none.fill, null);
});

// ---------------------------------------------------------------- the ring

test("each counted goal is ONE EQUAL arc, and Career is their mean", () => {
  const ring = buildCareerRing(
    [
      goal({ id: 1, progress: 0.5 }), // on pace -> 1
      goal({ id: 2, progress: 0.25 }), // behind -> 0.5
      goal({ id: 3, progress: 0 }), // nothing -> 0
    ],
    TODAY,
  );
  assert.equal(ring.arcs.length, 3);
  for (const a of ring.arcs) close(a.weight, 1 / 3);
  close(
    ring.arcs.reduce((s, a) => s + a.weight, 0),
    1,
  );
  close(ring.fill!, (1 + 0.5 + 0) / 3);
});

test("the ring is Career's, by its key and its one name", () => {
  const ring = buildCareerRing([goal()], TODAY);
  assert.equal(ring.key, "portfolio");
  assert.equal(ring.name, PILLAR_NAME.portfolio);
});

test("arcs run soonest deadline first, then oldest goal", () => {
  const ring = buildCareerRing(
    [
      goal({ id: 5, deadline: "2026-12-01" }),
      goal({ id: 9, deadline: "2026-10-01" }),
      goal({ id: 2, deadline: "2026-10-01" }),
    ],
    TODAY,
  );
  assert.deepEqual(
    ring.arcs.map((a) => a.goalId),
    [2, 9, 5],
  );
  assert.equal(ring.arcs[0]!.key, "goal-2");
});

test("each arc carries its title and the owner's line", () => {
  const ring = buildCareerRing(
    [goal({ title: "Thesis draft", deadline: "2026-09-30", progress: 0.6 })],
    TODAY,
  );
  const a = ring.arcs[0]!;
  assert.equal(a.label, "Thesis draft");
  assert.equal(a.fact, "60% · due 30 Sep");
  assert.equal(a.deadline, "2026-09-30");
});

// ---------------------------------------------------------------- the edges

test("a goal is not in the ring of a day before it existed", () => {
  const g = goal({ createdAt: TODAY, deadline: addDays(TODAY, 20) });
  assert.equal(existedOn(g.createdAt, addDays(TODAY, -1)), false);
  // Not a full arc, which is what the created-today rule would otherwise make it: no arc,
  // and with nothing else counted, the "no goals" ghost.
  const back = buildCareerRing([g], addDays(TODAY, -3));
  assert.deepEqual(back.arcs, []);
  assert.equal(back.fill, null);
  // On its own creation day it is in, and full.
  assert.equal(buildCareerRing([g], TODAY).arcs[0]!.fill, 1);
});

test("a past day keeps the goals it did have, and only those", () => {
  const old = goal({ id: 1, createdAt: addDays(TODAY, -20), progress: 0 });
  const fresh = goal({ id: 2, createdAt: TODAY, deadline: addDays(TODAY, 30) });
  const back = buildCareerRing([old, fresh], addDays(TODAY, -2));
  assert.deepEqual(
    back.arcs.map((a) => a.goalId),
    [1],
  );
  // The old goal alone: nothing done, so the day reads as thin as it was.
  assert.equal(back.fill, back.arcs[0]!.fill);
  assert.equal(buildCareerRing([old, fresh], TODAY).arcs.length, 2);
});

test("an unreadable creation date keeps the goal rather than hiding it", () => {
  assert.equal(existedOn("", TODAY), true);
  assert.equal(existedOn("not a date", TODAY), true);
  assert.equal(buildCareerRing([goal({ createdAt: "" })], TODAY).arcs.length, 1);
});

test("a deadline on the creation day: full that day, actual progress after it", () => {
  assert.equal(expectedProgress(TODAY, TODAY, TODAY), 0);
  assert.equal(expectedProgress(TODAY, TODAY, addDays(TODAY, 1)), 1);
});

test("paceFill never divides by nothing and never leaves 0..1", () => {
  assert.equal(paceFill(0, 0), 1);
  assert.equal(paceFill(0.4, -1), 1);
  assert.equal(paceFill(2, 0.5), 1);
  assert.equal(paceFill(-1, 0.5), 0);
  assert.equal(paceFill(NaN, 0.5), 0);
});

test("the due label says the year only when it is not this year", () => {
  assert.equal(dueLabel("2026-09-30", TODAY), "due 30 Sep");
  assert.equal(dueLabel("2027-02-03", TODAY), "due 3 Feb 2027");
  assert.equal(goalFact(1, "2026-12-25", TODAY), "100% · due 25 Dec");
  assert.equal(goalFact(0.004, "2026-12-25", TODAY), "0% · due 25 Dec");
});
