import { test } from "node:test";
import assert from "node:assert/strict";
import {
  adherenceFor,
  floorCredit,
  BLOCK_SHARE,
  HABIT_SHARE,
  type Block,
  type BlockState,
  type FloorReadings,
  nextBlockAfter,
} from "./adherence.ts";
import { STEPS_FLOOR } from "./rings.ts";
import { CALORIE_FLOOR } from "./productivity.ts";

/** A block of `hours`, marked or not. `due` only affects the unmarked call-to-action. */
const block = (
  state: BlockState | null,
  hours = 1,
  due = true,
  workedFraction: number | null = null,
): Block => ({
  event_id: Math.random().toString(36).slice(2),
  title: "b",
  time_start: "09:00",
  time_end: "10:00",
  allDay: false,
  state,
  reason: null,
  workedFraction,
  due,
  colorId: null,
  minutes: hours * 60,
});

/** No reading on either floor — the state of every day before the phone and the food log,
 *  and the argument most block-only tests want: floors present, earning nothing. */
const NONE: FloorReadings = { steps: null, calories: null };
/** Both floors exactly reached. */
const FULL: FloorReadings = { steps: STEPS_FLOOR, calories: CALORIE_FLOOR };
/** How many items the habit share splits over when `scheduled` habits apply — the two
 *  floors are always in the denominator, which is the rule these tests exist to pin. */
const items = (scheduled: number) => scheduled + 2;

// ---------------------------------------------------------------- the shape of it

// The RATIO is the owner's dial and has been turned once already (70/30 -> 50/50), so the
// tests below are written against the constants rather than against today's numbers. What
// must never change is that the two shares are the whole of the figure and nothing else can
// reach it — that is what makes 100 mean "everything I said I'd do".
test("the two shares are the whole figure", () => {
  assert.equal(BLOCK_SHARE + HABIT_SHARE, 100);
  assert.ok(BLOCK_SHARE > 0 && HABIT_SHARE > 0);
});

test("blocked hours and non-negotiables carry equal weight", () => {
  assert.equal(BLOCK_SHARE, 50);
  assert.equal(HABIT_SHARE, 50);
});

test("an untouched day is 0, never null", () => {
  const a = adherenceFor([block(null, 2)], { scheduled: 5, done: 0 }, NONE);
  assert.equal(a.pct, 0);
});

// 100 now requires the floors too — they are two items of the day like any other.
test("everything done is exactly 100", () => {
  const a = adherenceFor(
    [block("adhered", 3), block("adhered", 5)],
    { scheduled: 5, done: 5 },
    FULL,
  );
  assert.equal(a.pct, 100);
});

// ---------------------------------------------------------------- blocked hours

test("hours, not items — a 3h block outweighs a 1h block", () => {
  // 4 blocked hours in the day; adhering the 3h one earns 3/4 of the 70.
  const long = adherenceFor([block("adhered", 3), block(null, 1)], null, NONE);
  const short = adherenceFor([block(null, 3), block("adhered", 1)], null, NONE);
  assert.equal(long.pct, Math.round(0.75 * BLOCK_SHARE));
  assert.equal(short.pct, Math.round(0.25 * BLOCK_SHARE));
  assert.ok(long.pct > short.pct, "the longer block is worth more");
});

test("half the blocked hours is half the block share", () => {
  const a = adherenceFor([block("adhered", 2), block(null, 2)], null, NONE);
  assert.equal(a.pct, Math.round(BLOCK_SHARE / 2));
  assert.equal(a.workedHours, 2);
  assert.equal(a.totalHours, 4);
});

test("the denominator is the WHOLE day, not the elapsed part — that is what makes it climb", () => {
  // A 2h block worked and a 6h block still ahead: 2/8 of 70, not 100% of what has passed.
  const a = adherenceFor([block("adhered", 2), block(null, 6, false)], null, NONE);
  assert.equal(a.pct, Math.round(0.25 * BLOCK_SHARE));
});

test("drift and skip do not subtract, they simply do not add", () => {
  const drifted = adherenceFor([block("adhered", 1), block("drifted", 1)], null, NONE);
  const unmarked = adherenceFor([block("adhered", 1), block(null, 1)], null, NONE);
  assert.equal(drifted.pct, Math.round(BLOCK_SHARE / 2));
  assert.equal(unmarked.pct, Math.round(BLOCK_SHARE / 2));
  assert.equal(drifted.pct, unmarked.pct, "drifting costs nothing the clock did not already cost");
});

