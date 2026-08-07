"use client";

import { useEffect, useMemo, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import WeightEntry from "./WeightEntry";
import { SegmentedRing, toneColor, type RingSegment } from "./PillarRing";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import type { ProductivitySegment } from "@/lib/productivity";
import {
  pillarCaption,
  type MetricRing,
  type PillarFactInput,
  type PillarKey,
  type PillarRingView,
} from "@/lib/rings";

/**
 * THE RECORD. Everything the app knows, on one surface.
 *
 * The brief was a metrics dashboard — every square inch carrying a number — and the risk in
 * that brief is a template: a row of big-number cards with a gradient accent, which is the
 * single most saturated shape in software and would undo this app's entire palette in one
 * screen. So the DENSITY is taken and the styling is not. The figures sit in a hairline-ruled
 * grid like a broadsheet results page: no cards, no shadows, no second accent, nothing
 * rounded that is not already rounded elsewhere.
 *
 * WHAT IT IS ALLOWED TO SAY. Counts, durations, and how far through a threshold something is.
 * What it must never say: better, worse, up, down, on track, behind. There are no averages,
 * no deltas, no target lines, no window-over-window comparison and no ranking of one day
 * against another. A dashboard that grades you is a scoreboard, and the whole app is built
 * against becoming one.
 *
 * A day with no entry draws NOTHING, everywhere. Most days in a 90-day window are blank in
 * an app this new, and drawing them as zeros would report a catastrophe that never happened.
 */

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "a year" },
] as const;

const PILLAR_NAME: Record<PillarKey, string> = {
  social_capital: "Social",
  physical: "Physical",
  portfolio: "Portfolio",
};
const ORDER: PillarKey[] = ["social_capital", "physical", "portfolio"];

type StripDay = {
  date: string;
  pct: number;
  isToday: boolean;
  productivity: {
    points: number;
    /** RAW adhered minutes — not the rate-weighted ones. "Hours worked" is a duration you
     *  actually spent; weighting it by a colour would make it a score wearing a clock. */
    minutes: number;
    segments: ProductivitySegment[];
  } | null;
};
type TrendDay = { date: string; weight: number | null; calories: number | null };

