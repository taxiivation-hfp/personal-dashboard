"use client";

import { useEffect, useMemo, useRef, useState } from "react";

/**
 * Weight or calories, day by day, in a dialog.
 *
 * A RECORD, not a verdict. There is no average line, no target, no arrow, no "down 0.4 on
 * last week" — those are all judgements about a number the app has no business judging.
 * The owner asked to see their own history; this shows it and stops.
 *
 * The two series are drawn differently because they are different KINDS of quantity:
 *
 *   weight    a continuous measurement that persists between readings, so a LINE, with a
 *             y-axis scaled to the range actually observed. A weight chart pinned to zero
 *             is a flat line that says nothing.
 *   calories  a total that is accumulated and then starts again, so BARS from zero. A line
 *             would imply Tuesday's intake flowed into Wednesday's.
 *
 * A missing day is a GAP in both, never a zero. An unweighed morning is not a morning that
 * weighed nothing.
 */

export type TrendKind = "weight" | "calories";

type Point = { date: string; weight: number | null; calories: number | null };

const WINDOWS = [30, 90] as const;

const TITLE: Record<TrendKind, string> = {
  weight: "Weight",
  calories: "Calories",
};

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const short = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

/** Weight carries a decimal because 0.4kg is a real difference; kcal never does. */
const fmt = (kind: TrendKind, n: number) =>
  kind === "weight" ? String(Math.round(n * 10) / 10) : String(Math.round(n));

