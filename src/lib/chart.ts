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

/**
 * Every present reading, in order, as ONE run — the bridge across the gaps.
 *
 * The counterpart to brokenRuns, and it exists because the owner asked for the weight line
 * to be continuous. Both are drawn: this one underneath, and the measured runs on top of it.
 *
 * THE TWO ARE DRAWN DIFFERENTLY, and that is the whole reason this is a separate function
 * rather than a flag on the one above. A bridge is an INFERENCE — it says "these two
 * readings are the same body, a week apart" — where a measured run is a record. Drawing them
 * identically would make a fortnight between weigh-ins look exactly like a fortnight of
 * daily weighing, which is the one claim this file exists to refuse. The caller renders this
 * dashed and faint; the solid stroke stays reserved for days that were actually measured.
 *
 * Weight earns the bridge where calories and steps could not: a body HAS a weight on a day
 * nobody wrote one down, so joining two readings interpolates something real. An unlogged
 * day's intake is not a number that quietly existed, which is why bars stay broken.
 */
export function bridgeRun(values: (number | null)[]): [number, number][] {
  const present: [number, number][] = [];
  values.forEach((v, i) => {
    if (v != null) present.push([i, v]);
  });
  return present;
}
