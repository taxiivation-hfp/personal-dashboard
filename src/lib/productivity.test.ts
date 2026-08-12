import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALENDAR_RATES,
  UNLISTED_RATE,
  POINTS_PER_HABIT,
  POINTS_PER_SESSION,
  CALORIE_FLOOR,
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
/** Basil — Work Projects, and the only FULL-rate tier: the work nobody scheduled and
 *  nobody is paying for. */
const basil = (
  minutes: number,
  state: BlockState | null = "adhered",
): ProductiveBlock => ({
  minutes,
  colorId: "10",
  state,
});
/** Banana — Work Uni, the owner's own study, at three quarters. */
const banana = (minutes: number): ProductiveBlock => ({
  minutes,
  colorId: "5",
  state: "adhered",
});
/** The calendar default — Uni. Google omits colorId entirely for these. */
const uni = (minutes: number): ProductiveBlock => ({
  minutes,
  colorId: null,
  state: "adhered",
});
/** Grape — the owner's colour for a gym block. It scores NOTHING: training is priced per
 *  logged session now, not by the hour. See POINTS_PER_SESSION. */
const grape = (minutes: number): ProductiveBlock => ({
  minutes,
  colorId: "3",
  state: "adhered",
});
const day = (o: Partial<ProductivityInput> = {}) =>
  scoreDay({ blocks: [], habitsDone: 0, ...o });

test("the five categories carry the rates the owner set", () => {
  assert.equal(rateFor("10"), 1); // Basil    — Work Projects
  assert.equal(rateFor("5"), 0.75); // Banana   — Work Uni
  assert.equal(rateFor("1"), 0.5); // Lavender — Work Part Time
  assert.equal(rateFor("11"), 0.5); // Tomato   — Work Part Time, same category
  assert.equal(rateFor(null), 0.5); // default  — Uni
});

// Two swatches, one meaning. The calendar really holds both, so the table does too — and
// the stack merges them, which the segment test below pins.
test("Lavender and Tomato are the SAME category", () => {
  const l = CALENDAR_RATES.find((c) => c.id === "1");
  const t = CALENDAR_RATES.find((c) => c.id === "11");
  assert.ok(l && t);
  assert.equal(l.label, "Work Part Time");
  assert.equal(t.label, l.label);
});

test("one slab per CATEGORY, not per colour", () => {
  // An hour of Lavender and an hour of Tomato is two hours of one thing.
  const s = day({
    blocks: [
      { minutes: 60, colorId: "1", state: "adhered" },
      { minutes: 60, colorId: "11", state: "adhered" },
    ],
  });
  const time = s.segments.filter((x) => x.kind === "time");
  assert.equal(time.length, 1, "one slab");
  assert.equal(time[0].label, "Work Part Time");
  assert.equal(time[0].minutes, 120);
  assert.equal(s.points, 100); // 2h at half rate
});

// GRAPHITE IS NOT A TIER. Seeing people is a pillar, counted by the Social ring; paying it
// productivity points as well would make an evening out a thing you can be productive AT.
test("social hours score nothing here", () => {
  assert.equal(rateFor("8"), UNLISTED_RATE);
  assert.equal(day({ blocks: [{ minutes: 180, colorId: "8", state: "adhered" }] }).points, 0);
});

test("the calendar default is the Uni tier", () => {
  assert.equal(rateFor(null), 0.5);
});

test("an unlisted colour scores zero, not a fallback rate", () => {
  for (const id of ["7", "2", "4", "6", "9", "", "nonsense"])
    assert.equal(rateFor(id), UNLISTED_RATE);
  assert.equal(UNLISTED_RATE, 0);
});

test("60 minutes at the full rate is 100 points", () => {
  const s = day({ blocks: [basil(60)] });
  assert.equal(s.points, 100);
  assert.equal(s.timePoints, 100);
});

test("Work Uni runs at three quarters", () => {
  assert.equal(day({ blocks: [banana(60)] }).points, 75);
  assert.equal(day({ blocks: [banana(120)] }).points, 150);
});

test("Work Part Time runs at half", () => {
  assert.equal(day({ blocks: [red(60)] }).points, 50);
});

test("Uni runs at half rate", () => {
  assert.equal(day({ blocks: [uni(60)] }).points, 50);
  assert.equal(day({ blocks: [uni(120)] }).points, 100);
});

