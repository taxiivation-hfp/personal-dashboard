// THE HANDWRITTEN PAGE'S GEOMETRY, and the rules for growing it. Import-free on purpose,
// like rings.ts, goals.ts and dates.ts — `npm test` runs this file's tests directly under
// `node --test`, and the canvas imports these numbers rather than restating them.

/**
 * A HANDWRITTEN PAGE IS A SCROLL OF SHEETS — the owner's ruling, 2026-08-25.
 *
 * It was one fixed A4 canvas, and a page that ran past its eighteenth line simply ran out
 * of paper. The owner writes through the day and comes back to a half-written page at
 * night, so the page now GROWS: one A4 sheet at the start, and one more appended whenever
 * the ink on the last sheet reaches `GROW_AT` of its height. On screen the sheets are one
 * continuous ruled scroll with no visible seam; on the record they are separate PNGs, one
 * row each, and that split is engineering rather than design:
 *
 * - Vercel caps a request body at ~4.5 MB and the journal routes at 4 MB. One ever-taller
 *   PNG would stop saving a few screens down; a sheet at a time never will.
 * - A browser caps a canvas's area, and a phone caps it low. A sheet is one A4 at ≤ 2x DPR
 *   — always under the limit, however long the page.
 * - Only the sheets you TOUCHED are written back. The rest of a long page is not re-sent
 *   because you added a line to the bottom of it.
 *
 * Sheet 0 lives where every page always did — `journal_entries.image` — so every existing
 * page is already a one-sheet scroll and nothing migrates. Sheets 1.. live in
 * `journal_sheets`, keyed (entry_id, seq), contiguous by construction (see engine).
 */

/** A4 portrait: height ÷ width. The same number `.sheet` draws from in globals.css. */
export const SHEET_RATIO = 1.4142;
/** Rules per sheet, whatever the sheet measures. */
export const SHEET_LINES = 18;
/** The margin rule, as a fraction of the sheet's width — 13cqw in `.sheet`. */
export const MARGIN_FRAC = 0.13;
/**
 * When the lowest ink on the LAST sheet passes this fraction of its height, one more sheet
 * is appended. Two thirds, not the bottom edge: paper has to be there before the pen
 * arrives, or the last lines of every sheet are written against a wall.
 */
export const GROW_AT = 2 / 3;
/**
 * The backing store is sized at min(devicePixelRatio, MAX_DPR). A tablet at 3x would put
 * a single sheet at ~8 MP and a ten-sheet page past what a browser will hold in canvases;
 * 2x is where handwriting stops getting sharper to the eye and the memory is a quarter.
 */
export const MAX_DPR = 2;

/**
 * Paper, rule and ink, mirrored from globals.css because a canvas cannot read a CSS
 * variable. Keep in step with --paper, --color-line, --color-line-strong, --color-ink.
 */
export const PAPER = "#fdfbf6";
export const RULE = "#e2dbcd";
export const RULE_STRONG = "#cfc5b2";
export const INK = "#23201b";

/** A sheet's height for a given width. */
export function sheetHeight(width: number): number {
  return width * SHEET_RATIO;
}

/** The distance between rules for a given sheet width. */
export function ruleGap(width: number): number {
  return sheetHeight(width) / SHEET_LINES;
}

/**
 * Where the rules fall on sheet `seq`, in the sheet's own y.
 *
 * Sheet 0 rules at gap, 2·gap … 17·gap — exactly what the single-sheet canvas always
 * drew, so a page saved before the scroll existed is ruled identically to one saved after.
 * Every later sheet ALSO rules its top edge (y = 0): the eighteenth rule of the sheet
 * above is the seam, and without it the seam would read as a double gap — the one place
 * the scroll would confess to being several pieces of paper.
 */
export function ruleYs(seq: number, width: number): number[] {
  const gap = ruleGap(width);
  const ys: number[] = [];
  if (seq > 0) ys.push(0);
  for (let k = 1; k < SHEET_LINES; k++) ys.push(k * gap);
  return ys;
}

