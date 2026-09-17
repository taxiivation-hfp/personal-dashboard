"use client";

import { useEffect, useRef, useState } from "react";
import StepsChart from "./StepsChart";
import type { ChartPoint } from "./DayChart";
import { WINDOW_DAYS } from "@/lib/rings";

/**
 * THE STEP TREND, behind the checklist row — the same dialog the weight and food logs
 * established: the chart on top, and nothing else.
 *
 * There is deliberately NO entry control under it, which is the one way this differs from
 * the weight dialog. Weight is something you read off a scale and type; steps are counted
 * by the phone, and a hand-typed step count is a number nobody measured. The Shortcut is
 * the only writer, exactly as the checklist row says.
 *
 * The chart itself is StepsChart, unmodified — the record draws the same component, so
 * opening this never means learning a second chart.
 */

/** A month back, matching the weight dialog. Long enough for the shape of a fortnight to
 *  be visible, short enough that it opens on days you remember. The record's own window
 *  control covers the long run. */
const TREND_DAYS = 30;

export default function StepsLog({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const [series, setSeries] = useState<ChartPoint[] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  /** The fortnight's total — the last WINDOW_DAYS of the 30-day series, summed over the
   *  days the phone actually pushed. null when it pushed on none of them: a fortnight
   *  nobody measured is not a fortnight of zero steps. */
  const sum14 = (() => {
    if (series == null) return null;
    const present = series
      .slice(-WINDOW_DAYS)
      .map((p) => p.value)
      .filter((v): v is number => v != null);
    if (!present.length) return null;
    return present.reduce((a, b) => a + b, 0);
  })();

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/trends?days=${TREND_DAYS}&to=${date}`)
      .then((r) => r.json())
      .then(
        (d: {
          error?: unknown;
          series?: { date: string; steps: number | null }[];
        }) =>
          alive &&
          !d.error &&
          setSeries(
            (d.series ?? []).map((s) => ({ date: s.date, value: s.steps })),
          ),
      )
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [date]);

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,680px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        {/* Health's dot — the same statement the weight, workout and food logs make
            about which pillar's document this is.
            DELIBERATELY THE TOKEN, not the owner's chosen hue: this is a chart of a BODY,
            not a checklist tick, and --color-physical IS Health's default. Spec §5 moves
            only the Steps and Calories tick BOXES onto the resolved tone. Do not "finish
            the job" here. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--color-physical)" }}
          />
          Steps
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          Close
        </button>
      </div>

      {/* The window, and the fortnight's SUM — the figure the ring counts, printed here
          as data (the owner's ask, 2026-08-24). Null days add nothing, and a fortnight
          the phone never reported prints no sum at all rather than a zero nobody said. */}
      <p className="mt-2 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 text-micro text-[var(--color-muted)]">
        <span>last {TREND_DAYS} days</span>
        {sum14 != null && (
          <span className="tabular-nums">
            <span className="text-[var(--color-ink)]">
              {sum14.toLocaleString()}
            </span>{" "}
            · last {WINDOW_DAYS} days
          </span>
        )}
      </p>

      <div className="mt-4">
        {series == null ? (
          <p className="py-8 text-small text-[var(--color-muted)]">Loading…</p>
        ) : (
          <StepsChart
            points={series}
            height={200}
            emptyNote="Nothing pushed in the last month."
          />
        )}
      </div>
    </dialog>
  );
}
