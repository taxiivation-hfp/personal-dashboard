"use client";

import { useEffect, useMemo, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import { PhoneTabBar } from "./PhoneTabs";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import type { ProductivitySegment } from "@/lib/productivity";

/**
 * The record, on one page.
 *
 * Everything here is HISTORY. Today's screen is where you act; this is where you look back,
 * and the split is deliberate — a screen that showed both would invite reading the past as
 * a verdict on the present, which is the failure mode the whole app is built against.
 *
 * ORDER IS THE ARGUMENT. Adherence first, because it is the app's question. Productivity
 * second, because it is the sanctioned exception and secondary by construction. Weight and
 * calories last, because they are facts about a body rather than about a plan.
 *
 * No averages, no deltas, no target lines, no smoothing, no window-over-window comparison.
 * Adding one would turn a record into a scoreboard, which is the one thing this page must
 * not become.
 */

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "a year" },
] as const;

type StripDay = {
  date: string;
  pct: number;
  productivity: { points: number; segments: ProductivitySegment[] } | null;
};

type TrendDay = {
  date: string;
  weight: number | null;
  calories: number | null;
};

export default function Stats({ date }: { date: string }) {
  const [days, setDays] = useState<number>(WINDOWS[0].days);
  // null while the fetch is out. An empty series and an unanswered request are different
  // facts, and "nothing logged" is the wrong one to print during the wait.
  const [strip, setStrip] = useState<StripDay[] | null>(null);
  const [trends, setTrends] = useState<TrendDay[] | null>(null);

  useEffect(() => {
    let alive = true;
    setStrip(null);
    setTrends(null);
    // Two routes rather than one: /api/adherence already computes the day-by-day figure
    // from calendar + marks, and /api/trends already reads the two body numbers. Merging
    // them would mean one of the two growing a second job it has no business doing.
    fetch(`/api/adherence?days=${days}&to=${date}`)
      .then((r) => r.json())
      .then((d) => alive && !d.error && setStrip(d.days ?? []))
      .catch(() => alive && setStrip([]));
    fetch(`/api/trends?days=${days}&to=${date}`)
      .then((r) => r.json())
      .then((d) => alive && !d.error && setTrends(d.series ?? []))
      .catch(() => alive && setTrends([]));
    return () => {
      alive = false;
    };
  }, [date, days]);

  const adherence: ChartPoint[] = useMemo(
    () => (strip ?? []).map((d) => ({ date: d.date, value: d.pct })),
    [strip],
  );

  const productivity: ChartPoint[] = useMemo(
    () =>
      (strip ?? []).map((d) => ({
        date: d.date,
        // null, not 0, when the calendar was unreachable — a day the app could not read is
        // not a day with no hours in it.
        value: d.productivity ? d.productivity.points : null,
        segments: d.productivity?.segments.map((s, i) => ({
          key: `${s.kind}-${s.colorId ?? "d"}-${i}`,
          points: s.points,
          fill:
            s.kind === "time"
              ? (projectedColour(s.colorId) ?? SLAB_NEUTRAL)
              : SLAB_NEUTRAL,
        })),
      })),
    [strip],
  );

  const weight: ChartPoint[] = useMemo(
    () => (trends ?? []).map((d) => ({ date: d.date, value: d.weight })),
    [trends],
  );
  const calories: ChartPoint[] = useMemo(
    () => (trends ?? []).map((d) => ({ date: d.date, value: d.calories })),
    [trends],
  );

  const loading = strip == null || trends == null;

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="border-b border-[var(--color-line)] bg-[var(--color-bar)]">
        <div className="mx-auto flex max-w-[56rem] items-baseline justify-between gap-4 px-5 py-4 lg:px-8">
          <h1 className="font-serif text-body font-semibold">The record</h1>
          {/* Home is a link, not a back button: a back button depends on how you arrived,
              and the fourth tab means you can arrive here from anywhere. */}
          <a
            href="/"
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            Today
          </a>
        </div>
      </header>

      <main className="mx-auto w-full max-w-[56rem] flex-1 px-5 pb-28 pt-6 lg:px-8 lg:pb-12">
        {/* The window control sits above everything, because it governs everything below
            it. One row of three, so the whole choice is visible rather than hidden behind
            a select. */}
        <div className="flex flex-wrap items-center gap-1.5">
          {WINDOWS.map((w) => {
            const on = days === w.days;
            return (
              <button
                key={w.days}
                onClick={() => setDays(w.days)}
                aria-pressed={on}
                className="rounded-full border px-3.5 py-1.5 text-micro transition-colors"
                style={{
                  borderColor: on
                    ? "var(--color-ink)"
                    : "var(--color-line-strong)",
                  color: on ? "var(--color-ink)" : "var(--color-muted)",
                }}
              >
                {w.label}
              </button>
            );
          })}
        </div>

        {loading ? (
          <p className="py-16 text-small text-[var(--color-muted)]">Loading…</p>
        ) : (
          <div className="mt-8 flex flex-col gap-10">
            <Panel
              title="Adherence"
              note="Did I do what I said I'd do. Seventy parts blocked hours worked, thirty parts non-negotiables — a sum of what was earned, so it only ever climbs through a day."
            >
              <DayChart
                points={adherence}
                form="bars"
                unit="%"
                // The one quantity here with a real ceiling, so it gets one. Scaling
                // adherence to its own high would make a week of 40s look like a week of
                // 100s, which is the exact misreading a percentage exists to prevent.
                ceiling={100}
                emptyNote="Nothing marked in this window yet."
              />
            </Panel>

            <Panel
              title="Hours"
              note="Time spent, never results produced — stacked in the colours those hours had in the calendar. Uncapped and scaled to its own high, so the shape is comparable within this window and nowhere else."
            >
              <DayChart
                points={productivity}
                form="stacked"
                unit=""
                emptyNote="No scheduled hours marked in this window."
              />
            </Panel>

            <Panel
              title="Weight"
              note="Drawn on the range actually observed. Pinned to zero it would be a flat line saying nothing, and a morning that went unweighed is a gap rather than a zero."
            >
              <DayChart
                points={weight}
                form="line"
                unit="kg"
                emptyNote="No weights recorded in this window."
              />
            </Panel>

            <Panel
              title="Calories"
              note="Bars from zero, because a line would imply Tuesday's intake flowed into Wednesday's. A day with nothing logged is blank, not a fast."
            >
              <DayChart
                points={calories}
                form="bars"
                unit="kcal"
                emptyNote="Nothing logged in this window."
              />
            </Panel>
          </div>
        )}
      </main>

      <PhoneTabBar tab="stats" />
    </div>
  );
}

/**
 * One chart and the sentence that says what it is.
 *
 * The note is not decoration. Every chart here encodes a decision — a ceiling, a floor, a
 * gap that draws nothing — and a reader who does not know the decision will misread the
 * shape. Saying it in a line under the heading is cheaper than a legend and honester than
 * assuming.
 */
function Panel({
  title,
  note,
  children,
}: {
  title: string;
  note: string;
  children: React.ReactNode;
}) {
  return (
    <section>
      <div className="section-head">
        <h2 className="text-small font-semibold">{title}</h2>
      </div>
      <p className="max-w-[62ch] pt-2 text-micro leading-relaxed text-[var(--color-muted)]">
        {note}
      </p>
      <div className="mt-5">{children}</div>
    </section>
  );
}