/** Which sheet a y in SCROLL space (0 at the top of sheet 0) falls on. */
export function sheetOf(y: number, width: number): number {
  return Math.max(0, Math.floor(y / sheetHeight(width)));
}

/**
 * How many sheets the scroll should have, given how far down the LAST sheet the ink
 * reaches (0..1 of that sheet's height, null when the sheet holds no ink).
 *
 * Grows by ONE. It is called again after the next stroke, so a page that needs several
 * more sheets gets them one at a time as the pen arrives, and a page nobody has written
 * on stays a single sheet — "it shouldn't actually be infinite at the start".
 */
export function sheetsNeeded(
  lowestInkFraction: number | null,
  current: number,
): number {
  const have = Math.max(1, current);
  if (lowestInkFraction == null) return have;
  return lowestInkFraction >= GROW_AT ? have + 1 : have;
}

/**
 * Is this pixel ink rather than paper or ruling?
 *
 * Paper sums to 750, the rules to ~650 and ~580, and ink to 94. Anti-aliased stroke edges
 * sit between; the threshold is set low enough that a rule can never register as ink and
 * high enough that a light pressure stroke does.
 */
export const INK_THRESHOLD = 400;
export function isInkPixel(r: number, g: number, b: number): boolean {
  return r + g + b < INK_THRESHOLD;
}

/**
 * The lowest row that carries ink in an RGBA pixel buffer, or null if none does.
 *
 * Scans from the bottom up, sampling every `step`th row and column: a saved sheet is
 * scanned once, on load, to learn how full it already is — so a page reopened at night
 * with its last sheet written to the foot immediately offers a fresh one. Sampling at
 * `step` means a mark smaller than `step` pixels can be missed, which for this purpose is
 * fine: it decides when to add paper, not what is on it.
 */
export function lowestInkRow(
  rgba: ArrayLike<number>,
  width: number,
  height: number,
  step = 1,
): number | null {
  const s = Math.max(1, Math.floor(step));
  for (let y = height - 1; y >= 0; y -= s) {
    const row = y * width * 4;
    for (let x = 0; x < width; x += s) {
      const i = row + x * 4;
      // Transparent pixels are paper, whatever their colour bytes say.
      if (rgba[i + 3] < 128) continue;
      if (isInkPixel(rgba[i], rgba[i + 1], rgba[i + 2])) return y;
    }
  }
  return null;
}

/** One sheet of the scroll, as the save rule sees it. */
export type SheetSaveState = {
  seq: number;
  /** Exists on the record already. */
  saved: boolean;
  /** Took ink THIS sitting. */
  dirty: boolean;
  /** Carries any ink at all — saved or new. */
  inked: boolean;
};

/**
 * Which sheets a save writes, in order.
 *
 * Everything up to the LAST INKED sheet that is either new to the record or took ink this
 * sitting. Two consequences, both deliberate:
 *
 * - A blank sheet BETWEEN inked ones is written, so the record stays contiguous — the
 *   engine refuses a sheet with a gap before it, and a reader stacking sheets 0..n must
 *   never find one missing.
 * - The blank sheet the canvas keeps ready past the last line is NOT written. Paper that
 *   was offered and never used is not part of the page.
 *
 * A sheet already on the record that took no new ink is left alone: the bytes have not
 * changed, and re-sending a long page's every sheet for one new line is the cost the split
 * exists to avoid.
 */
export function sheetsToSave(sheets: SheetSaveState[]): number[] {
  const sorted = [...sheets].sort((a, b) => a.seq - b.seq);
  let last = -1;
  for (const s of sorted) if (s.inked) last = s.seq;
  return sorted
    .filter((s) => s.seq <= last && (!s.saved || s.dirty))
    .map((s) => s.seq);
}
