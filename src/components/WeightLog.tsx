"use client";

import { useEffect, useRef, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import WeightEntry from "./WeightEntry";

/**
 * THE WEIGHT TREND, behind the checklist row — the record page's own weight panel, in the
 * dialog the workout and food logs established: DayChart on top, the backfill entry under
 * it, exactly the pairing the record draws.
 *
 * ON THE OBSERVED RANGE, exactly as the record's chart draws it — the owner's ruling,
 * 2026-08-24, REVERSING the fixed 0–100kg axis this dialog shipped with. Same window
 * (30 days), same domain arithmetic (DayChart's own observed min/max with its line
 * padding), so the two charts share their Y endpoints and can never disagree about the
 * same month.
 *
 * Still a record, not a verdict: no average, no target weight, no trend arrow. The chart
 * answers "what was it, when" — under a pointer, to the decimal.
 */

/** A month back. Long enough for the line to be a trend, short enough that the dialog
 *  opens on days you remember. The record's own window control covers the long run. */
const TREND_DAYS = 30;

export default function WeightLog({
  date,
  today,
  /** Fired after a reading lands so Today's checklist field agrees with the chart. */
  onChanged,
  onClose,
}: {
  date: string;
  /** The real today. The chart and the entry both open on `date`; only the picker's far
   *  end is the calendar's business rather than the screen's. */
  today?: string;
  onChanged: () => void;
  onClose: () => void;
}) {
  const [series, setSeries] = useState<ChartPoint[] | null>(null);
  /** Bumped by WeightEntry's onSaved so the chart re-reads what was just written. */
  const [reloadKey, setReloadKey] = useState(0);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/trends?days=${TREND_DAYS}&to=${date}`)
      .then((r) => r.json())
      .then(
        (d: { error?: unknown; series?: { date: string; weight: number | null }[] }) =>
          alive &&
          !d.error &&
          setSeries(
            (d.series ?? []).map((s) => ({ date: s.date, value: s.weight })),
          ),
      )
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [date, reloadKey]);

  return (
    // The workout log's dialog, one column — a chart does not need a spread.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,680px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        {/* Physical's dot — the same statement the workout and food logs make about which
            pillar's document this is. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--color-physical)" }}
          />
          Weight
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          Close
        </button>
      </div>

      <p className="mt-2 text-micro text-[var(--color-muted)]">
        last {TREND_DAYS} days
      </p>

      <div className="mt-4">
        {series == null ? (
          <p className="py-8 text-small text-[var(--color-muted)]">Loading…</p>
        ) : (
          <DayChart
            points={series}
            form="line"
            unit="kg"
            // No floor/ceiling: the observed range, the record page's own axis — the
            // 2026-08-24 ruling. See the header comment.
            height={200}
            emptyNote="No weights recorded in the last month."
          />
        )}
      </div>

      {/* The record page's own backfill control, verbatim — a gap you notice in the chart
          is filled directly under it, here as there. */}
      <WeightEntry
        anchor={date}
        today={today ?? date}
        onSaved={() => {
          setReloadKey((n) => n + 1);
          onChanged();
        }}
      />
    </dialog>
  );
}
