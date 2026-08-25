import { test } from "node:test";
import assert from "node:assert/strict";
import {
  GROW_AT,
  MAX_DPR,
  SHEET_LINES,
  SHEET_RATIO,
  isInkPixel,
  lowestInkRow,
  ruleGap,
  ruleYs,
  sheetHeight,
  sheetOf,
  sheetsNeeded,
  sheetsToSave,
} from "./sheets.ts";

// ---------------------------------------------------------------- geometry

test("a sheet is A4 portrait ruled into eighteen lines, whatever its width", () => {
  assert.equal(sheetHeight(100), 100 * SHEET_RATIO);
  assert.equal(ruleGap(100), (100 * SHEET_RATIO) / SHEET_LINES);
  assert.equal(SHEET_LINES, 18);
});

test("sheet 0 rules exactly as the single-sheet canvas did: gap..17·gap, nothing at the edges", () => {
  const ys = ruleYs(0, 100);
  const gap = ruleGap(100);
  assert.equal(ys.length, SHEET_LINES - 1);
  assert.equal(ys[0], gap);
  assert.equal(ys[ys.length - 1], (SHEET_LINES - 1) * gap);
  assert.ok(!ys.includes(0), "no rule on the top edge of the first sheet");
});

test("every later sheet also rules its top edge, so the seam is one gap and not two", () => {
  const ys = ruleYs(1, 100);
  assert.equal(ys[0], 0);
  assert.equal(ys.length, SHEET_LINES);
  // The seam: the last rule of sheet 0 to the first of sheet 1 is exactly one gap.
  const gap = ruleGap(100);
  const lastAbove = ruleYs(0, 100).at(-1)!;
  const seamGap = sheetHeight(100) + ys[0] - lastAbove;
  assert.ok(Math.abs(seamGap - gap) < 1e-9);
});

test("sheetOf maps scroll y onto the sheet it falls on and never below zero", () => {
  const h = sheetHeight(100);
  assert.equal(sheetOf(0, 100), 0);
  assert.equal(sheetOf(h - 0.01, 100), 0);
  assert.equal(sheetOf(h, 100), 1);
  assert.equal(sheetOf(h * 2.5, 100), 2);
  assert.equal(sheetOf(-5, 100), 0);
});

// ---------------------------------------------------------------- growth

test("a page starts as one sheet and stays one until the ink reaches GROW_AT", () => {
  assert.equal(sheetsNeeded(null, 1), 1);
  assert.equal(sheetsNeeded(0, 1), 1);
  assert.equal(sheetsNeeded(GROW_AT - 0.01, 1), 1);
  assert.equal(sheetsNeeded(GROW_AT, 1), 2);
  assert.equal(sheetsNeeded(1, 1), 2);
});

test("growth is by ONE sheet, and never below one", () => {
  assert.equal(sheetsNeeded(1, 3), 4, "full last sheet: one more, not several");
  assert.equal(sheetsNeeded(null, 0), 1);
  assert.equal(sheetsNeeded(1, 0), 2);
});

test("GROW_AT leaves paper ahead of the pen and MAX_DPR is capped at 2", () => {
  assert.ok(GROW_AT > 0.5 && GROW_AT < 1);
  assert.equal(MAX_DPR, 2);
});

// ---------------------------------------------------------------- ink detection

test("paper and rules are not ink; ink and its anti-aliased edge are", () => {
  assert.equal(isInkPixel(253, 251, 246), false, "paper");
  assert.equal(isInkPixel(226, 219, 205), false, "rule");
  assert.equal(isInkPixel(207, 197, 178), false, "margin rule");
  assert.equal(isInkPixel(35, 32, 27), true, "ink");
  assert.equal(isInkPixel(120, 115, 110), true, "a light stroke");
});

/** A w×h RGBA buffer of paper, with ink at the given (x, y) points. */
function buffer(w: number, h: number, ink: [number, number][]) {
  const b = new Uint8ClampedArray(w * h * 4);
  for (let i = 0; i < w * h; i++) {
    b[i * 4] = 253;
    b[i * 4 + 1] = 251;
    b[i * 4 + 2] = 246;
    b[i * 4 + 3] = 255;
  }
  for (const [x, y] of ink) {
    const i = (y * w + x) * 4;
    b[i] = 35;
    b[i + 1] = 32;
    b[i + 2] = 27;
  }
  return b;
}

test("lowestInkRow finds the lowest inked row and null on blank paper", () => {
  assert.equal(lowestInkRow(buffer(10, 10, []), 10, 10), null);
  assert.equal(lowestInkRow(buffer(10, 10, [[2, 3]]), 10, 10), 3);
  assert.equal(
    lowestInkRow(
      buffer(10, 10, [
        [2, 3],
        [7, 8],
      ]),
      10,
      10,
    ),
    8,
  );
});

test("lowestInkRow ignores transparent pixels and samples at the given step", () => {
  const b = buffer(10, 10, [[4, 6]]);
  b[(6 * 10 + 4) * 4 + 3] = 0; // the only ink is transparent: paper
  assert.equal(lowestInkRow(b, 10, 10), null);
  // Sampling every 3rd row from the bottom (9, 6, 3, 0) sees row 6 but not row 7.
  assert.equal(lowestInkRow(buffer(10, 10, [[3, 6]]), 10, 10, 3), 6);
  assert.equal(lowestInkRow(buffer(10, 10, [[3, 7]]), 10, 10, 3), null);
});

// ---------------------------------------------------------------- what a save writes

const sheet = (
  seq: number,
  saved: boolean,
  dirty: boolean,
  inked: boolean,
) => ({ seq, saved, dirty, inked });

test("a new page writes every sheet up to the last inked one and not the spare", () => {
  assert.deepEqual(
    sheetsToSave([
      sheet(0, false, true, true),
      sheet(1, false, true, true),
      sheet(2, false, false, false), // the blank sheet offered past the last line
    ]),
    [0, 1],
  );
});

test("adding to a saved page writes only the sheets that took ink", () => {
  assert.deepEqual(
    sheetsToSave([
      sheet(0, true, false, true),
      sheet(1, true, true, true),
      sheet(2, false, true, true),
      sheet(3, false, false, false),
    ]),
    [1, 2],
  );
});

test("a blank sheet between inked ones is written so the record stays contiguous", () => {
  assert.deepEqual(
    sheetsToSave([
      sheet(0, true, false, true),
      sheet(1, false, false, false),
      sheet(2, false, true, true),
    ]),
    [1, 2],
  );
});

test("nothing inked, nothing written; order is by seq whatever the input order", () => {
  assert.deepEqual(sheetsToSave([sheet(0, false, false, false)]), []);
  assert.deepEqual(
    sheetsToSave([sheet(1, false, true, true), sheet(0, false, true, true)]),
    [0, 1],
  );
});
