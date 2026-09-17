import { test } from "node:test";
import assert from "node:assert/strict";
import {
  CALORIE_FLOOR,
  CATEGORY_ORDER,
  HOUR_CATEGORIES,
  canonicalColor,
  categoryOf,
  hoursForDay,
  workedMinutes,
  type BlockState,
  type WorkBlock,
} from "./productivity.ts";
import { CALORIE_FLOOR as RINGS_CALORIE_FLOOR } from "./rings.ts";

const block = (
  colorId: string | null,
  minutes: number,
  state: BlockState | null = "adhered",
  workedFraction: number | null = null,
): WorkBlock => ({ minutes, colorId, state, workedFraction });

/** Basil — Work Projects. */
const basil = (m: number, s: BlockState | null = "adhered") => block("10", m, s);
/** Banana — Work Uni. */
const banana = (m: number) => block("5", m);
/** The calendar default — Uni. Google omits colorId entirely for these. */
const uni = (m: number) => block(null, m);

// ---------------------------------------------------------------- the table

test("the four categories and the colours the owner filed them under", () => {
  assert.equal(categoryOf("10"), "Work Projects"); // Basil
  assert.equal(categoryOf("5"), "Work Uni"); // Banana
  assert.equal(categoryOf("1"), "Work Part Time"); // Lavender
  assert.equal(categoryOf("11"), "Work Part Time"); // Tomato — same category
  assert.equal(categoryOf(null), "Uni"); // default
  assert.deepEqual(
    [...CATEGORY_ORDER],
    ["Work Projects", "Work Uni", "Work Part Time", "Uni"],
  );
});

test("a category shows itself in its canonical colour — the first listed", () => {
  assert.equal(canonicalColor("Work Part Time"), "1");
  assert.equal(canonicalColor("Uni"), null);
  for (const label of CATEGORY_ORDER)
    assert.equal(
      canonicalColor(label),
      HOUR_CATEGORIES.find((c) => c.label === label)!.id,
    );
});

test("the table is well formed: every colour once, every category listed", () => {
  const ids = HOUR_CATEGORIES.map((c) => c.id);
  assert.equal(new Set(ids).size, ids.length);
  assert.deepEqual(
    [...new Set(HOUR_CATEGORIES.map((c) => c.label))].sort(),
    [...CATEGORY_ORDER].sort(),
  );
});

// Graphite never reaches here (buildBlocks drops it), and Grape is training, not work. Any
// other colour is simply not a category — never a fallback.
test("graphite, grape and every unlisted colour are not hours", () => {
  for (const id of ["8", "3", "7", "2", "4", "6", "9", "", "nonsense"]) {
    assert.equal(categoryOf(id), null, id);
    assert.equal(workedMinutes(block(id, 180)), 0, id);
  }
});

// ---------------------------------------------------------------- what counts

test("an adhered block counts all of its minutes", () => {
  assert.deepEqual(hoursForDay([basil(90)]), {
    minutes: 90,
    categories: [{ label: "Work Projects", colorId: "10", minutes: 90 }],
  });
});

test("a drift worked in part counts that part", () => {
  // 2h of Basil at 40% = 48 minutes.
  const h = hoursForDay([block("10", 120, "drifted", 0.4)]);
  assert.equal(h.minutes, 48);
  assert.equal(h.categories[0]!.minutes, 48);
});

test("unmarked, skipped, dismissed and an unanswered drift count nothing", () => {
  for (const state of [null, "skipped", "dismissed", "drifted"] as const)
    assert.equal(hoursForDay([basil(120, state)]).minutes, 0, String(state));
  assert.equal(hoursForDay([block("10", 120, "drifted", 0)]).minutes, 0);
});

test("an unlisted colour counts nothing at ANY fraction", () => {
  for (const f of [0.25, 0.5, 1])
    assert.equal(workedMinutes(block("7", 480, "drifted", f)), 0, String(f));
});

test("a corrupt fraction cannot count more than the block, or less than nothing", () => {
  assert.equal(workedMinutes(block("10", 60, "drifted", 9)), 60);
  assert.equal(workedMinutes(block("10", 60, "drifted", -4)), 0);
});

test("a negative or unreadable duration cannot subtract from the day", () => {
  assert.equal(hoursForDay([basil(-120), basil(60)]).minutes, 60);
  assert.equal(hoursForDay([basil(NaN), basil(60)]).minutes, 60);
});

// ---------------------------------------------------------------- the stack

test("one slab per CATEGORY, not per colour: Lavender and Tomato merge", () => {
  const h = hoursForDay([block("1", 60), block("11", 60)]);
  assert.deepEqual(h.categories, [
    { label: "Work Part Time", colorId: "1", minutes: 120 },
  ]);
});

test("slabs come in the category order, and empty categories are left out", () => {
  const h = hoursForDay([uni(60), block("1", 30), basil(45), uni(15)]);
  assert.deepEqual(
    h.categories.map((c) => c.label),
    ["Work Projects", "Work Part Time", "Uni"],
  );
  assert.deepEqual(
    h.categories.map((c) => c.minutes),
    [45, 30, 75],
  );
});

// The bar is a PICTURE of the total. If the slabs sum to something else, the picture lies.
test("the total is exactly the sum of the slabs, even with fractional minutes", () => {
  const h = hoursForDay([
    block("10", 50, "drifted", 0.35),
    block("5", 50, "drifted", 0.35),
    block("1", 50, "drifted", 0.35),
    block(null, 50, "drifted", 0.35),
  ]);
  assert.equal(
    h.minutes,
    h.categories.reduce((s, c) => s + c.minutes, 0),
  );
  for (const c of h.categories) assert.ok(Number.isInteger(c.minutes));
});

test("a mixed day counts only the worked minutes", () => {
  const h = hoursForDay([basil(60), basil(60, "drifted"), banana(30), block("3", 90)]);
  assert.equal(h.minutes, 90);
});

test("an empty day is a real zero with no slabs", () => {
  assert.deepEqual(hoursForDay([]), { minutes: 0, categories: [] });
});

// ---------------------------------------------------------------- the score is gone

test("there are no points anywhere in a day's hours", () => {
  const h = hoursForDay([basil(60), uni(60)]) as Record<string, unknown>;
  assert.ok(!("points" in h));
  for (const c of h.categories as Record<string, unknown>[]) {
    assert.ok(!("points" in c));
    assert.ok(!("rate" in c));
  }
});

// The calorie floor's home is rings.ts; this module only re-exports it for the screens that
// always imported it from here. A copy would be a second number that could drift.
test("CALORIE_FLOOR here IS the rings constant, not a copy", () => {
  assert.equal(CALORIE_FLOOR, RINGS_CALORIE_FLOOR);
  assert.equal(CALORIE_FLOOR, 2500);
});
