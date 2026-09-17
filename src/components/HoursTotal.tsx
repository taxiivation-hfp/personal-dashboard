"use client";

import { useEffect, useMemo, useRef } from "react";
import type { ChartPoint } from "./DayChart";

/**
 * WHERE THE WINDOW'S HOURS WENT — the "hours worked" figure's own workings.
 *
 * The figure states a total and the chart beside it states a shape; neither answers the
 * question the owner actually asks of it, which is "how much of that went to the portfolio,
 * how much to uni, how much to the till". That split is the entire point of the productivity
 * categories, and until now it was only visible one day at a time.
 *
 * DERIVED FROM THE SERIES ALREADY LOADED, not from a new request. The stacked chart's points
 * carry a segment per category per day, each with the minutes that earned it — so summing
 * them here cannot disagree with the bars above, because it IS the bars above. A second
 * query would eventually drift from what the chart draws, and a disagreeing explanation is
 * worse than none.
 *
 * MINUTES, NOT POINTS — and there are no points left anywhere to leak. The productivity
 * score is gone (the owner's ruling of 2026-09-18: "quantifying productivity is stupid"),
 * so what a segment carries IS its minutes. This sheet reports hours, which is a fact about
 * where a week went rather than a judgement about it.
 */

const asTime = (mins: number): string => {
  const m = Math.round(mins);
  const h = Math.floor(m / 60);
  const r = m % 60;
  if (!h) return `${r}m`;
  return r ? `${h}h ${r}m` : `${h}h`;
};

export default function HoursTotal({
  points,
  label,
  onClose,
}: {
  /** The stacked hours series, exactly as the chart above received it. */
  points: ChartPoint[];
  /** What window this is about, in the record's own words. */
  label: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  const rows = useMemo(() => {
    // Keyed by LABEL, not by colour — one category may own two calendar colours (Work Part
    // Time is Lavender and Tomato), and keying by colour would split it into two rows that
    // are the same thing. The same ruling scoreDay makes when it builds the slabs.
    const by = new Map<string, { minutes: number; fill: string }>();
    for (const p of points) {
      for (const seg of p.segments ?? []) {
        // An unlabelled slice cannot be reported as a category — a row headed by a hex code
        // explains nothing. The chart already declines to draw a legend for one, and this
        // declines to name it, for the same reason.
        if (!seg.label || !seg.minutes) continue;
        const cur = by.get(seg.label) ?? { minutes: 0, fill: seg.fill };
        cur.minutes += seg.minutes;
        by.set(seg.label, cur);
      }
    }
    return [...by.entries()]
      .map(([label, v]) => ({ label, ...v }))
      // Only things measured in time. Kept as a guard rather than deleted with the score:
      // a category summing to zero minutes is a row saying nothing, and the stack's own
      // rounding can produce one.
      .filter((r) => r.minutes > 0)
      .sort((a, b) => b.minutes - a.minutes);
  }, [points]);

  const total = rows.reduce((s, r) => s + r.minutes, 0);
  const widest = Math.max(1, ...rows.map((r) => r.minutes));

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,560px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="min-w-0 truncate text-small font-semibold">
          Where the hours went
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          close
        </button>
      </div>

      <p className="mt-2 text-micro text-[var(--color-muted)]">{label}</p>

      {rows.length === 0 ? (
        <p className="pt-4 text-small text-[var(--color-muted)]">
          No blocked hours marked adhered in this window.
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-[var(--color-line)]">
          {rows.map((r) => (
            <li key={r.label} className="py-2.5">
              <div className="flex items-baseline justify-between gap-3">
                <span className="flex min-w-0 items-baseline gap-2">
                  <span
                    aria-hidden
                    className="h-2 w-2 shrink-0 rounded-full"
                    style={{ background: r.fill }}
                  />
                  <span className="min-w-0 truncate font-serif text-small">
                    {r.label}
                  </span>
                </span>
                <span className="shrink-0 text-small tabular-nums">
                  {asTime(r.minutes)}
                </span>
              </div>
              {/* A bar against the BIGGEST category, not against the total. It is there to
                  make the ordering readable at a glance, not to state a share — a share
                  would invite reading one category as a percentage of a week, which is a
                  comparison this app does not draw. scaleX, never width. */}
              <div className="mt-1.5 h-1 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                <div
                  className="motion-data h-full w-full origin-left rounded-full"
                  style={{
                    transform: `scaleX(${r.minutes / widest})`,
                    background: r.fill,
                  }}
                />
              </div>
            </li>
          ))}
        </ul>
      )}

      {rows.length > 0 && (
        <p className="mt-4 flex items-baseline justify-between border-t border-[var(--color-line)] pt-3 text-small">
          <span className="text-[var(--color-muted)]">together</span>
          <span className="tabular-nums">{asTime(total)}</span>
        </p>
      )}

      {/* The closing paragraph is GONE — TEXT IS DATA. It explained the sheet and it
          talked about scoring, and the score no longer exists. What it argued lives in
          productivity.ts, where hoursForDay decides what an hour worked is. */}
    </dialog>
  );
}
