import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adherenceFor,
  BLOCK_SHARE,
  HABIT_SHARE,
  type Block,
  type BlockState,
  nextBlockAfter,
} from "./adherence.ts";

/** A block of `hours`, marked or not. `due` only affects the unmarked call-to-action. */
const block = (
  state: BlockState | null,
  hours = 1,
  due = true,
): Block => ({
  event_id: Math.random().toString(36).slice(2),
  title: "b",
  time_start: "09:00",
  time_end: "10:00",
  allDay: false,
  state,
  reason: null,
  due,
  colorId: null,
  minutes: hours * 60,
});

// ---------------------------------------------------------------- the shape of it

test("the two shares are 70 and 30", () => {
  assert.equal(BLOCK_SHARE, 70);
  assert.equal(HABIT_SHARE, 30);
  assert.equal(BLOCK_SHARE + HABIT_SHARE, 100);
});

test("an untouched day is 0, never null", () => {
  const a = adherenceFor([block(null, 2)], { scheduled: 5, done: 0 });
  assert.equal(a.pct, 0);
});

test("everything done is exactly 100", () => {
  const a = adherenceFor([block("adhered", 3), block("adhered", 5)], {
    scheduled: 5,
    done: 5,
  });
  assert.equal(a.pct, 100);
});

// ---------------------------------------------------------------- blocked hours

test("hours, not items — a 3h block outweighs a 1h block", () => {
  // 4 blocked hours in the day; adhering the 3h one earns 3/4 of the 70.
  const long = adherenceFor([block("adhered", 3), block(null, 1)]);
  const short = adherenceFor([block(null, 3), block("adhered", 1)]);
  assert.equal(long.pct, 53); // 52.5 rounds
  assert.equal(short.pct, 18); // 17.5 rounds
  assert.ok(long.pct > short.pct, "the longer block is worth more");
});

test("half the blocked hours is half the block share", () => {
  const a = adherenceFor([block("adhered", 2), block(null, 2)]);
  assert.equal(a.pct, 35);
  assert.equal(a.adheredHours, 2);
  assert.equal(a.totalHours, 4);
});

test("the denominator is the WHOLE day, not the elapsed part — that is what makes it climb", () => {
  // A 2h block worked and a 6h block still ahead: 2/8 of 70, not 100% of what has passed.
  const a = adherenceFor([block("adhered", 2), block(null, 6, false)]);
  assert.equal(a.pct, 18); // 17.5 rounds
});

test("drift and skip do not subtract, they simply do not add", () => {
  const drifted = adherenceFor([block("adhered", 1), block("drifted", 1)]);
  const unmarked = adherenceFor([block("adhered", 1), block(null, 1)]);
  assert.equal(drifted.pct, 35);
  assert.equal(unmarked.pct, 35);
  assert.equal(drifted.pct, unmarked.pct, "drifting costs nothing the clock did not already cost");
});

test("marking a block can only ever raise the figure", () => {
  const before = adherenceFor([block("adhered", 1), block(null, 1)]).pct;
  const after = adherenceFor([block("adhered", 1), block("adhered", 1)]).pct;
  assert.ok(after > before);
});

test("dismissed blocks leave both sides of the ratio", () => {
  const a = adherenceFor([block("adhered", 1), block("dismissed", 9)]);
  assert.equal(a.totalHours, 1);
  assert.equal(a.pct, 70);
});

test("a block with an unknown duration cannot be earned or held against you", () => {
  const unknown = { ...block(null, 1), minutes: null };
  const a = adherenceFor([block("adhered", 1), unknown]);
  assert.equal(a.totalHours, 1);
  assert.equal(a.pct, 70);
});

// ---------------------------------------------------------------- non-negotiables

test("five non-negotiables are worth six each", () => {
  const one = adherenceFor([], { scheduled: 5, done: 1 });
  assert.equal(one.pct, 6);
  assert.equal(adherenceFor([], { scheduled: 5, done: 3 }).pct, 18);
  assert.equal(adherenceFor([], { scheduled: 5, done: 5 }).pct, 30);
});

