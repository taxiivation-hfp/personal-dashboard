"use client";

import { prettyDate } from "@/lib/dates";
import type { TrackerDay } from "./PillarSections";

/**
 * THE ADHERENCE TRACKER — the middle of the Recent window, and what replaced the week strip
 * that used to sit under the hero ring (spec §4).
 *
 * The strip was four rows in one card: a percentage per column, a 3px bar under each, a
 * stacked productivity column under that, and a row of weekday letters, with a transparent
 * button laid over all four. It said four things at once, one of which (the score) the owner
 * has since deleted outright, and the adherence half of it was seven separate bars that the
 * eye had to join up itself.
 *
 * This says ONE thing: what the last week looked like. A line with the area filled under it,
 * because that is the form for a quantity you read as a shape rather than as seven readings.
 *
 * Every rule below is the owner's, from the spec:
 *
 * - SEVEN PAST DAYS, always anchored to the REAL today, never to the day being viewed. The
 *   strip was fixed for the same reason and it is worth restating: a chart that travelled
 *   with the screen could only ever be walked backwards, and it would rescale against a
 *   different week's high at every step. Fixed, it is a ruler.
 * - TODAY IS DRAWN APART — a hollow dot on a dashed segment, on the line but not under the
 *   area and not in the average. It is a day in progress; the figure only climbs, so
 *   averaging a morning in with six finished days would drag the week down for no reason
 *   other than the hour.
 * - Y IS FIXED 0–100, never scaled to the week's high. Adherence is the one series in this
 *   app with a real ceiling, and scaling it to itself would make a week of 40s look like a
 *   week of 100s.
 * - THE AVERAGE is the mean of the seven past days with every zero counted. CLAUDE.md's
 *   "no average" rule is REMOVED by the owner for this one figure (spec §4) — do not read it
 *   as licence anywhere else. It survives everywhere on /stats, where a window average would
 *   be a verdict on a quarter.
 * - NOTHING ELSE. No tooltips, no gridline numbers, no axis ticks, no productivity, no
 *   legend, no streak flame, no target line, no comparison.
 *
 * A dot is a way IN: tapping one steps the whole dashboard to that day, which is the gesture
 * the week strip's overlay buttons had and the one thing about it worth keeping.
 */

/** The SVG's logical box. Drawn at width 100% with the default preserveAspectRatio, so the
 *  whole chart scales as one object — `none` would shear the dots into ellipses. */
const W = 280;
const H = 96;
const PAD_L = 6;
const PAD_R = 6;
const PAD_T = 8;
const PAD_B = 8;

/** Seven past days plus today. The count is the frame: fewer than this and the chart is not
 *  drawn at all, because a half-drawn week reads as a bad one. */
const SLOTS = 8;
const PAST = SLOTS - 1;

const SPAN = W - PAD_L - PAD_R; /* 268 */
const STEP = SPAN / (SLOTS - 1); /* 38.28… */
const PLOT_H = H - PAD_T - PAD_B; /* 80 */
/** The area's foot, and the 0% line — the same y, deliberately: a day at zero should meet
 *  the baseline rather than float above it. */
const BASE = H - PAD_B;

const x = (i: number) => PAD_L + i * STEP;
const y = (pct: number) =>
  PAD_T + (1 - Math.min(100, Math.max(0, pct)) / 100) * PLOT_H;

/** "2026-09-18" → "F". Noon, never midnight: a bare ISO date parses as UTC and lands on the
 *  day before anywhere west of Greenwich. */
const narrowDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", { weekday: "narrow" });