test("time scores linearly", () => {
  assert.equal(day({ blocks: [basil(30)] }).points, 50);
});

test("an unproductive colour contributes no points AND no minutes", () => {
  const s = day({ blocks: [{ minutes: 480, colorId: "7", state: "adhered" }] });
  assert.equal(s.points, 0);
  // Not merely worth zero — it was never productive time in the first place, so it does
  // not inflate the minutes figure either.
  assert.equal(s.minutes, 0);
});

test("each non-negotiable is 25", () => {
  assert.equal(POINTS_PER_HABIT, 25);
  assert.equal(day({ habitsDone: 4 }).points, 100);
});

// THE DOUBLE-COUNT GUARD, from the other side. Training is paid for ONCE, and it is the
// logged session that pays — so a Grape block on the calendar must be worth nothing on its
// own, or the same training would be bought twice: once for scheduling it, again for doing
// it. This is the inverse of the arrangement that shipped first; see POINTS_PER_SESSION.
test("a gym BLOCK on the calendar scores nothing — Grape is not in the table", () => {
  assert.equal(
    CALENDAR_RATES.find((c) => c.id === "3"),
    undefined,
    "Grape must not be in the rate table",
  );
  assert.equal(rateFor("3"), UNLISTED_RATE);
  assert.equal(day({ blocks: [grape(180)] }).points, 0);
});

test("a logged SESSION is a FLAT figure, whatever the calendar says", () => {
  // Asserted against the constant, not against a literal. The figure is the owner's dial
  // and has already been turned once; what must never change is that it is FLAT.
  assert.equal(day({ workouts: 1 }).points, POINTS_PER_SESSION);
  // The whole argument for a flat figure: three hours under a bar is not more productive
  // than two, so the block's length must not reach the score at all.
  assert.equal(day({ workouts: 1, blocks: [grape(120)] }).points, POINTS_PER_SESSION);
  assert.equal(day({ workouts: 1, blocks: [grape(360)] }).points, POINTS_PER_SESSION);
});

test("two sessions in a day score twice one — a day can hold two lifts and a run", () => {
  assert.equal(day({ workouts: 2 }).points, 2 * POINTS_PER_SESSION);
  assert.equal(day({ workouts: 3 }).points, 3 * POINTS_PER_SESSION);
});

test("sessions get their own slab, and it is neither time nor a tick", () => {
  const s = day({ workouts: 2, habitsDone: 1, blocks: [basil(60)] });
  const seg = s.segments.find((x) => x.kind === "sessions");
  assert.ok(seg, "there is a sessions slab");
  assert.equal(seg.points, 2 * POINTS_PER_SESSION);
  // Not an hour: it carries no colour and no rate, and adds nothing to the minutes figure.
  assert.equal(seg.colorId, null);
  assert.equal(seg.rate, null);
  assert.equal(seg.minutes, 0);
  assert.equal(s.minutes, 60);
  assert.equal(s.sessionPoints, 2 * POINTS_PER_SESSION);
});

test("a stale caller that omits workouts still scores, and scores nothing for them", () => {
  // Parsed rather than written as a literal: this is the shape a caller that was never
  // updated would send, and the input is optional so it must simply be worth zero.
  const s = scoreDay(JSON.parse('{"blocks":[],"habitsDone":2}'));
  assert.equal(s.sessionPoints, 0);
  assert.equal(s.points, 2 * POINTS_PER_HABIT);
});

test("a nonsense session count can never subtract from a day", () => {
  assert.equal(scoreDay(JSON.parse('{"blocks":[],"habitsDone":0,"workouts":-4}')).points, 0);
  assert.equal(
    scoreDay(JSON.parse('{"blocks":[],"habitsDone":0,"workouts":2.7}')).points,
    2 * POINTS_PER_SESSION,
  );
});

// The property the whole feature turns on. This is the DELIBERATE inversion of the ring
// cap: a ring caps so you cannot win by overdoing one thing, because its job is to make a
// well-rounded fortnight the only good-looking board. This does not cap, because its job
// is the opposite — a raw comparative reading of hours actually spent.
test("the score is UNCAPPED", () => {
  const s = day({ blocks: [basil(360), uni(120)], habitsDone: 5, workouts: 3 });
  assert.equal(s.points, 600 + 100 + 5 * POINTS_PER_HABIT + 3 * POINTS_PER_SESSION);
  assert.ok(s.points > 100);
});