test("ticking one adds immediately — there is no cutoff to wait for", () => {
  const a = adherenceFor([block(null, 4)], { scheduled: 5, done: 1 });
  assert.equal(a.pct, 6);
});

test("done above scheduled cannot push past the share", () => {
  assert.equal(adherenceFor([], { scheduled: 2, done: 9 }).pct, 30);
});

test("no habits at all leaves only the block share reachable", () => {
  assert.equal(adherenceFor([block("adhered", 1)]).pct, 70);
  assert.equal(adherenceFor([block("adhered", 1)], null).pct, 70);
});

// ---------------------------------------------------------------- the two together

test("the halves compose", () => {
  // Half the hours (35) plus three of five non-negotiables (18).
  const a = adherenceFor([block("adhered", 1), block(null, 1)], {
    scheduled: 5,
    done: 3,
  });
  assert.equal(a.pct, 53);
});

test("the counts are still reported for the call to action", () => {
  const a = adherenceFor(
    [block("adhered", 1), block("drifted", 1), block(null, 1), block(null, 1, false)],
    { scheduled: 4, done: 2 },
  );
  assert.equal(a.adhered, 1);
  assert.equal(a.drifted, 1);
  assert.equal(a.unmarked, 1, "only a block whose time has passed is a call to action");
  assert.equal(a.habitsDone, 2);
  assert.equal(a.habitsScheduled, 4);
});

// --- what is next ---------------------------------------------------------------------

const blk = (
  time_start: string | null,
  over: Partial<Block> = {},
): Block => ({
  event_id: `e${time_start}`,
  title: `at ${time_start}`,
  time_start,
  time_end: null,
  allDay: false,
  state: null,
  reason: null,
  due: false,
  colorId: null,
  minutes: 60,
  ...over,
});

test("the next block is the earliest one that has not started", () => {
  const day = [blk("08:00"), blk("14:00"), blk("16:00")];
  assert.equal(nextBlockAfter(day, 7 * 60)!.time_start, "08:00");
  assert.equal(nextBlockAfter(day, 9 * 60)!.time_start, "14:00");
  assert.equal(nextBlockAfter(day, 14 * 60 + 30)!.time_start, "16:00");
});

// The block you are inside is NOW, not next. Strictly after, or the answer to "what's next"
// is the thing you are already doing.
test("a block that has started is not next, including at its exact start", () => {
  const day = [blk("09:00")];
  assert.equal(nextBlockAfter(day, 9 * 60), null);
  assert.equal(nextBlockAfter(day, 9 * 60 - 1)!.time_start, "09:00");
});

test("nothing left once the last block has started", () => {
  assert.equal(nextBlockAfter([blk("08:00"), blk("18:00")], 19 * 60), null);
  assert.equal(nextBlockAfter([], 9 * 60), null);
});

// An all-day event is a condition of the day, not a thing that happens at a time. Putting
// "Semester 2" where the next lecture should be is worse than showing nothing.
test("all-day events are never next", () => {
  const day = [blk(null, { allDay: true }), blk("15:00")];
  assert.equal(nextBlockAfter(day, 9 * 60)!.time_start, "15:00");
  assert.equal(nextBlockAfter([blk("00:00", { allDay: true })], 0), null);
});

test("a dismissed block is not next — dismissing it says it is not part of the day", () => {
  const day = [blk("10:00", { state: "dismissed" }), blk("11:00")];
  assert.equal(nextBlockAfter(day, 9 * 60)!.time_start, "11:00");
});

test("a block with no start time cannot be placed, so it cannot be next", () => {
  assert.equal(nextBlockAfter([blk(null)], 9 * 60), null);
});

// Order out of the calendar is not guaranteed, and "the first one in the array that is
// later" is a different function from "the earliest one that is later".
test("out-of-order input still yields the earliest", () => {
  const day = [blk("16:00"), blk("10:00"), blk("13:00")];
  assert.equal(nextBlockAfter(day, 9 * 60)!.time_start, "10:00");
});
