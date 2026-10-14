import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CAREER_HOURS,
  buildCareerRing,
  countsTowardCareer,
  existedOn,
  expectedProgress,
  goalArcFill,
  hoursFact,
  hoursFill,
  lateness,
  paceFill,
  type CareerGoal,
  type CareerHours,
} from "./career.ts";
import type { DatedSubtask } from "./subtasks.ts";
import { PILLAR_NAME } from "./rings.ts";
import { addDays } from "./dates.ts";

const TODAY = "2026-10-15";

const sub = (over: Partial<DatedSubtask> = {}): DatedSubtask => ({
  id: 10,
  title: "Official practice exam",
  due: null,
  done: false,
  doneOn: null,
  createdAt: addDays(TODAY, -30),
  ...over,
});

/** An active checklist goal with a deadline ahead — the plain case. */
const goal = (over: Partial<CareerGoal> = {}): CareerGoal => ({
  id: 1,
  title: "AWS Solutions Architect",
  status: "active",
  createdAt: addDays(TODAY, -30),
  deadline: addDays(TODAY, 60),
  progress: 0,
  count: null,
  subgoals: [sub()],
  ...over,
});

const FULL: CareerHours = { hours: CAREER_HOURS, resolved: true };
const NONE: CareerHours = { hours: 0, resolved: true };
const GHOST: CareerHours = { hours: 0, resolved: false };

const close = (a: number | null, b: number) =>
  assert.ok(a != null && Math.abs(a - b) < 1e-9, `${a} !== ${b}`);

const goalArcs = (g: CareerGoal[], hours = FULL) =>
  buildCareerRing(g, TODAY, hours).arcs.filter((a) => a.goalId != null);

// ---------------------------------------------------------------- the hours half

test("the hours arc is half the ring and fills at CAREER_HOURS", () => {
  const ring = buildCareerRing([goal()], TODAY, { hours: 24, resolved: true });
  const hours = ring.arcs[0]!;
  assert.equal(hours.key, "hours");
  assert.equal(hours.weight, 0.5);
  assert.equal(hours.fill, 0.5);
  assert.equal(hours.fact, "24 of 48 h");
});

test("hours cap at the half — 60 hours is a full arc, not more", () => {
  assert.equal(hoursFill({ hours: 60, resolved: true }), 1);
  assert.equal(hoursFact(60), "60 of 48 h");
  assert.equal(hoursFact(31.456), "31.5 of 48 h");
  assert.equal(hoursFact(-3), "0 of 48 h");
});

test("no calendar is a GHOST hours arc, left out of the mean — never zero", () => {
  const ring = buildCareerRing([goal()], TODAY, GHOST);
  assert.equal(ring.arcs[0]!.fill, null);
  assert.equal(ring.arcs[0]!.fact, "—");
  assert.equal(ring.fill, 1, "the goals half alone, and it is on time");
});

// ---------------------------------------------------------------- which goals count

test("a goal counts with a deadline, or with a dated subtask, and not otherwise", () => {
  assert.equal(countsTowardCareer(goal(), TODAY), true);
  assert.equal(
    countsTowardCareer(goal({ deadline: null, subgoals: [sub({ due: TODAY })] }), TODAY),
    true,
  );
  assert.equal(countsTowardCareer(goal({ deadline: null }), TODAY), false);
  assert.equal(countsTowardCareer(goal({ deadline: "30 Sep" }), TODAY), false);
});

test("a done, paused or dropped goal has left the ring", () => {
  for (const status of ["done", "paused", "dropped"])
    assert.equal(countsTowardCareer(goal({ status }), TODAY), false, status);
});

test("a goal is not in the ring of a day before it existed", () => {
  const g = goal({ createdAt: TODAY });
  assert.equal(existedOn(g.createdAt, addDays(TODAY, -1)), false);
  assert.equal(countsTowardCareer(g, addDays(TODAY, -1)), false);
  assert.equal(countsTowardCareer(g, TODAY), true);
});

test("a dated subtask written down later does not put the goal in a past day's ring", () => {
  const g = goal({
    deadline: null,
    subgoals: [sub({ due: addDays(TODAY, -2), createdAt: TODAY })],
  });
  assert.equal(countsTowardCareer(g, addDays(TODAY, -1)), false);
  assert.equal(lateness(g, addDays(TODAY, -1)), null);
});

// ---------------------------------------------------------------- the cliff

test("a goal is FULL before any date passes, however little is done", () => {
  const g = goal({ progress: 0, deadline: addDays(TODAY, 1) });
  assert.deepEqual(goalArcFill(g, TODAY), { fill: 1, fact: "on time", late: null });
});

test("a dated subtask past its date EMPTIES the slice, from the day after", () => {
  const g = goal({ subgoals: [sub({ due: TODAY })] });
  assert.equal(goalArcFill(g, TODAY).fill, 1, "the date itself is not late");
  const after = goalArcFill(g, addDays(TODAY, 1));
  assert.equal(after.fill, 0);
  assert.equal(after.fact, "late · Official practice exam · 1d");
});

test("the goal's own deadline is an item: past it and unfinished, the slice is empty", () => {
  const g = goal({ deadline: addDays(TODAY, -3) });
  const r = goalArcFill(g, TODAY);
  assert.equal(r.fill, 0);
  assert.equal(r.fact, "late · deadline · 3d");
});

test("past its deadline with every subtask ticked, nothing is late", () => {
  const g = goal({
    deadline: addDays(TODAY, -3),
    progress: 1,
    subgoals: [sub({ done: true, doneOn: addDays(TODAY, -4) })],
  });
  assert.equal(goalArcFill(g, TODAY).fill, 1);
});

