"use client";

import { useId } from "react";
import { brokenRuns, runPoints } from "@/lib/chart";

/**
 * One series over a run of days. The only chart primitive on /stats.
 *
 * A RECORD, not a verdict. There is no average line, no target, no trend arrow, no
 * seven-day smoothing and no comparison between windows. Those are all judgements about a
 * number, and this app judges adherence to a plan, never the numbers the plan produced.
 *
 * THE FORM IS CHOSEN BY WHAT THE QUANTITY IS, not by what looks best:
 *
 *   line     a continuous measurement that PERSISTS between readings — weight. Drawn on
 *            the range actually observed, because a weight chart pinned to zero is a flat
 *            line that says nothing. Broken at every gap.
 *   bars     a total that accumulates and then starts again — calories, adherence. From
 *            ZERO, because a bar that doesn't start at zero lies about its proportions,
 *            and because a line would imply Tuesday's intake flowed into Wednesday's.
 *   stacked  bars with composition — productivity, split by where the hours went.
 *
 * A DAY WITH NO ENTRY DRAWS NOTHING. Not a zero-height bar, not a line through it. An
 * unweighed morning is not a morning that weighed nothing, and this app is new enough that
 * most days in a 90-day window are blank — a chart that drew them as zeros would report a
 * catastrophe that never happened.
 */

export type ChartSegment = { key: string; points: number; fill: string };

export type ChartPoint = {
  date: string;
  /** null means NO ENTRY. Never coerce it to 0. */
  value: number | null;
  /** Stacked form only. Must sum to `value`. */
  segments?: ChartSegment[];
};

export type ChartForm = "line" | "bars" | "stacked";

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const short = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/**
 * Past this many days the bars are thinner than the gap between them, so the gap goes.
 * Ninety hairlines with a pixel between each is a texture, not a chart.
 */
const GAP_LIMIT = 70;

export default function DayChart({
  points,
  form,
  unit,
  /** Fixed ceiling, for a quantity that has one. Adherence is 100; nothing else has one. */
  ceiling = null,
  height = 160,
  colour = "var(--color-accent)",
  emptyNote,
}: {
  points: ChartPoint[];
  form: ChartForm;
  unit: string;
  ceiling?: number | null;
  height?: number;
  colour?: string;
  emptyNote: string;
}) {
  const gradId = useId();
  const present = points
    .map((p) => p.value)
    .filter((v): v is number => v != null);

  if (present.length === 0)
    return (
      <p className="py-8 text-small leading-relaxed text-[var(--color-muted)]">
        {emptyNote}
      </p>
    );

  const hi = Math.max(...present);
  const lo = Math.min(...present);

  // The line floats on its own range with a slice of it as headroom; everything else is
  // measured from zero. See the docblock — this is the whole reason the two forms exist.
  const pad = form === "line" ? Math.max((hi - lo) * 0.15, 0.5) : 0;
  const top = ceiling ?? (form === "line" ? hi + pad : Math.max(hi, 1));
  const bottom = form === "line" ? lo - pad : 0;
  const span = Math.max(top - bottom, 0.001);

  const n = points.length;
  const gap = n > GAP_LIMIT ? 0 : 1;

  /** Weight carries a decimal because 0.4kg is a real difference; nothing else does. */
  const fmt = (v: number) =>
    form === "line" ? String(Math.round(v * 10) / 10) : String(Math.round(v));

  // --- line ------------------------------------------------------------------------------
  const y = (v: number) => 100 - ((v - bottom) / span) * 100;
  const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);

  /**
   * The line, BROKEN at every gap — see src/lib/chart.ts, which owns both rules and is
   * tested. They were inline here and they are exactly the kind of thing that looks fine
   * until it is someone's first week: a single-point polyline draws nothing at all, and a
   * line drawn through a gap invents data in the one place there is none.
   */
  const runs =
    form === "line"
      ? brokenRuns(points.map((p) => p.value)).map((run) =>
          runPoints(run, (i) => [x(i), y(points[i]!.value!)]),
        )
      : [];

  const latest = [...points].reverse().find((p) => p.value != null);

  return (
    <>
      <div
        className="relative border-b border-[var(--color-line-strong)]"
        style={{ height }}
      >
        {form === "line" ? (
          <svg
            className="h-full w-full"
            viewBox="0 0 100 100"
            preserveAspectRatio="none"
            aria-hidden
          >
            {runs.map((pts, i) => (
              <polyline
                key={i}
                points={pts}
                fill="none"
                stroke={colour}
                strokeWidth="2"
                // Without this the non-uniform stretch would make the stroke thicker on
                // the vertical than on the horizontal.
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
                strokeLinecap="round"
              />
            ))}
            {/* Declared but unused unless a caller asks for it — kept so a future fill
                under the line has an id to reference rather than inventing one. */}
            <defs>
              <linearGradient id={gradId} x1="0" y1="0" x2="0" y2="1">
                <stop offset="0%" stopColor={colour} stopOpacity="0.14" />
                <stop offset="100%" stopColor={colour} stopOpacity="0" />
              </linearGradient>
            </defs>
          </svg>
        ) : (
          <div className="flex h-full items-end" style={{ gap }}>
            {points.map((p) => {
              // Share of the box, from zero. A real total below 1.5% of the peak still gets
              // a hairline, so a light day is a light day rather than an absent one.
              const h =
                p.value == null ? 0 : Math.max((p.value / top) * 100, 1.5);
              return (
                <div
                  key={p.date}
                  className="flex min-w-0 flex-1 flex-col justify-end"
                  style={{ height: `${h}%` }}
                >
                  {form === "stacked" && p.segments && p.value ? (
                    // Bottom-up, largest at the base — the same order the week strip uses,
                    // so a day reads the same shape in both places.
                    [...p.segments].reverse().map((s, i) => (
                      <div
                        key={s.key}
                        style={{
                          height: `${(s.points / p.value!) * 100}%`,
                          background: s.fill,
                          borderTop:
                            i === 0 || n > GAP_LIMIT
                              ? undefined
                              : "1px solid var(--color-surface-1)",
                        }}
                      />
                    ))
                  ) : (
                    <div
                      className="h-full w-full"
                      style={{
                        background: p.value == null ? "transparent" : colour,
                      }}
                    />
                  )}
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* Two dates and the observed range. Ninety labels under ninety days is a ruler; the
          reader needs to know which end is which and what the shape is scaled against. */}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-micro tabular-nums text-[var(--color-muted)]">
        <span>{short(points[0]!.date)}</span>
        <span>
          {ceiling != null
            ? `0–${fmt(ceiling)}${unit ? ` ${unit}` : ""}`
            : `${fmt(lo)}–${fmt(hi)}${unit ? ` ${unit}` : ""}`}
          {/* Only when some days are MISSING. Adherence has a figure for every day in the
              window by construction, so "30 days logged" there would be counting the axis
              rather than the record — a caption that is true of any window and therefore
              says nothing. */}
          {present.length < points.length && (
            <>
              {" · "}
              {present.length} of {points.length} days
            </>
          )}
          {latest && form === "line" && (
            <>
              {" · last "}
              <span className="text-[var(--color-ink)]">
                {fmt(latest.value!)}
                {unit ? ` ${unit}` : ""}
              </span>
            </>
          )}
        </span>
        <span>{short(points[points.length - 1]!.date)}</span>
      </div>
    </>
  );
}