test("only adhered blocks count as time spent", () => {
  const notWorked: (BlockState | null)[] = ["drifted", "skipped", null];
  for (const state of notWorked)
    assert.equal(day({ blocks: [basil(60, state)] }).points, 0);
});

test("dismissed never counts, whatever its colour", () => {
  assert.equal(day({ blocks: [basil(60, "dismissed")] }).points, 0);
});

test("a mixed day counts only the adhered minutes", () => {
  const s = day({ blocks: [basil(60), basil(60, "drifted")] });
  assert.equal(s.minutes, 60);
  assert.equal(s.points, 100);
});

test("the parts always sum to the total", () => {
  const s = day({ blocks: [basil(45), uni(25)], habitsDone: 3 });
  assert.equal(s.timePoints + s.habitPoints, s.points);
});

test("points are whole numbers", () => {
  assert.equal(day({ blocks: [basil(45)] }).points, 75);
  assert.equal(day({ blocks: [uni(25)] }).points, 21); // 20.83 rounds
  assert.ok(Number.isInteger(day({ blocks: [uni(25)] }).points));
});

test("weighted minutes are reported alongside raw", () => {
  const s = day({ blocks: [basil(60), uni(60)] });
  assert.equal(s.minutes, 120);
  assert.equal(s.weightedMinutes, 90);
  assert.equal(s.timePoints, 150);
});

test("a negative duration cannot subtract from the day", () => {
  assert.equal(day({ blocks: [basil(-120), basil(60)] }).points, 100);
});

// The bar is a PICTURE of the total. If the slabs sum to something else, the picture lies.
test("the stacked segments always sum to the total", () => {
  const s = day({
    blocks: [red(45), uni(25), grape(90)],
    habitsDone: 3,
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

test("non-negotiables are their own slab, and carry no colour", () => {
  const s = day({ habitsDone: 2 });
  assert.deepEqual(
    s.segments.map((x) => x.kind),
    ["habits"],
  );
  for (const x of s.segments) assert.equal(x.colorId, null);
});

// Adherence counts them too, and that is NOT a double count — see the note on
// ProductivityInput. Two different questions asked of the same day.
test("non-negotiables stay in the score even though adherence counts them", () => {
  assert.equal(day({ habitsDone: 4 }).points, 100);
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
  assert.equal(s.minutes, 0);
});

// --- the calorie floor ---------------------------------------------------------------------

test("the calorie floor scores one non-negotiable's worth, and only at or above it", () => {
  assert.equal(CALORIE_FLOOR, 2500);
  assert.equal(day({ calories: 2499 }).points, 0);
  assert.equal(day({ calories: 2500 }).points, POINTS_PER_HABIT);
  assert.equal(day({ calories: 4000 }).points, POINTS_PER_HABIT);
});

// A FLOOR, not a gauge. Partial credit below the line would make it a target you can
// half-hit, which is a different and softer thing than a floor.
test("below the floor is nothing, never a partial credit", () => {
  for (const kcal of [0, 1, 1250, 2499])
    assert.equal(day({ calories: kcal }).points, 0);
  assert.equal(day({ calories: null }).points, 0);
  assert.equal(day({}).points, 0);
});

test("the floor joins the non-negotiables slab rather than growing a second grey", () => {
  const s = day({ habitsDone: 2, calories: 3000 });
  assert.deepEqual(
    s.segments.map((x) => x.kind),
    ["habits"],
  );
  // Three ticked things: two non-negotiables and the floor.
  assert.equal(s.habitPoints, 3 * POINTS_PER_HABIT);
  assert.equal(
    s.segments.reduce((t, x) => t + x.points, 0),
    s.points,
  );
});

// The floor is a productivity rule and must stay one. Adherence is blocked hours plus the
// non-negotiables list; calories are on neither, and a floor that moved the hero figure
// would be a target by another name.
test("the floor never reaches adherence — it has no path to it", () => {
  const withFloor = day({ blocks: [red(60)], habitsDone: 1, calories: 3000 });
  const without = day({ blocks: [red(60)], habitsDone: 1 });
  assert.equal(withFloor.points - without.points, POINTS_PER_HABIT);
  // scoreDay returns no adherence figure at all — the quarantine is structural.
  assert.ok(!("pct" in withFloor));
});