test("a goal with no subtasks past its deadline is late — nothing was done", () => {
  const g = goal({ deadline: addDays(TODAY, -1), subgoals: [] });
  assert.equal(goalArcFill(g, TODAY).fill, 0);
});

test("the most overdue item is the one named", () => {
  const g = goal({
    deadline: addDays(TODAY, -2),
    subgoals: [
      sub({ id: 1, title: "Book it", due: addDays(TODAY, -9) }),
      sub({ id: 2, title: "Sit it", due: addDays(TODAY, -1) }),
    ],
  });
  assert.deepEqual(lateness(g, TODAY), { item: "Book it", days: 9 });
});

test("ticking the late subtask restores the slice — and only from the day it was ticked", () => {
  const due = addDays(TODAY, -5);
  const g = goal({ subgoals: [sub({ due, done: true, doneOn: TODAY })] });
  assert.equal(goalArcFill(g, TODAY).fill, 1);
  assert.equal(goalArcFill(g, addDays(TODAY, -1)).fill, 0, "yesterday it was still late");
});

// ---------------------------------------------------------------- counted goals keep pace

const counted = (over: Partial<CareerGoal> = {}): CareerGoal =>
  goal({
    id: 6,
    title: "Algorithms",
    createdAt: addDays(TODAY, -10),
    deadline: addDays(TODAY, 10),
    count: { done: 1, target: 150 },
    progress: 1 / 150,
    subgoals: [],
    ...over,
  });

test("a counted goal fills by pace in the run-up", () => {
  // Half the span gone: expected 0.5. 75 of 150 is on pace; 30 of 150 is 40% of pace.
  assert.equal(expectedProgress(counted().createdAt, counted().deadline!, TODAY), 0.5);
  assert.deepEqual(
    goalArcFill(counted({ count: { done: 75, target: 150 }, progress: 0.5 }), TODAY),
    { fill: 1, fact: "on pace", late: null },
  );
  const behind = goalArcFill(
    counted({ count: { done: 30, target: 150 }, progress: 0.2 }),
    TODAY,
  );
  close(behind.fill, 0.4);
  assert.equal(behind.fact, "behind pace");
});

test("a counted goal made today expects nothing yet and is full", () => {
  const g = counted({ createdAt: TODAY, count: { done: 0, target: 150 }, progress: 0 });
  assert.equal(goalArcFill(g, TODAY).fill, 1);
});

test("a counted goal past its deadline is late like any other: EMPTY, not its progress", () => {
  const g = counted({
    deadline: addDays(TODAY, -1),
    count: { done: 40, target: 150 },
    progress: 40 / 150,
  });
  const r = goalArcFill(g, TODAY);
  assert.equal(r.fill, 0);
  assert.equal(r.fact, "late · deadline · 1d");
});

test("a counted goal that reached its target is not late past the date", () => {
  const g = counted({
    deadline: addDays(TODAY, -1),
    count: { done: 150, target: 150 },
    progress: 1,
  });
  assert.equal(goalArcFill(g, TODAY).fill, 1);
});

test("paceFill never divides by nothing and never leaves 0..1", () => {
  assert.equal(paceFill(0.5, 0), 1);
  assert.equal(paceFill(2, 0.5), 1);
  assert.equal(paceFill(-1, 0.5), 0);
  assert.equal(paceFill(NaN, 0.5), 0);
});

// ---------------------------------------------------------------- the whole ring

test("the goals share the other half equally, and Career is the weighted mean", () => {
  const a = goal({ id: 1 });
  const b = goal({ id: 2, title: "English test", subgoals: [sub({ due: addDays(TODAY, -1) })] });
  const ring = buildCareerRing([a, b], TODAY, NONE);
  const arcs = ring.arcs.filter((x) => x.goalId != null);
  assert.deepEqual(arcs.map((x) => x.weight), [0.25, 0.25]);
  assert.deepEqual(arcs.map((x) => x.fill), [1, 0]);
  // hours 0 × ½ + (1 × ¼ + 0 × ¼) = 0.25
  close(ring.fill, 0.25);
});

test("no goal that can be late is a GHOST half, and Career is the hours alone", () => {
  const ring = buildCareerRing([goal({ deadline: null })], TODAY, {
    hours: 12,
    resolved: true,
  });
  assert.equal(ring.arcs.length, 2);
  assert.equal(ring.arcs[1]!.key, "no-goals");
  assert.equal(ring.arcs[1]!.fill, null);
  close(ring.fill, 0.25);
});

test("both halves ghosts is null — drawn as an empty ghost, never 0%", () => {
  assert.equal(buildCareerRing([], TODAY, GHOST).fill, null);
});

test("goal arcs run soonest deadline first, undated last, then oldest goal", () => {
  const arcs = goalArcs([
    goal({ id: 3, deadline: addDays(TODAY, 5) }),
    goal({ id: 2, deadline: null, subgoals: [sub({ due: TODAY })] }),
    goal({ id: 1, deadline: addDays(TODAY, 5) }),
  ]);
  assert.deepEqual(arcs.map((a) => a.goalId), [1, 3, 2]);
});

test("each goal arc carries its title and its line", () => {
  const [arc] = goalArcs([goal()]);
  assert.equal(arc!.label, "AWS Solutions Architect");
  assert.equal(arc!.fact, "on time");
  assert.equal(arc!.key, "goal-1");
});

test("the ring is Career's, by its key and its one name", () => {
  const ring = buildCareerRing([], TODAY, FULL);
  assert.equal(ring.key, "portfolio");
  assert.equal(ring.name, PILLAR_NAME.portfolio);
});

test("an unreadable creation date keeps the goal rather than hiding it", () => {
  assert.equal(existedOn("", TODAY), true);
  assert.equal(countsTowardCareer(goal({ createdAt: "garbage" }), TODAY), true);
});