// ---------------------------------------------------------------- a partial drift

// The state table itself is pinned in worked.test.ts. These test what adherence DOES with
// it, which is the division of labour the shared module exists to create.

test("a drift worked in part adds that part, and no more", () => {
  // 4 blocked hours; a 2h block drifted at 40% is 0.8 worked hours.
  const a = adherenceFor(
    [block("drifted", 2, true, 0.4), block(null, 2)],
    null,
    NONE,
  );
  assert.equal(a.workedHours, 0.8);
  assert.equal(a.totalHours, 4);
  assert.equal(a.pct, Math.round((0.8 / 4) * BLOCK_SHARE));
});

// The behaviour of every drift written before the slider existed. If this ever breaks, the
// figure for every past day changes silently.
test("a drift with no fraction still adds nothing, exactly as it always did", () => {
  const old = adherenceFor([block("adhered", 1), block("drifted", 1)], null, NONE);
  const zero = adherenceFor(
    [block("adhered", 1), block("drifted", 1, true, 0)],
    null,
    NONE,
  );
  assert.equal(old.pct, Math.round(BLOCK_SHARE / 2));
  assert.equal(zero.pct, old.pct, "null and 0 are worth the same, whatever they mean");
});

test("a partial drift is still a DRIFT on the record, never a part-adherence", () => {
  const a = adherenceFor([block("drifted", 2, true, 0.9)], null, NONE);
  assert.equal(a.drifted, 1);
  assert.equal(a.adhered, 0, "the counts tally by state; only the hours are fractional");
});

// The whole point of the fraction: a block cannot earn more of the day than it occupies,
// and no arrangement of drifts can beat working the day.
test("a fully worked drift is worth exactly an adherence, and never more", () => {
  const full = adherenceFor(
    [block("drifted", 2, true, 1), block(null, 2)],
    null,
    NONE,
  );
  const adhered = adherenceFor([block("adhered", 2), block(null, 2)], null, NONE);
  assert.equal(full.pct, adhered.pct);
  assert.equal(full.workedHours, adhered.workedHours);
});

test("a corrupt fraction cannot push a block past its own length", () => {
  const a = adherenceFor([block("drifted", 2, true, 4)], null, NONE);
  assert.equal(a.workedHours, 2, "clamped to the block");
  assert.equal(a.pct, BLOCK_SHARE);
});

// The one property the whole climbing-figure design rests on. A negative fraction reaching
// the arithmetic would make MARKING a block lower the number.
test("no fraction can make the figure fall", () => {
  const unmarked = adherenceFor(
    [block(null, 2), block("adhered", 2)],
    null,
    NONE,
  ).pct;
  for (const f of [0, 0.5, 1, -3, NaN]) {
    const marked = adherenceFor(
      [block("drifted", 2, true, f), block("adhered", 2)],
      null,
      NONE,
    ).pct;
    assert.ok(marked >= unmarked, `fraction ${f} lowered the figure`);
  }
});

test("marking a block can only ever raise the figure", () => {
  const before = adherenceFor([block("adhered", 1), block(null, 1)], null, NONE).pct;
  const after = adherenceFor(
    [block("adhered", 1), block("adhered", 1)],
    null,
    NONE,
  ).pct;
  assert.ok(after > before);
});

test("dismissed blocks leave both sides of the ratio", () => {
  const a = adherenceFor([block("adhered", 1), block("dismissed", 9)], null, NONE);
  assert.equal(a.totalHours, 1);
  assert.equal(a.pct, BLOCK_SHARE);
});

test("a block with an unknown duration cannot be earned or held against you", () => {
  const unknown = { ...block(null, 1), minutes: null };
  const a = adherenceFor([block("adhered", 1), unknown], null, NONE);
  assert.equal(a.totalHours, 1);
  assert.equal(a.pct, BLOCK_SHARE);
});

// ---------------------------------------------------------------- non-negotiables

