"use client";

import { useId, useRef, useState } from "react";
import { brokenRuns, runPoints } from "@/lib/chart";

/**
 * One series over a run of days. The only chart primitive on /stats — and now in the
 * weight and food dialogs, which is why it learned to answer a pointer.
 *
 * A RECORD, not a verdict. There is no average line, no target, no trend arrow, no
 * seven-day smoothing and no comparison between windows. Those are all judgements about a
 * number, and this app judges adherence to a plan, never the numbers the plan produced.
 *
 * INTERACTIVE, not decorated: pointing at a day answers "what exactly was this" — the date
 * and the reading, which is the one question a shape cannot. The crosshair, the marker and
 * the tooltip exist only under the pointer and never rank, colour-code or compare; they
 * print the fact at the finger and nothing else.
 *
 * THE FORM IS CHOSEN BY WHAT THE QUANTITY IS, not by what looks best:
 *
 *   line     a continuous measurement that PERSISTS between readings — weight. Drawn on
 *            the range actually observed, because a weight chart pinned to zero is a flat
 *            line that says nothing. Broken at every gap. (A caller may still fix the axis
 *            with floor+ceiling — the weight dialog's 0–100 is the owner's own ruling for
 *            that surface.)
 *   bars     a total that accumulates and then starts again — calories, adherence. From
 *            ZERO, because a bar that doesn't start at zero lies about its proportions,
 *            and because a line would imply Tuesday's intake flowed into Wednesday's.
 *   stacked  bars with composition — productivity, split by where the hours went.
 *
 * A DAY WITH NO ENTRY DRAWS NOTHING. Not a zero-height bar, not a line through it. An
 * unweighed morning is not a morning that weighed nothing, and this app is new enough that
 * most days in a 90-day window are blank — a chart that drew them as zeros would report a
 * catastrophe that never happened. Pointing at such a day says "no entry", which is the
 * same statement out loud.
 */

export type ChartSegment = {
  key: string;
  points: number;
  fill: string;
  /** Names the slice in the legend and the tooltip. Optional — a caller that cannot name
   *  its colours simply gets no legend rather than a legend of hex codes. */
  label?: string;
};

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

/** The tooltip carries the weekday too — out of the axis's context, "Sat 8 Aug" is the
 *  form a day is actually remembered in. */
const longer = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/**
 * Past this many days the bars are thinner than the gap between them, so the gap goes.
 * Ninety hairlines with a pixel between each is a texture, not a chart.
 */
const GAP_LIMIT = 70;

/** Where the horizontal gridlines sit, as fractions of the span. Quarters, because the
 *  reader's question is "roughly where is this" and quarters answer it without turning
 *  the plot into graph paper. */
const GRID_AT = [0.25, 0.5, 0.75] as const;