export default function TrendPopup({
  kind,
  date,
  unit,
  onClose,
}: {
  kind: TrendKind;
  /** The day being VIEWED — the window ends here, never at the server's today. */
  date: string;
  /** Printed beside the figures. "kg", "kcal". */
  unit: string;
  onClose: () => void;
}) {
  const [days, setDays] = useState<number>(WINDOWS[0]);
  // null while the fetch is out. An empty series and an unanswered request are different
  // facts, and "Nothing logged yet" is the wrong one to print during the wait.
  const [series, setSeries] = useState<Point[] | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    setSeries(null);
    const q = new URLSearchParams({ to: date, days: String(days) });
    fetch(`/api/trends?${q}`)
      .then((r) => (r.ok ? r.json() : { series: [] }))
      .then((d: { series?: Point[] }) => alive && setSeries(d.series ?? []))
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [date, days]);

  const chart = useMemo(() => {
    if (!series) return null;
    const values = series.map((p) => (kind === "weight" ? p.weight : p.calories));
    const present = values.filter((v): v is number => v != null);
    if (present.length === 0) return { empty: true as const };

    const hi = Math.max(...present);
    const lo = Math.min(...present);

    // Weight floats on its own range with a tenth of it as headroom, so a 2kg move over a
    // season is visible rather than a flat line near the top of a 0-based box. Calories
    // start at zero because a bar that doesn't is a bar that lies about its proportions.
    const pad = kind === "weight" ? Math.max((hi - lo) * 0.15, 0.5) : 0;
    const top = kind === "weight" ? hi + pad : Math.max(hi, 1);
    const bottom = kind === "weight" ? lo - pad : 0;
    const span = Math.max(top - bottom, 0.001);

    const n = values.length;
    const y = (v: number) => 100 - ((v - bottom) / span) * 100;
    const x = (i: number) => (n === 1 ? 50 : (i / (n - 1)) * 100);

    /**
     * The line, BROKEN at every gap.
     *
     * One polyline through the present days would join Monday to Friday with a straight
     * segment that reads as three days of steady change nobody measured. Each unbroken run
     * gets its own polyline instead.
     *
     * A run of ONE emits its point twice. A single-point polyline draws nothing at all,
     * which would have left the commonest first-week state — one weighing — as an empty
     * box under a caption reading "1 day logged". Two identical points with a round cap is
     * a dot, exactly on its day.
     */
    const runs: string[] = [];
    let run: string[] = [];
    const flush = () => {
      if (!run.length) return;
      runs.push((run.length === 1 ? [run[0]!, run[0]!] : run).join(" "));
      run = [];
    };
    values.forEach((v, i) => {
      if (v == null) return flush();
      run.push(`${x(i).toFixed(2)},${y(v).toFixed(2)}`);
    });
    flush();

    const bars = values.map((v, i) => ({
      key: series[i]!.date,
      value: v,
      // Share of the box, from zero. A day with a genuine total below 1% of the peak still
      // gets a hairline, so a light day is a light day rather than an absent one.
      height: v == null ? 0 : Math.max((v / top) * 100, 1.5),
    }));

    const latest = [...series].reverse().find((p) => {
      const v = kind === "weight" ? p.weight : p.calories;
      return v != null;
    });

    return {
      empty: false as const,
      runs,
      bars,
      hi,
      lo,
      count: present.length,
      latest,
    };
  }, [series, kind]);

  return (
    // A dialog is the one thing genuinely lifted off the page, so it keeps a panel where
    // the sections lost theirs — the same treatment the workout log gets.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,720px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="text-small font-semibold">{TITLE[kind]}</h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          Close
        </button>
      </div>

      {/* The window, and the range it turned out to hold. Stated rather than inferred: a
          weight chart with no axis is a shape whose scale the reader has to guess at, and
          a shape whose scale is unstated is a shape that lies. */}
      <div className="mt-3 flex flex-wrap items-baseline justify-between gap-x-4 gap-y-2">
        <div className="flex items-center gap-1.5">
          {WINDOWS.map((w) => (
            <button
              key={w}
              onClick={() => setDays(w)}
              aria-pressed={days === w}
              className="rounded-full border px-3 py-1 text-micro tabular-nums transition-colors"
              style={{
                borderColor:
                  days === w
                    ? "var(--color-ink)"
                    : "var(--color-line-strong)",
                color:
                  days === w ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {w} days
            </button>
          ))}
        </div>

        {chart && !chart.empty && (
          <p className="text-micro tabular-nums text-[var(--color-muted)]">
            {fmt(kind, chart.lo)}–{fmt(kind, chart.hi)} {unit} · {chart.count}{" "}
            day{chart.count === 1 ? "" : "s"} logged
          </p>
        )}
      </div>

      <div className="mt-4">
        {chart == null && (
          <p className="py-8 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {chart?.empty && (
          <p className="py-8 text-small leading-relaxed text-[var(--color-muted)]">
            Nothing logged in this window. Days without an entry stay blank here
            rather than counting as zero.
          </p>
        )}

        {chart && !chart.empty && (
          <>
            <div className="relative h-40 border-b border-[var(--color-line-strong)]">
              {kind === "weight" ? (
                <svg
                  className="h-full w-full"
                  viewBox="0 0 100 100"
                  preserveAspectRatio="none"
                  aria-hidden
                >
                  {chart.runs.map((pts, i) => (
                    <polyline
                      key={i}
                      points={pts}
                      fill="none"
                      stroke="var(--color-accent)"
                      strokeWidth="2"
                      // Without this the non-uniform stretch would make the stroke
                      // thicker on the vertical than the horizontal.
                      vectorEffect="non-scaling-stroke"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  ))}
                </svg>
              ) : (
                <div className="flex h-full items-end gap-px">
                  {chart.bars.map((b) => (
                    <div
                      key={b.key}
                      className="min-w-0 flex-1"
                      style={{
                        height: `${b.height}%`,
                        // A day with no total draws nothing at all. The gap in the row is
                        // the statement.
                        background:
                          b.value == null
                            ? "transparent"
                            : "var(--color-accent)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>

            {/* Two dates and nothing between them. Thirty labels under thirty days is a
                ruler, and the reader only needs to know which end is which. */}
            <div className="mt-2 flex items-baseline justify-between text-micro tabular-nums text-[var(--color-muted)]">
              <span>{short(series![0]!.date)}</span>
              <span>{short(series![series!.length - 1]!.date)}</span>
            </div>

            {chart.latest && (
              <p className="mt-4 border-t border-[var(--color-line)] pt-3 text-small tabular-nums text-[var(--color-muted)]">
                Last reading{" "}
                <span className="text-[var(--color-ink)]">
                  {fmt(
                    kind,
                    (kind === "weight"
                      ? chart.latest.weight
                      : chart.latest.calories)!,
                  )}{" "}
                  {unit}
                </span>{" "}
                · {short(chart.latest.date)}
              </p>
            )}
          </>
        )}
      </div>
    </dialog>
  );
}
