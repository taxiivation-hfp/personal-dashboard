import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_RATES,
  UNLISTED_RATE,
  POINTS_PER_HABIT,
  POINTS_PER_WORKOUT,
  rateFor,
  scoreDay,
  type BlockState,
  type ProductiveBlock,
  type ProductivityInput,
} from "./productivity.ts";

const red = (
  minutes: number,
  state: BlockState | null = "adhered",
): ProductiveBlock => ({
  minutes,
  colorId: "11",
  state,
});
/** The calendar default — Uni. Google omits colorId entirely for these. */
const uni = (minutes: number): ProductiveBlock => ({
  minutes,
  colorId: null,
  state: "adhered",
});
const day = (o: Partial<ProductivityInput> = {}) =>
  scoreDay({ blocks: [], habitsDone: 0, workouts: 0, ...o });

test("red is Work at the full rate", () => {
  assert.equal(rateFor("11"), 1);
});

test("the calendar default is the Uni tier", () => {
  assert.equal(rateFor(null), 0.5);
});

// Peacock was briefly mapped to Uni. It was a stray on a couple of real events rather
// than a rule, and a colour has to be chosen deliberately to mean anything here.
test("peacock is not a tier", () => {
  assert.equal(rateFor("7"), UNLISTED_RATE);
});

test("an unlisted colour scores zero, not a fallback rate", () => {
  for (const id of ["5", "2", "", "nonsense"])
    assert.equal(rateFor(id), UNLISTED_RATE);
  assert.equal(UNLISTED_RATE, 0);
});

test("60 minutes of Work is 100 points", () => {
  const s = day({ blocks: [red(60)] });
  assert.equal(s.points, 100);
  assert.equal(s.timePoints, 100);
});

test("Uni runs at half rate", () => {
  assert.equal(day({ blocks: [uni(60)] }).points, 50);
  assert.equal(day({ blocks: [uni(120)] }).points, 100);
});

test("time scores linearly", () => {
  assert.equal(day({ blocks: [red(30)] }).points, 50);
});

test("an unproductive colour contributes no points AND no minutes", () => {
  const s = day({ blocks: [{ minutes: 480, colorId: "5", state: "adhered" }] });
  assert.equal(s.points, 0);
  // Not merely worth zero — it was never productive time in the first place, so it does
  // not inflate the minutes figure either.
  assert.equal(s.minutes, 0);
});

test("each non-negotiable is 25", () => {
  assert.equal(POINTS_PER_HABIT, 25);
  assert.equal(day({ habitsDone: 4 }).points, 100);
});

test("each workout is 100 regardless of duration", () => {
  assert.equal(POINTS_PER_WORKOUT, 100);
  assert.equal(day({ workouts: 2 }).points, 200);
});

// The property the whole feature turns on. This is the DELIBERATE inversion of the ring
// cap: a ring caps so you cannot win by overdoing one thing, because its job is to make a
// well-rounded fortnight the only good-looking board. This does not cap, because its job
// is the opposite — a raw comparative reading of hours actually spent.
test("the score is UNCAPPED", () => {
  const s = day({ blocks: [red(360), uni(120)], habitsDone: 5, workouts: 3 });
  assert.equal(s.points, 1125);
  assert.ok(s.points > 100);
});

test("only adhered blocks count as time spent", () => {
  const notWorked: (BlockState | null)[] = ["drifted", "skipped", null];
  for (const state of notWorked)
    assert.equal(day({ blocks: [red(60, state)] }).points, 0);
});

test("dismissed never counts, whatever its colour", () => {
  assert.equal(day({ blocks: [red(60, "dismissed")] }).points, 0);
});

test("a mixed day counts only the adhered minutes", () => {
  const s = day({ blocks: [red(60), red(60, "drifted")] });
  assert.equal(s.minutes, 60);
  assert.equal(s.points, 100);
});

test("the parts always sum to the total", () => {
  const s = day({ blocks: [red(45), uni(25)], habitsDone: 3, workouts: 1 });
  assert.equal(s.timePoints + s.habitPoints + s.workoutPoints, s.points);
});

test("points are whole numbers", () => {
  assert.equal(day({ blocks: [red(45)] }).points, 75);
  assert.equal(day({ blocks: [uni(25)] }).points, 21); // 20.83 rounds
  assert.ok(Number.isInteger(day({ blocks: [uni(25)] }).points));
});

test("weighted minutes are reported alongside raw", () => {
  const s = day({ blocks: [red(60), uni(60)] });
  assert.equal(s.minutes, 120);
  assert.equal(s.weightedMinutes, 90);
  assert.equal(s.timePoints, 150);
});

test("a negative duration cannot subtract from the day", () => {
  assert.equal(day({ blocks: [red(-120), red(60)] }).points, 100);
});

// The bar is a PICTURE of the total. If the slabs sum to something else, the picture lies.
test("the stacked segments always sum to the total", () => {
  const s = day({
    blocks: [red(45), uni(25), red(90)],
    habitsDone: 3,
    workouts: 2,
  });
  assert.equal(
    s.segments.reduce((t, x) => t + x.points, 0),
    s.points,
  );
});

test("blocked time is merged by colour, not left one slab per event", () => {
  const s = day({ blocks: [uni(60), uni(60), red(60)] });
  const time = s.segments.filter((x) => x.kind === "time");
  assert.equal(time.length, 2, "two colours, two slabs — not three events, three slabs");
});

test("habits and workouts are their own slabs, and carry no colour", () => {
  const s = day({ habitsDone: 2, workouts: 1 });
  const kinds = s.segments.map((x) => x.kind).sort();
  assert.deepEqual(kinds, ["habits", "workouts"]);
  for (const x of s.segments) assert.equal(x.colorId, null);
});

test("an empty day has no slabs at all", () => {
  assert.deepEqual(day().segments, []);
});

test("the rate table is well formed", () => {
  const ids = CALENDAR_RATES.map((c) => c.id);
  assert.equal(
    new Set(ids).size,
    ids.length,
    "each colorId appears exactly once",
  );
  for (const c of CALENDAR_RATES) {
    assert.ok(c.rate >= 0 && c.rate <= 1, `${c.label} rate is in range`);
  }
});

// Unlike adherence, which returns null when nothing is due yet, zero here is a TRUE
// statement: no productive hours were spent. Do not "fix" this to null.
test("an empty day scores a real zero", () => {
  const s = day();
  assert.equal(s.points, 0);
  assert.equal(s.timePoints, 0);
  assert.equal(s.habitPoints, 0);
  assert.equal(s.workoutPoints, 0);
  assert.equal(s.minutes, 0);
});