export default function DayChart({
  points,
  form,
  unit,
  marker = null,
  /** Fixed ceiling, for a quantity that has one. Adherence is 100. */
  ceiling = null,
  /**
   * Fixed bottom, for a LINE a caller wants on an absolute axis rather than the observed
   * range — the weight dialog's 0–100kg. Only meaningful with `ceiling`; bars are always
   * from zero regardless.
   */
  floor = null,
  height = 160,
  colour = "var(--color-accent)",
  emptyNote,
}: {
  points: ChartPoint[];
  form: ChartForm;
  unit: string;
  ceiling?: number | null;
  floor?: number | null;
  /**
   * A horizontal reference line at this value — A FLOOR, and only ever a floor.
   *
   * The house rule against target lines stands for every judged quantity. What may take
   * this line is the narrow set the app already draws a floor for elsewhere: calories at
   * 2,500 and steps at 7,000, both of which wear a dashed box on the checklist and print
   * "/floor" beside their figure. The line here says the same thing those already say, in
   * the one place the shape of a fortnight is visible.
   *
   * That is the whole permitted set, and the distinction that keeps it small is the
   * DIRECTION: a floor is a line you climb to, so a day under it is "not yet". A ceiling
   * or a goal would be a line you can be found wanting against, and this app draws none.
   *
   * Dotted and red — the app's only red, reserved for this line — so it reads as the
   * floor's own mark rather than as another data series.
   */
  marker?: number | null;
  height?: number;
  colour?: string;
  emptyNote: string;
}) {
  const gradId = useId();
  const boxRef = useRef<HTMLDivElement>(null);
  /** Index of the day under the pointer, or null. The only interaction state there is. */
  const [hover, setHover] = useState<number | null>(null);

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
  // A caller-fixed floor+ceiling overrides both: that is an absolute axis, theirs to rule.
  const pad = form === "line" ? Math.max((hi - lo) * 0.15, 0.5) : 0;
  let top = ceiling ?? (form === "line" ? hi + pad : Math.max(hi, 1));
  // The marker must be ON the chart to mean anything: a floor above every bar so far
  // would otherwise sit outside the box, invisible exactly when it matters most.
  if (marker != null && ceiling == null) top = Math.max(top, marker * 1.04);
  const bottom = floor ?? (form === "line" ? lo - pad : 0);
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

  /**
   * Pointer → day index. Bars own a column each, so the pointer is IN one; the line's
   * points sit at column edges, so the NEAREST one answers. Clamped, because a pointer a
   * pixel past the padding must mean the last day rather than a day that does not exist.
   */
  const indexAt = (clientX: number): number => {
    const r = boxRef.current?.getBoundingClientRect();
    if (!r || r.width === 0) return 0;
    const t = (clientX - r.left) / r.width;
    const i = form === "line" ? Math.round(t * (n - 1)) : Math.floor(t * n);
    return Math.min(n - 1, Math.max(0, i));
  };

  const hovered = hover == null ? null : points[hover]!;
  /** The hover x, at the point for a line and mid-column for a bar. */
  const hoverX = hover == null ? 0 : form === "line" ? x(hover) : ((hover + 0.5) / n) * 100;

  /**
   * The LEGEND, for a stacked chart whose caller named its colours: one swatch per
   * distinct fill, in first-appearance order. Drawn by the chart rather than by every
   * caller so the record's hours chart and any future stacked surface cannot disagree
   * about what a legend looks like.
   */
  const legend = (() => {
    if (form !== "stacked") return [];
    const seen = new Map<string, string>();
    for (const p of points)
      for (const s of p.segments ?? [])
        if (s.label && !seen.has(s.fill)) seen.set(s.fill, s.label);
    return [...seen.entries()].map(([fill, label]) => ({ fill, label }));
  })();

  return (
    <>
      <div
        ref={boxRef}
        className="relative border-b border-[var(--color-line-strong)]"
        style={{ height, touchAction: "pan-y" }}
        onPointerMove={(e) => setHover(indexAt(e.clientX))}
        onPointerDown={(e) => setHover(indexAt(e.clientX))}
        onPointerLeave={() => setHover(null)}
      >
        {/* THE GRID, behind everything: three hairlines at the quarter marks, each naming
            its value at the left edge. What turns a silhouette into a chart you can read a
            number off — the ends were already printed under the axis; these carry the
            middle. First in DOM order so the data paints over them. */}
        {GRID_AT.map((k) => (
          <div
            key={k}
            aria-hidden
            className="pointer-events-none absolute inset-x-0"
            style={{ top: `${100 - k * 100}%` }}
          >
            <div className="h-px w-full bg-[var(--color-line)]" />
            {/* text-micro, not a smaller ad-hoc size — the type scale has five steps and
                a chart does not get a sixth. */}
            <span className="absolute left-0 top-0 -translate-y-full pr-1 text-micro tabular-nums text-[var(--color-muted)]">
              {fmt(bottom + span * k)}
            </span>
          </div>
        ))}

        {form === "line" ? (
          <svg
            // POSITIONED, and that is the gridline z-fix: the gridlines above are
            // absolutely positioned, and a static element paints UNDER positioned ones
            // whatever the DOM order says. `relative` puts the data back in the same
            // stacking order as the grid, where later-in-DOM wins.
            className="relative h-full w-full"
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
          // `relative` for the same gridline z-fix the line's svg carries: bars must
          // paint OVER the grid, and only a positioned box competes with positioned
          // gridlines on DOM order.
          <div className="relative flex h-full items-end" style={{ gap }}>
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

        {/* THE FLOOR LINE — see the `marker` prop. Positioned after the data so it stays
            visible over the bars; its value rides at the right edge so the line never has
            to be traced back to the axis. */}
        {marker != null && marker >= bottom && marker <= top && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0"
            style={{
              top: `${100 - ((marker - bottom) / span) * 100}%`,
              borderTop: "2px dotted var(--color-floor-line)",
            }}
          >
            <span className="absolute right-0 top-0 pl-1 text-micro tabular-nums text-[var(--color-floor-line)]">
              {fmt(marker)}
            </span>
          </div>
        )}

        {/* THE POINTER'S ANSWER. A crosshair on the day, a marker on the reading, and the
            fact itself in a small panel pinned to the top of the plot. All of it exists
            only under the pointer, prints only what is recorded, and compares nothing. */}
        {hover != null && hovered && (
          <>
            {/* The day's vertical, full height, behind the tooltip. For bars it is a wash
                over the day's whole column, so the bar reads as picked out rather than
                pointed near. */}
            {form === "line" ? (
              <div
                aria-hidden
                className="pointer-events-none absolute inset-y-0 w-px bg-[var(--color-line-strong)]"
                style={{ left: `${hoverX}%` }}
              />
            ) : (
              <div
                aria-hidden
                // Borders, not an inset box-shadow standing in for them — the shadow
                // count in this app is zero and stays zero.
                className="pointer-events-none absolute inset-y-0 border-x border-[var(--color-line-strong)]"
                style={{
                  left: `${(hover / n) * 100}%`,
                  width: `${100 / n}%`,
                  background:
                    "color-mix(in oklab, var(--color-ink) 7%, transparent)",
                }}
              />
            )}

            {/* The marker, on the reading itself — line form only, where the value is a
                point rather than a column. Panel-filled so the line passes visibly under
                a ring rather than through a blot. */}
            {form === "line" && hovered.value != null && (
              <span
                aria-hidden
                className="pointer-events-none absolute h-2.5 w-2.5 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 bg-[var(--color-panel)]"
                style={{
                  left: `${hoverX}%`,
                  top: `${y(hovered.value)}%`,
                  borderColor: colour,
                }}
              />
            )}

            {/* The fact: date, then the reading — or "no entry", said plainly. Clamped to
                the plot's edges so the first and last days stay readable. */}
            <div
              className="pointer-events-none absolute top-1 z-10 whitespace-nowrap rounded-lg border border-[var(--color-line)] bg-[var(--color-panel)] px-2.5 py-1.5 text-micro"
              style={{
                left: `${hoverX}%`,
                transform:
                  hoverX < 14
                    ? "none"
                    : hoverX > 86
                      ? "translateX(-100%)"
                      : "translateX(-50%)",
              }}
            >
              <span className="text-[var(--color-muted)]">
                {longer(hovered.date)}
              </span>{" "}
              <span className="font-semibold tabular-nums">
                {hovered.value == null
                  ? "no entry"
                  : `${fmt(hovered.value)}${unit ? ` ${unit}` : ""}`}
              </span>
              {/* The composition, for a stacked day: each named slice and its share, the
                  same facts the bar's bands already draw. */}
              {form === "stacked" &&
                hovered.value != null &&
                (hovered.segments ?? []).filter((s) => s.label).length > 0 && (
                  <span className="mt-0.5 block text-micro text-[var(--color-muted)]">
                    {(hovered.segments ?? [])
                      .filter((s) => s.label)
                      .map((s) => `${s.label} ${fmt(s.points)}`)
                      .join(" · ")}
                  </span>
                )}
            </div>
          </>
        )}
      </div>

      {/* Two dates and the range. Ninety labels under ninety days is a ruler; the reader
          needs to know which end is which and what the shape is scaled against — the
          gridlines above carry the values in between. */}
      <div className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-micro tabular-nums text-[var(--color-muted)]">
        <span>{short(points[0]!.date)}</span>
        <span>
          {ceiling != null
            ? `${fmt(bottom)}–${fmt(ceiling)}${unit ? ` ${unit}` : ""}`
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

      {/* The legend, when the caller named its colours. Swatches on one line, not a boxed
          key — the same treatment the week strip's legend settled on. */}
      {legend.length > 0 && (
        <ul className="mt-2 flex flex-wrap gap-x-3 gap-y-1">
          {legend.map((k) => (
            <li
              key={k.fill}
              className="flex items-center gap-1.5 text-micro text-[var(--color-muted)]"
            >
              <span
                aria-hidden
                className="h-2 w-2 shrink-0 rounded-[2px]"
                style={{ background: k.fill }}
              />
              {k.label}
            </li>
          ))}
        </ul>
      )}
    </>
  );
}