/** 640 -> "10h 40m". Time is shown as time — an abstract number would invite reading it as
 *  a score, which is the one thing these figures are not. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function Dashboard({
  date,
  /** Rendered inside an expanding overlay rather than as a page — the close control differs. */
  onClose,
}: {
  date: string;
  onClose?: () => void;
}) {
  const [days, setDays] = useState<number>(WINDOWS[0].days);
  const [strip, setStrip] = useState<StripDay[] | null>(null);
  const [trends, setTrends] = useState<TrendDay[] | null>(null);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);
  const [facts, setFacts] = useState<PillarFactInput | null>(null);
  const [colors, setColors] = useState<Partial<Record<PillarKey, string | null>>>({});
  const [streak, setStreak] = useState<number | null>(null);

  // The fortnight is fixed — it is what the rings mean — so it loads once and does not
  // move when the window control does. Only the two time series below answer to that.
  useEffect(() => {
    let alive = true;
    fetch(`/api/rings?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || d.error) return;
        setRings(d.pillars ?? []);
        setFacts(d.facts ?? null);
      })
      .catch(() => {});
    fetch(`/api/today?date=${date}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || d.error) return;
        setStreak(d.streak ?? 0);
        setColors(
          Object.fromEntries((d.pillars ?? []).map((p: { key: PillarKey; color: string | null }) => [p.key, p.color])),
        );
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);

  /** Bumped to re-run the two time series after something is written into them. */
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTrends = () => setReloadKey((n) => n + 1);

  useEffect(() => {
    let alive = true;
    setStrip(null);
    setTrends(null);
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
  }, [date, days, reloadKey]);

  const adherence: ChartPoint[] = useMemo(
    () => (strip ?? []).map((d) => ({ date: d.date, value: d.pct })),
    [strip],
  );

  const hours: ChartPoint[] = useMemo(
    () =>
      (strip ?? []).map((d) => ({
        date: d.date,
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

  /**
   * The four figures across the top. Chosen so no two answer the same question:
   * today, this week, this fortnight, and the record so far.
   */
  const week = (strip ?? []).slice(-7);
  const weekHours = week.reduce((s, d) => s + (d.productivity?.minutes ?? 0), 0);
  const todayPct = (strip ?? []).find((d) => d.isToday)?.pct ?? null;
  const daysLogged = (strip ?? []).filter((d) => d.pct > 0).length;

  const loading = strip == null || trends == null || rings == null;

  return (
    <div className="flex h-full min-h-0 flex-col bg-[var(--color-surface-3)] text-[var(--color-ink)]">
      {/* The masthead keeps the band the rest of the app uses, so the expansion reads as the
          same application rather than as somewhere you were taken. */}
      <header className="shrink-0 border-b border-[var(--color-line)] bg-[var(--color-bar)]">
        <div className="mx-auto flex max-w-[76rem] items-baseline justify-between gap-4 px-5 py-4 lg:px-8">
          <h1 className="font-serif text-body font-semibold">The record</h1>
          <div className="flex items-center gap-1.5">
            {WINDOWS.map((w) => {
              const on = days === w.days;
              return (
                <button
                  key={w.days}
                  onClick={() => setDays(w.days)}
                  aria-pressed={on}
                  className="rounded-full border px-3 py-1 text-micro transition-colors"
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
            {/* An ×, not a word. This is a window you got INTO, and the way out of a window
                is to shut it — a button labelled "Today" would read as somewhere else to go. */}
            {onClose ? (
              <button
                onClick={onClose}
                data-record-close
                aria-label="Close the record"
                className="ml-2 rounded-lg px-2.5 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
              >
                ×
              </button>
            ) : (
              <a
                href="/"
                aria-label="Close the record"
                className="ml-2 rounded-lg px-2.5 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
              >
                ×
              </a>
            )}
          </div>
        </div>
      </header>

      <main className="min-h-0 flex-1 overflow-y-auto">
        <div className="mx-auto w-full max-w-[76rem] px-5 pb-28 pt-6 lg:px-8 lg:pb-12">
          {/* THE FIGURES. A hairline-ruled band, not a row of cards: this app answers a
              card with a rule everywhere else, and four rounded tiles with big numbers in
              them is the one shape that would make it look like every other dashboard. */}
          <div className="grid grid-cols-2 border-y border-[var(--color-line-strong)] lg:grid-cols-4">
            <Figure
              label="adherence today"
              value={todayPct == null ? "—" : `${todayPct}%`}
              fact="70 parts hours, 30 parts non-negotiables"
            />
            <Figure
              label="hours worked, last 7 days"
              value={asTime(weekHours)}
              fact="blocked time you marked adhered"
            />
            <Figure
              label="sessions, past fortnight"
              value={facts ? String(facts.workoutSessions) : "—"}
              fact="strength, cardio and misc together"
            />
            <Figure
              label="days logged in a row"
              value={streak == null ? "—" : String(streak)}
              fact="a fact about the record, not a thing to keep"
            />
          </div>

          {/* THE THREE PILLARS, at the size they were always meant to be read at. The same
              segmented donuts as the Today screen, with the same labels at the same arcs —
              one object, two places, so opening this never means relearning the chart. */}
          <section className="mt-10">
            <div className="section-head">
              <h2 className="text-small font-semibold">The fortnight</h2>
              <span className="text-micro text-[var(--color-muted)]">
                rolling 14 days · every ring caps at its own minimum
              </span>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
              {ORDER.map((pk) => {
                const ring = rings?.find((r) => r.pillar === pk) ?? null;
                const asSeg = (m: MetricRing): RingSegment => ({
                  key: m.key,
                  label: m.label,
                  fill: m.fill,
                  weight: m.weight,
                  ghost: m.state === "ghost",
                  short:
                    m.state === "ghost"
                      ? "—"
                      : m.required != null
                        ? `${m.count}/${m.required}`
                        : String(m.count),
                });
                return (
                  <div
                    key={pk}
                    className="flex flex-col items-center border-t border-[var(--color-line)] pt-5"
                  >
                    <SegmentedRing
                      segments={
                        ring
                          ? ring.metrics.filter((m) => !m.lap).map(asSeg)
                          : [
                              {
                                key: "pending",
                                label: PILLAR_NAME[pk],
                                fill: null,
                                weight: 1,
                                ghost: false,
                              },
                            ]
                      }
                      outer={
                        ring ? ring.metrics.filter((m) => m.lap).map(asSeg) : []
                      }
                      size={170}
                      stroke={11}
                      tone={pk}
                      color={colors[pk]}
                    />
                    <p className="mt-2 text-small font-semibold">
                      {PILLAR_NAME[pk]}
                    </p>
                    <p className="mt-0.5 text-micro text-[var(--color-muted)]">
                      {facts ? pillarCaption(pk, facts) : ""}
                    </p>
                  </div>
                );
              })}
            </div>
          </section>

          {/* EVERY METRIC, spelled out. The donuts show the shape; this shows the numbers,
              because "3 of 8" is a thing you can act on and an arc is not. */}
          <section className="mt-10">
            <div className="section-head">
              <h2 className="text-small font-semibold">Every metric</h2>
              <span className="text-micro text-[var(--color-muted)]">
                the bar stops at its minimum — the count never does
              </span>
            </div>
            <ul className="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {(rings ?? []).flatMap((p) =>
                p.metrics.map((m) => (
                  <li
                    key={`${p.pillar}-${m.key}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                  >
                    <span className="w-20 shrink-0 text-micro text-[var(--color-muted)]">
                      {PILLAR_NAME[p.pillar]}
                    </span>
                    <span className="w-24 shrink-0 text-small">{m.label}</span>
                    <span className="order-last w-full text-micro tabular-nums text-[var(--color-muted)] sm:order-none sm:w-auto sm:flex-1">
                      {m.fact}
                      {m.window ? ` · ${m.window}` : ""}
                    </span>
                    <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--color-line)]">
                      {m.fill != null && m.fill > 0 && (
                        <span
                          className="motion-data block h-full w-full origin-left rounded-full"
                          style={{
                            transform: `scaleX(${m.fill})`,
                            background: toneColor(p.pillar, colors[p.pillar]),
                          }}
                        />
                      )}
                    </span>
                  </li>
                )),
              )}
            </ul>
          </section>

          {loading ? (
            <p className="py-16 text-small text-[var(--color-muted)]">
              Loading…
            </p>
          ) : (
            <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-2">
              <Panel
                title="Adherence"
                note="Did I do what I said I'd do. A sum of what was earned, so it only ever climbs through a day."
              >
                <DayChart
                  points={adherence}
                  form="bars"
                  unit="%"
                  ceiling={100}
                  emptyNote="Nothing marked in this window yet."
                />
              </Panel>

              <Panel
                title="Hours"
                note="Time spent, never results produced — stacked in the colours those hours had in the calendar."
              >
                <DayChart
                  points={hours}
                  form="stacked"
                  unit=""
                  emptyNote="No scheduled hours marked in this window."
                />
              </Panel>

              <Panel
                title="Weight"
                note="Drawn on the range actually observed. A morning that went unweighed is a gap, not a zero."
              >
                <DayChart
                  points={weight}
                  form="line"
                  unit="kg"
                  emptyNote="No weights recorded in this window."
                />
                {/* Under the chart, because this is where you are already looking when you
                    notice a gap in it. Backfilling is not an edge case for a record meant to
                    last years — a chart of a fortnight is a chart nobody consults. */}
                <WeightEntry today={date} onSaved={reloadTrends} />
              </Panel>

              <Panel
                title="Calories"
                note="Bars from zero — a line would imply Tuesday's intake flowed into Wednesday's."
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

          <p className="mt-10 max-w-[62ch] border-t border-[var(--color-line)] pt-4 text-micro leading-relaxed text-[var(--color-muted)]">
            {daysLogged} of the last {days} days have something marked on them.
            There is deliberately no average here, and no comparison with the
            window before this one — those are judgements, and this is a record.
          </p>
        </div>
      </main>
    </div>
  );
}

/**
 * One figure in the top band.
 *
 * The number is serif and large but NOT hero-sized: the 52px numeral belongs to today's
 * adherence ring and nothing else may borrow it. A fact line underneath says what the figure
 * is made of, because a number whose derivation is invisible is a number you end up
 * distrusting.
 */
function Figure({
  label,
  value,
  fact,
}: {
  label: string;
  value: string;
  fact: string;
}) {
  return (
    <div className="border-r border-[var(--color-line)] px-4 py-4 last:border-r-0">
      <p className="text-micro text-[var(--color-muted)]">{label}</p>
      <p className="mt-1 font-serif text-heading tabular-nums">{value}</p>
      <p className="mt-1 text-micro leading-snug text-[var(--color-muted)]">
        {fact}
      </p>
    </div>
  );
}

/** One chart and the sentence that says what it is. Every chart here encodes a decision —
 *  a ceiling, a floor, a gap that draws nothing — and a reader who does not know the
 *  decision will misread the shape. */
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
      <div className="mt-4">{children}</div>
    </section>
  );
}
