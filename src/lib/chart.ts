// Chart geometry that has to be right. PURE — no DB, no React, zero imports, so this runs
// under `node --test` with no dependencies.
//
// There is one idea in this file and it is the one the whole app's honesty rests on when it
// draws a series: A DAY WITH NO ENTRY IS NOT A ZERO. An unweighed morning is not a morning
// that weighed nothing, and a day with no food logged is not a fast. Everything here exists
// to make a gap look like a gap.

/**
 * The unbroken runs of present values, as index ranges.
 *
 * A single polyline through every present day would join Monday to Friday with a straight
 * segment that reads as three days of steady change nobody measured — the line would be
 * inventing data in exactly the place the data is missing. Each run gets its own polyline
 * instead, and the gaps are drawn by not drawing.
 *
 * Returned as INDEX RANGES rather than points so the caller owns the coordinate maths and
 * this stays testable without one.
 */
export function brokenRuns(values: (number | null)[]): [number, number][] {
  const runs: [number, number][] = [];
  let start: number | null = null;
  values.forEach((v, i) => {
    if (v == null) {
      if (start != null) runs.push([start, i - 1]);
      start = null;
      return;
    }
    if (start == null) start = i;
  });
  if (start != null) runs.push([start, values.length - 1]);
  return runs;
}

/**
 * The points for one run, with a LONE READING EMITTED TWICE.
 *
 * A polyline with a single point draws nothing at all — no stroke, no cap, nothing — which
 * would leave the commonest first-week state (one weighing) as an empty box under a caption
 * saying "1 day logged". Two identical points with a round cap is a dot, exactly on its day.
 *
 * This is the kind of thing that is invisible until it is someone's first week, which is the
 * worst possible time for a chart to look broken.
 */
export function runPoints(
  run: [number, number],
  at: (i: number) => [number, number],
): string {
  const [from, to] = run;
  const pts: string[] = [];
  for (let i = from; i <= to; i++) {
    const [x, y] = at(i);
    pts.push(`${x.toFixed(2)},${y.toFixed(2)}`);
  }
  if (pts.length === 1) pts.push(pts[0]!);
  return pts.join(" ");
}