test("non-negotiables split the habit share evenly, over the habits AND the two floors", () => {
  const each = HABIT_SHARE / items(5);
  assert.equal(
    adherenceFor([], { scheduled: 5, done: 1 }, NONE).pct,
    Math.round(each),
  );
  assert.equal(
    adherenceFor([], { scheduled: 5, done: 3 }, NONE).pct,
    Math.round(3 * each),
  );
  // Every tick without the floors reaches only five of the seven items…
  assert.equal(
    adherenceFor([], { scheduled: 5, done: 5 }, NONE).pct,
    Math.round(5 * each),
  );
  // …and the whole share needs the floors too.
  assert.equal(adherenceFor([], { scheduled: 5, done: 5 }, FULL).pct, HABIT_SHARE);
});

test("ticking one adds immediately — there is no cutoff to wait for", () => {
  const a = adherenceFor([block(null, 4)], { scheduled: 5, done: 1 }, NONE);
  assert.equal(a.pct, Math.round(HABIT_SHARE / items(5)));
});

test("done above scheduled cannot push past the share", () => {
  assert.equal(adherenceFor([], { scheduled: 2, done: 9 }, FULL).pct, HABIT_SHARE);
});

test("no habits and no readings leaves only the block share reachable", () => {
  assert.equal(adherenceFor([block("adhered", 1)], null, NONE).pct, BLOCK_SHARE);
  assert.equal(
    adherenceFor([block("adhered", 1)], undefined, NONE).pct,
    BLOCK_SHARE,
  );
});

// ---------------------------------------------------------------- the two floors

test("floorCredit is the fraction of the floor reached, clamped to one share", () => {
  assert.equal(floorCredit(3500, 7000), 0.5);
  assert.equal(floorCredit(7000, 7000), 1);
  assert.equal(floorCredit(21000, 7000), 1, "overshooting is worth the floor");
  assert.equal(floorCredit(0, 7000), 0);
  assert.equal(floorCredit(null, 7000), 0, "nobody measured earns nothing");
  assert.equal(floorCredit(undefined, 7000), 0);
  assert.equal(floorCredit(NaN, 7000), 0);
  assert.equal(floorCredit(-400, 7000), 0, "a reading can never lower the figure");
});

test("half a floor earns half a share — the owner's 50% × 1/14 arithmetic", () => {
  const a = adherenceFor(
    [],
    { scheduled: 5, done: 0 },
    { steps: STEPS_FLOOR / 2, calories: null },
  );
  assert.equal(a.pct, Math.round((0.5 / items(5)) * HABIT_SHARE));
});

// The denominator NEVER wobbles with the phone's battery: a null reading earns nothing
// but leaves nothing, so no day can outscore a day that measured more.
test("the floors are always in the denominator", () => {
  const nothing = adherenceFor([], { scheduled: 5, done: 5 }, NONE);
  assert.equal(nothing.pct, Math.round((5 / items(5)) * HABIT_SHARE));
});

test("with no habits scheduled the floors alone can earn the habit share", () => {
  const a = adherenceFor([], null, FULL);
  assert.equal(a.pct, HABIT_SHARE);
});

test("more of a floor can only ever raise the figure", () => {
  let prev = -1;
  for (const s of [null, 0, 1000, 3500, STEPS_FLOOR, 20000]) {
    const p = adherenceFor([], { scheduled: 3, done: 1 }, { steps: s, calories: null }).pct;
    assert.ok(p >= prev, `steps ${s} lowered the figure`);
    prev = p;
  }
});

test("the floors are not ticks — the reported tally stays the ticked count", () => {
  const a = adherenceFor([], { scheduled: 5, done: 2 }, FULL);
  assert.equal(a.habitsDone, 2);
  assert.equal(a.habitsScheduled, 5);
});

// ---------------------------------------------------------------- the two together

test("the halves compose", () => {
  // Half the blocked hours, plus three ticks of the seven habit items.
  const a = adherenceFor(
    [block("adhered", 1), block(null, 1)],
    { scheduled: 5, done: 3 },
    NONE,
  );
  assert.equal(
    a.pct,
    Math.round(BLOCK_SHARE / 2 + (3 / items(5)) * HABIT_SHARE),
  );
});

test("the counts are still reported for the call to action", () => {
  const a = adherenceFor(
    [block("adhered", 1), block("drifted", 1), block(null, 1), block(null, 1, false)],
    { scheduled: 4, done: 2 },
    NONE,
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
  workedFraction: null,
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