export default function AdherenceTracker({
  days,
  viewing,
  onDay,
}: {
  /** 8 days, oldest first, ending on the REAL today. Fewer than 8 renders the frame and "—". */
  days: TrackerDay[];
  /** The day the dashboard is on — its dot takes a 1.5px ink ring. */
  viewing: string;
  onDay: (date: string) => void;
}) {
  const ready = days.length >= SLOTS;
  const past = ready ? days.slice(0, PAST) : [];
  const now = ready ? days[PAST]! : null;

  // Every day counts, zeros included (spec §4) — a week with two days off IS a week with two
  // days off, and dropping them would make the figure a story about which days you looked at.
  const avg = ready
    ? Math.round(past.reduce((s, d) => s + d.pct, 0) / PAST)
    : null;

  const pts = past.map((d, i) => [x(i), y(d.pct)] as const);

  return (
    <section className="record-card shrink-0">
      <div className="section-head">
        <h2 className="text-small font-semibold">average</h2>
        {/* One step darker than the area it is printed over — see --color-accent-deep in
            globals.css. Not a second accent: a figure sitting on a tint of its own colour
            has to be darker than that tint to read. */}
        <span
          className="stat-hero text-heading"
          style={{
            color:
              avg == null ? "var(--color-muted)" : "var(--color-accent-deep)",
          }}
        >
          {avg == null ? "—" : `${avg}%`}
        </span>
      </div>

      {/* The frame is drawn whether or not the days have landed, so the card does not change
          height under the tracker when the fetch answers — this column has no scroll to give
          and a late reflow would push the record link off the bottom of the window. */}
      <svg
        className="mt-3 block w-full"
        width="100%"
        viewBox={`0 0 ${W} ${H}`}
        role="img"
        aria-label={
          avg == null
            ? "Adherence, the last week"
            : `Adherence, the last week. Average ${avg}%`
        }
      >
        {ready && (
          <>
            {/* THE AREA — the seven past days only. Today is a day in progress and does not
                get the weight of a filled shape under it. */}
            <path
              d={`M ${pts.map(([px, py]) => `${px} ${py}`).join(" L ")} L ${x(PAST - 1)} ${BASE} L ${x(0)} ${BASE} Z`}
              fill="rgb(var(--color-accent-rgb) / 0.16)"
              stroke="none"
            />

            {/* THE LINE. Round joins because the week is one continuous reading, not seven
                separate ones welded together. */}
            <polyline
              points={pts.map(([px, py]) => `${px},${py}`).join(" ")}
              fill="none"
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeLinecap="round"
              strokeLinejoin="round"
            />

            {/* TODAY'S SEGMENT, dashed: the figure is still climbing, so the join to it is a
                projection of where the week is rather than a reading of where it ended. */}
            <line
              x1={x(PAST - 1)}
              y1={y(past[PAST - 1]!.pct)}
              x2={x(PAST)}
              y2={y(now!.pct)}
              stroke="var(--color-accent)"
              strokeWidth={2}
              strokeDasharray="4 3"
              strokeLinecap="round"
            />

            {past.map((d, i) => (
              <circle
                key={d.date}
                cx={x(i)}
                cy={y(d.pct)}
                r={3}
                fill="var(--color-accent)"
              />
            ))}

            {/* HOLLOW, and filled with THE CARD'S own ground rather than left transparent
                — the line passes under it, and an open dot would have the stroke running
                straight through its middle.
                The ground to match is the CARD's, not the window's: this chart sits in a
                `.record-card`, which paints `var(--card-bg, var(--color-panel))`. Filled
                with the gold window behind the card it was still opaque and still masked
                the line, but it read as a filled dot in a third colour instead of as a
                hole in it — and a hole is the one thing spec §4 asks of today's dot. The
                variable and its fallback are written exactly as the class writes them, so
                a card handed a `--card-bg` moves the dot with it. */}
            <circle
              cx={x(PAST)}
              cy={y(now!.pct)}
              r={3.5}
              fill="var(--card-bg, var(--color-panel))"
              stroke="var(--color-accent)"
              strokeWidth={1.75}
            />

            {/* THE DAY THE DASHBOARD IS STANDING ON, ringed in ink. Ink rather than a hue:
                this says "you are here", which is a fact about the app and not about the
                week. Absent entirely when the viewed day is older than the chart — which is
                honest, and better than ringing an edge dot that is not the day. */}
            {days.map((d, i) =>
              d.date === viewing ? (
                <circle
                  key={`v${d.date}`}
                  cx={x(i)}
                  cy={y(d.pct)}
                  r={5.5}
                  fill="none"
                  stroke="var(--color-ink)"
                  strokeWidth={1.5}
                />
              ) : null,
            )}

            {/* THE WAY IN, one full-height column per day. Transparent rects rather than
                controls drawn around the dots: a 3px dot is not a target at 11pm, and the
                column is where a hand already reaches to read a day. Focusable, with Enter
                and Space, because a chart that can only be used with a pointer is a chart
                half the app cannot use. */}
            {days.map((d, i) => (
              <g
                key={`hit${d.date}`}
                role="button"
                tabIndex={0}
                aria-label={`${prettyDate(d.date)} · ${d.pct}% — open that day`}
                onClick={() => onDay(d.date)}
                onKeyDown={(e) => {
                  if (e.key === "Enter" || e.key === " ") {
                    e.preventDefault();
                    onDay(d.date);
                  }
                }}
                className="cursor-pointer outline-none"
              >
                <rect
                  x={x(i) - STEP / 2}
                  y={0}
                  width={STEP}
                  height={H}
                  fill="transparent"
                />
              </g>
            ))}
          </>
        )}
      </svg>

      {/* The axis, in HTML rather than in the SVG: real type, so the letters stay at the
          app's own micro step however wide the window is instead of scaling with the
          viewBox.
          POSITIONED OFF `x()`, THE SAME FUNCTION THE DOTS USE. It was eight equal `flex-1`
          cells, whose centres fall at 6.25% … 93.75% of the row — while the plot's own
          slots sit at 2.14% … 97.86%, because the SVG reserves PAD_L/PAD_R either side.
          The two agreed in the middle and diverged by half a cell at the ends, so the
          leftmost letter stood ~19px right of its dot and `today` stood ~20px left of the
          hollow one it names. On a past day the underline under a label is what says which
          column you are standing on, and at the edges it was pointing between two dots.
          Percentages of the ROW's width work because the SVG carries no height attribute:
          with a viewBox and width 100% it takes its aspect ratio from the box, so there is
          no letterboxing and viewBox x maps straight onto the row beneath it. The geometry
          constants stay the one source of truth and the two can never drift apart again.
          The row needs an explicit height — absolutely positioned children give it none. */}
      <div className="relative mt-1.5 h-5 text-micro tabular-nums">
        {Array.from({ length: SLOTS }, (_, i) => {
          const d = days[i];
          // The LAST slot is today by this component's contract; `isToday` is the server
          // agreeing. Either is enough to put the label in ink.
          const isNow = i === SLOTS - 1 || Boolean(d?.isToday);
          const viewed = d?.date === viewing;
          return (
            <span
              key={d?.date ?? i}
              style={{ left: `${(x(i) / W) * 100}%` }}
              className={`absolute top-0 -translate-x-1/2 whitespace-nowrap ${
                viewed
                  ? "underline decoration-[var(--color-ink)] decoration-2 underline-offset-4"
                  : ""
              } ${isNow ? "text-[var(--color-ink)]" : "text-[var(--color-muted)]"}`}
            >
              {i === SLOTS - 1 ? "today" : d ? narrowDay(d.date) : " "}
            </span>
          );
        })}
      </div>
    </section>
  );
}
