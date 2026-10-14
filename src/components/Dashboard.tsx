"use client";

import { useEffect, useMemo, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import DayLog from "./DayLog";
import ProductivityLog from "./ProductivityLog";
import AdherenceLog from "./AdherenceLog";
import HoursTotal from "./HoursTotal";
import StepsChart from "./StepsChart";
import WeightEntry from "./WeightEntry";
import CalorieLog from "./CalorieLog";
import { SegmentedRing, toneColor } from "./PillarRing";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import type { DayHours } from "@/lib/productivity";
import type { PillarFacts } from "@/lib/queries";
import {
  CALORIE_FLOOR,
  PILLAR_NAME,
  type ArcView,
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
 * What it must never say: better, worse, up, down, on track, behind. There are no deltas, no
 * target lines, no window-over-window comparison and no ranking of one day against another.
 * A dashboard that grades you is a scoreboard, and the whole app is built against becoming
 * one.
 *
 * THERE IS NO SCORE ON IT ANY MORE, and no task history. The owner's ruling of 2026-09-18
 * deleted the productivity points (the Hours chart is MINUTES now, stacked by category) and
 * deleted the In flight / Achieved board — goals are read and edited in the Career ring's
 * drill-down, and a carrying task list was never a thing this app scored, so a
 * record of it was a record of nothing it believes in.
 *
 * A day with no entry draws NOTHING, everywhere. Most days in a 90-day window are blank in
 * an app this new, and drawing them as zeros would report a catastrophe that never happened.
 */

const WINDOWS = [
  { days: 30, label: "30 days" },
  { days: 90, label: "3 months" },
  { days: 365, label: "a year" },
] as const;

/**
 * Each chart card's ground — the same off-white panel, nudged a few points toward a
 * NEIGHBOURING token so the four read as distinct sheets without introducing a single new
 * colour. Derived, not invented: the accent, the calendar surface and the page ground are
 * already certified, and 6–8% of any of them moves the panel's lightness by under a point,
 * so every ink that passes on --color-panel still passes here.
 *
 * The variance is deliberately SUBTLE — four loud tints would be four category colours,
 * and these cards are not categories of anything.
 */
const CARD_TINTS = {
  adherence: "color-mix(in oklab, var(--color-panel) 93%, var(--color-accent) 7%)",
  hours: "var(--color-panel)",
  weight: "color-mix(in oklab, var(--color-panel) 92%, var(--color-surface-2) 8%)",
  calories: "color-mix(in oklab, var(--color-panel) 94%, var(--color-bg) 6%)",
  // The gold window's own ground, at the same few points as its neighbours. Derived from
  // a certified token like the rest — not a fifth invented colour, which at five cards is
  // exactly when a set of tints would start reading as a category key.
  steps: "color-mix(in oklab, var(--color-panel) 93%, var(--color-surface-3) 7%)",
} as const;

/**
 * One day of the adherence window.
 *
 * `hours` replaced `productivity`: the score is gone, so what a day carries is the minutes
 * it worked and where they went. The shape is DayHours, straight off /api/adherence, which
 * is the same function /api/productivity's drill-down calls — the chart and the sheet that
 * explains it cannot disagree about a day because they are the same arithmetic.
 */
type StripDay = {
  date: string;
  pct: number;
  isToday: boolean;
  hours: DayHours | null;
};

type TrendDay = {
  date: string;
  weight: number | null;
  calories: number | null;
  /** The phone's push for that day. null is a day it never reported — never a zero. */
  steps: number | null;
};

/** 640 -> "10h 40m". Time is shown as time — an abstract number would invite reading it as
 *  a score, which is the one thing these figures are not. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** The same figure, for the chart's own SCALE as well as its readings — where 0 is an
 *  endpoint of an axis and not an absent figure. `—` is the right answer for a week with
 *  no hours in it; it is the wrong answer at the foot of a range, where "—–10h 40m" says
 *  nothing about where the chart starts. Everything else is asTime verbatim, so the axis
 *  and the tooltip can never spell the same quantity two ways. */
const asChartTime = (minutes: number): string =>
  minutes <= 0 ? "0h" : asTime(minutes);

export default function Dashboard({
  date,
  today,
  /** Rendered inside an expanding overlay rather than as a page — the close control differs. */
  onClose,
  initialView,
  logAnchor,
}: {
  date: string;
  /** The real today. Every window here is anchored to `date`, which is the day the record
   *  was opened from and is no longer always today; this is only the far end of the two
   *  date pickers the cards carry, which belong to the calendar and not to the screen. */
  today?: string;
  onClose?: () => void;
  /** Which half opens first. `?view=log` on /stats — the journal's old front door lands on
   *  the written half, and the tabs own it from there. */
  initialView?: "stats" | "log";
  /** Where the LOG's scroll starts — a timeline month lands here at that month's end. The
   *  stats windows keep `date`; a month is a place in the log, not a new stats anchor. */
  logAnchor?: string;
}) {
  /**
   * WHICH HALF OF THE RECORD IS SHOWING.
   *
   * The record answers two different questions — "what do the numbers say" and "what did I
   * write" — and they were never the same screen; the second simply had nowhere to live, so
   * the words were scattered across /journal, /sessions and a pillar drill-down. They share
   * one window rather than becoming two routes because they are one thing looked at two
   * ways, and the expansion from the pillars column already animates into it.
   *
   * The window chips (30 days / 3 months / a year) belong to STATS alone and are hidden on
   * the log: the log is a continuous scroll with no window to set, and a control that did
   * nothing would be the masthead lying about what it governs.
   */
  const [view, setView] = useState<"stats" | "log">(initialView ?? "stats");
  /**
   * Which day's workings are open, and from which chart.
   *
   * The same bargain the hero ring strikes: the bar is a shape you glance at, and the
   * arithmetic is one deliberate tap away. Two charts have workings worth opening — hours,
   * which breaks down into the categories that earned it, and adherence, which breaks down
   * into what did and did not add. Weight, calories and steps do not: behind those days is a
   * single number, and a control that opened an empty sheet is worse than no control.
   */
  const [hoursDay, setHoursDay] = useState<string | null>(null);
  /** The WINDOW's hours, broken down by category — the figure's own workings, as opposed to
   *  one day's. Derived from the series already loaded, so it costs no request. */
  const [hoursTotal, setHoursTotal] = useState(false);
  const [adherenceDay, setAdherenceDay] = useState<string | null>(null);
  const [days, setDays] = useState<number>(WINDOWS[0].days);
  const [strip, setStrip] = useState<StripDay[] | null>(null);
  const [trends, setTrends] = useState<TrendDay[] | null>(null);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);
  const [facts, setFacts] = useState<PillarFacts | null>(null);
  const [streak, setStreak] = useState<number | null>(null);

  // The fortnight is fixed — it is what the rings mean — so it loads once and does not
  // move when the window control does. Only the two time series below answer to that.
  //
  // /api/goals and /api/tasks?all=1 are GONE with the In flight / Achieved board (spec §6).
  // Goals live inside the Career ring; there is no task history anywhere.
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
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [date]);

  /** Bumped to re-run the two time series after something is written into them. */
  const [reloadKey, setReloadKey] = useState(0);
  const reloadTrends = () => setReloadKey((n) => n + 1);
  /** The food log, opened from the Calories card — the same dialog Today's row opens. */
  const [calOpen, setCalOpen] = useState(false);

  /**
   * BLANK THE SERIES ONLY WHEN THE WINDOW MOVES — never on a reload after a write.
   *
   * These two nulls are what put the whole page into `loading`, and `loading` replaces the
   * entire chart block with one word. Switching from 30 days to a year genuinely has no
   * answer yet, so blanking is right there: charts drawn from the old window while the new
   * one loads would be charts lying about their axis.
   *
   * A WRITE is not a new question. It used to run through the same effect, which meant
   * saving a weight reading tore down the block containing the control you had just used —
   * WeightEntry remounted with its selected date reset to today, its readings list empty
   * and its "saved to 3 Aug" gone, so correcting the same past day twice meant finding it
   * again. Split in two so the reload path re-fetches over the top of what is already
   * drawn, which is what the weight dialog has always done.
   */
  useEffect(() => {
    setStrip(null);
    setTrends(null);
  }, [date, days]);

  useEffect(() => {
    let alive = true;
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

  /**
   * THE HOURS SERIES — minutes, stacked by category.
   *
   * One magnitude, not two. It used to carry a points total for the bar's height with the
   * minutes riding alongside as a side-channel, because the record was forbidden from
   * printing the score. With the score deleted the day's value IS its minutes, and a slab
   * is its category's minutes — so the stack, the tooltip, the legend and the "where the
   * hours went" sheet all read one number.
   *
   * A day the calendar could not be reached has `hours` null and draws NOTHING. An outage
   * is not a day in which nothing was worked.
   */
  const hours: ChartPoint[] = useMemo(
    () =>
      (strip ?? []).map((d) => ({
        date: d.date,
        value: d.hours ? d.hours.minutes : null,
        segments: d.hours?.categories.map((c) => ({
          // The label, because the category IS the key — one category may own two calendar
          // colours, and keying by colour would split Work Part Time into two slabs.
          key: c.label,
          minutes: c.minutes,
          fill: projectedColour(c.colorId) ?? SLAB_NEUTRAL,
          label: c.label,
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
  const steps: ChartPoint[] = useMemo(
    () => (trends ?? []).map((d) => ({ date: d.date, value: d.steps })),
    [trends],
  );

  /** The fortnight's step total, from the series already loaded — the same last-14-days
   *  sum the ring counts. null when the phone pushed on none of those days. */
  const stepsSum14 = useMemo(() => {
    const present = steps
      .slice(-14)
      .map((p) => p.value)
      .filter((v): v is number => v != null);
    return present.length ? present.reduce((a, b) => a + b, 0) : null;
  }, [steps]);

  /**
   * The four figures across the top. Chosen so no two answer the same question:
   * this week's adherence, this week's hours, this fortnight's training, and the record so
   * far.
   */
  const week = (strip ?? []).slice(-7);
  const weekHours = week.reduce((s, d) => s + (d.hours?.minutes ?? 0), 0);
  /**
   * THE SEVEN-DAY MEAN, by the owner's ruling — not the figure for the day this window ends
   * on, which is what it used to be.
   *
   * The reasoning is that a single day is a poor thing to open a RECORD with. Today's number
   * is already the hero on the Today screen at 240px; repeating it here spent the record's
   * first figure restating what the previous screen just said, and it swung wildly — a
   * Sunday with one blocked hour reads nothing like the week around it.
   *
   * NOTE THIS BENDS A DOCUMENTED RULE. "No delta, no smoothing" governs the CHARTS below,
   * and it still does: nothing here draws a mean line over a series, which is the thing that
   * rule exists to prevent — a line you can be found wanting against, day by day. One stated
   * figure over a named window is a different object, and it is the owner's call. (The
   * adherence TRACKER on Today prints an average for the same reason, by the same ruling.)
   *
   * Days with NO figure are excluded rather than counted as zero. `pct` is null when a day
   * had nothing scheduled and nothing to tick — there was no denominator, so there is no
   * percentage, and folding that in as a 0 would report a quiet week as a failed one. A
   * window with no answerable day at all reads "—", not 0.
   */
  const viewedPct = (() => {
    const scored = week.map((d) => d.pct).filter((p): p is number => p != null);
    if (!scored.length) return null;
    return Math.round(scored.reduce((a, b) => a + b, 0) / scored.length);
  })();

  /** Is this record about the present? Every window here ends on `date`. */
  const onToday = today == null || date === today;
  /** The suffix every window label takes, so four figures cannot describe four different
   *  spans of time in four different ways. */
  const anchored = onToday
    ? "today"
    : `to ${new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
        day: "numeric",
        month: "short",
      })}`;
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
            {/* THE TWO HALVES. Same chip idiom as the window control beside it, because it
                is the same kind of decision — which slice of this window am I looking at —
                and inventing a second control shape for it would make the masthead read as
                two unrelated toolbars. Ink vs muted marks the active one, never a weight
                change: the app has two font weights and a third is a bug. */}
            {(["stats", "log"] as const).map((v) => {
              const on = view === v;
              return (
                <button
                  key={v}
                  onClick={() => setView(v)}
                  aria-pressed={on}
                  className="rounded-full px-3 py-1 text-micro transition-colors"
                  style={{
                    background: on ? "var(--color-accent-soft)" : "transparent",
                    color: on ? "var(--color-ink)" : "var(--color-muted)",
                  }}
                >
                  {v === "stats" ? "Stats" : "Log"}
                </button>
              );
            })}
            <span
              aria-hidden
              className="mx-1 h-4 w-px shrink-0 bg-[var(--color-line-strong)]"
            />
            {view === "stats" &&
              WINDOWS.map((w) => {
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
          {/* THE LOG half. A reader over everything written, grouped by day — see DayLog.
              It replaces the body rather than sitting under it: two answers to two different
              questions, one at a time, which is what the masthead's tabs promise. The
              masthead itself stays, so switching back is always one tap away. */}
          {view === "log" && (
            <DayLog date={logAnchor ?? date} today={today ?? date} />
          )}

          {view === "stats" && (
          <>
          {/* THE FIGURES. A hairline-ruled band, not a row of cards: this app answers a
              card with a rule everywhere else, and four rounded tiles with big numbers in
              them is the one shape that would make it look like every other dashboard.
              FOUR, and four is even — the `last-child:col-span-2` hack that squared off an
              odd fifth is gone with the skills figure. */}
          <div className="grid grid-cols-2 border-y border-[var(--color-line-strong)] lg:grid-cols-4">
            {/* EVERY ONE OF THESE ENDS ON `date`, and `date` is the day the record was
                opened from — which is only usually today. The window moved the moment Today
                learned to step back; the labels have to move with it or all four figures
                are about a fortnight ago while claiming to be about now. `anchored` is one
                suffix so they cannot drift apart. */}
            {/* The fact lines under these figures are GONE — the 2026-08-24 text ruling:
                the data and its window label carry the band, and the derivations live in
                the drill-downs each figure already opens. */}
            <Figure
              label={onToday ? "adherence, last 7 days" : `adherence, 7 days ${anchored}`}
              value={viewedPct == null ? "—" : `${viewedPct}%`}
            />
            <Figure
              label={onToday ? "hours worked, last 7 days" : `hours worked, 7 days ${anchored}`}
              value={asTime(weekHours)}
              onOpen={() => setHoursTotal(true)}
            />
            {/* HEALTH, not "physical" — the display name comes from PILLAR_NAME and from
                nowhere else (spec §7). Sessions, uncapped, and the block IS the way into
                the log they came from. The skills figure beside it is gone: skills are
                hidden, and a figure for something you cannot open is a dead number. */}
            <Figure
              label={onToday ? "Health, past fortnight" : `Health, fortnight ${anchored}`}
              value={facts ? String(facts.workoutSessions) : "—"}
              href="/sessions"
            />
            <Figure
              label={onToday ? "days logged in a row" : `days in a row ${anchored}`}
              value={streak == null ? "—" : String(streak)}
            />
          </div>

          {/* THE TWO PILLARS, at the size they were always meant to be read at. The same
              segmented donuts as the Today screen, with the same arcs in the same order —
              one object, two places, so opening this never means relearning the chart. */}
          <section className="mt-10">
            <div className="section-head">
              <h2 className="text-small font-semibold">The fortnight</h2>
              <span className="text-micro text-[var(--color-muted)]">
                rolling 14 days
              </span>
            </div>

            <div className="mt-4 grid gap-6 sm:grid-cols-2">
              {(rings ?? []).map((p) => (
                <div
                  key={p.key}
                  className="flex flex-col items-center border-t border-[var(--color-line)] pt-5"
                >
                  {/* A Career with nothing to measure — no calendar and no goal that can
                      be late — is an empty DASHED ghost labelled "no goals", never "0%"
                      (spec §1): nothing is being neglected, there is simply nothing to
                      judge. */}
                  <SegmentedRing
                    arcs={p.arcs}
                    ghost={p.fill == null && p.key === "portfolio"}
                    size={170}
                    stroke={11}
                    tone={p.key}
                    spin
                    glow
                  >
                    {p.fill == null && p.key === "portfolio" ? (
                      <span className="text-small text-[var(--color-muted)]">
                        no goals
                      </span>
                    ) : (
                      <span className="stat-hero text-heading">
                        {Math.round((p.fill ?? 0) * 100)}%
                      </span>
                    )}
                  </SegmentedRing>
                  <p className="mt-2 text-small font-semibold">{p.name}</p>
                </div>
              ))}
            </div>
          </section>

          {/* EVERY METRIC, spelled out. The donuts show the shape; this shows the numbers,
              because "3 of 8" is a thing you can act on and an arc is not. Five rows for
              Health's parts, one per counted goal for Career. */}
          <section className="mt-10">
            <div className="section-head">
              <h2 className="text-small font-semibold">Every metric</h2>
            </div>
            <ul className="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {(rings ?? []).flatMap((p) => {
                // Widened to ArcView: a ring is a union of two arc types and only the
                // shared half is drawn here, so naming that half is honest and keeps the
                // two branches from needing two blocks of identical markup.
                const arcs: ArcView[] = p.arcs;
                return arcs.map((arc) => (
                  <li
                    key={`${p.key}-${arc.key}`}
                    className="flex flex-wrap items-center gap-x-3 gap-y-1.5 py-2.5"
                  >
                    <span className="w-16 shrink-0 text-micro text-[var(--color-muted)]">
                      {PILLAR_NAME[p.key]}
                    </span>
                    {/* The label TAKES the room rather than a fixed 6rem column: on Career
                        it is a goal's own title, which is a sentence, not a noun. */}
                    <span className="min-w-0 flex-1 truncate text-small">
                      {arc.label}
                    </span>
                    {/* The fact alone — the window slides, so "day x of 14" is gone
                        here as on the pillars. */}
                    <span className="order-last w-full text-micro tabular-nums text-[var(--color-muted)] sm:order-none sm:w-auto sm:shrink-0">
                      {arc.fact}
                    </span>
                    <span className="h-1.5 w-28 shrink-0 overflow-hidden rounded-full bg-[var(--color-line)]">
                      {arc.fill != null && arc.fill > 0 && (
                        <span
                          className="motion-data block h-full w-full origin-left rounded-full"
                          style={{
                            transform: `scaleX(${arc.fill})`,
                            background: toneColor(p.key),
                          }}
                        />
                      )}
                    </span>
                  </li>
                ));
              })}
            </ul>
          </section>

          {loading ? (
            <p className="py-16 text-small text-[var(--color-muted)]">
              Loading…
            </p>
          ) : (
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              {/* The chart notes are GONE — the 2026-08-24 text ruling. Every decision a
                  note used to state (the observed range, gaps drawing nothing, the floor
                  line) is either visible on the chart itself or recorded in DayChart's
                  own docblock for the next reader of the code. */}
              <Panel title="Adherence" tint={CARD_TINTS.adherence}>
                <DayChart
                  points={adherence}
                  form="bars"
                  unit="%"
                  ceiling={100}
                  emptyNote="Nothing marked in this window yet."
                  onDay={setAdherenceDay}
                />
              </Panel>

              <Panel title="Hours" tint={CARD_TINTS.hours}>
                {/* MINUTES, printed as TIME — in the tooltip, in the slice list AND up the
                    axis. "640" bare is the shape a score wears, which is exactly what this
                    chart stopped being, and an axis is not exempt: with `unit=""` (the
                    unit lives inside the formatted string) a raw scale left the card
                    headed "Hours" printing an unnamed magnitude beside a tooltip that
                    named one. The step is still the chart's own quarter; `format` only
                    decides how it is spelled. */}
                <DayChart
                  points={hours}
                  form="stacked"
                  unit=""
                  format={asChartTime}
                  emptyNote="No blocked hours worked in this window."
                  onDay={setHoursDay}
                />
              </Panel>

              <Panel title="Weight" tint={CARD_TINTS.weight}>
                <DayChart
                  points={weight}
                  form="line"
                  unit="kg"
                  emptyNote="No weights recorded in this window."
                />
                {/* Under the chart, because this is where you are already looking when you
                    notice a gap in it. Backfilling is not an edge case for a record meant to
                    last years — a chart of a fortnight is a chart nobody consults. */}
                <WeightEntry
                  anchor={date}
                  today={today ?? date}
                  onSaved={reloadTrends}
                />
              </Panel>

              <Panel title="Calories" tint={CARD_TINTS.calories}>
                <DayChart
                  points={calories}
                  form="bars"
                  unit="kcal"
                  marker={CALORIE_FLOOR}
                  emptyNote="Nothing logged in this window."
                />
                {/* The way into the writing surface, under the chart it feeds — the same
                    pairing the Weight card draws with its backfill entry. */}
                <button
                  onClick={() => setCalOpen(true)}
                  aria-haspopup="dialog"
                  className="mt-4 inline-flex items-center gap-1.5 border-t border-[var(--color-line)] pt-3 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  open logs
                  <span aria-hidden>→</span>
                </button>
              </Panel>

              {/* STEPS, last. The order of these cards is the argument the record makes:
                  adherence first because it is the app's question, hours second because
                  it is the sanctioned exception, and the last three are facts about a
                  body rather than about a plan. Steps belong with weight and calories,
                  and the floor line is the same statement its dashed checklist box makes.

                  No entry control under it, unlike Weight. The phone is the instrument;
                  a hand-typed step count is a number nobody measured. */}
              {/* FULL WIDTH, because it is the fifth card in a two-column grid and the
                  alternative is a half card with a hole beside it. The width is not a
                  consolation either: this is the one series here with a day-shaped bar for
                  every day of a year window, and it is the one that most wants the room. */}
              <div className="lg:col-span-2">
                <Panel
                  title="Steps"
                  tint={CARD_TINTS.steps}
                  // The fortnight's SUM — the figure the ring counts, printed as data
                  // (the owner's ask, 2026-08-24). null when the phone pushed on none of
                  // the last 14 days: a fortnight nobody measured is not a zero.
                  note={
                    stepsSum14 == null
                      ? undefined
                      : `${stepsSum14.toLocaleString()} · last 14 days`
                  }
                >
                  <StepsChart points={steps} />
                </Panel>
              </div>
            </div>
          )}

          {/* The two chart drill-downs. Mounted only while open, and keyed by date so
              tapping a second day re-reads rather than showing the first day's workings
              under a new heading. */}
          {hoursDay && (
            <ProductivityLog
              key={hoursDay}
              date={hoursDay}
              onClose={() => setHoursDay(null)}
            />
          )}
          {adherenceDay && (
            <AdherenceLog
              key={adherenceDay}
              date={adherenceDay}
              onClose={() => setAdherenceDay(null)}
            />
          )}
          {/* The FIGURE's workings, as opposed to a day's: the same seven days the figure
              above counts, split by where the hours went. Fed the series the chart already
              has, so the sheet and the bars cannot disagree. */}
          {hoursTotal && (
            <HoursTotal
              points={hours.slice(-7)}
              label={
                onToday ? "the last 7 days" : `the 7 days ${anchored}`
              }
              onClose={() => setHoursTotal(false)}
            />
          )}

          {/* The food log, from the Calories card. Mounted only while open, and its
              writes re-run the two time series so the chart it sits over stays true. */}
          {calOpen && (
            <CalorieLog
              date={date}
              today={today}
              total={null}
              entries={[]}
              onChanged={reloadTrends}
              onClose={() => setCalOpen(false)}
            />
          )}

          {/* The one closing line is DATA — the window's coverage. The philosophy
              paragraph that followed it fell to the 2026-08-24 text ruling. */}
          <p className="mt-10 border-t border-[var(--color-line)] pt-4 text-micro tabular-nums leading-relaxed text-[var(--color-muted)]">
            {daysLogged} of {days} days marked
          </p>
          </>
          )}
        </div>
      </main>
    </div>
  );
}

/**
 * One figure in the top band.
 *
 * The number is serif and large but NOT hero-sized: the 52px numeral belongs to today's
 * adherence ring and nothing else may borrow it.
 */
function Figure({
  label,
  value,
  fact,
  onOpen,
  href,
}: {
  label: string;
  value: string;
  /** The line under the figure — OPTIONAL since the 2026-08-24 text ruling, and unused
   *  by the current band: the label and value carry it. Kept so a figure that one day
   *  genuinely needs a qualifier still has a slot that renders correctly. */
  fact?: React.ReactNode;
  /**
   * Open this figure's workings.
   *
   * OPT-IN, and only where there is a derivation worth showing. The figure itself becomes
   * the control — the same idiom the Weight row uses, where the name opens the trend — so
   * no new furniture appears on a band that is deliberately four numbers and three rules.
   */
  onOpen?: () => void;
  /**
   * Where this figure LEADS, when its workings are a page rather than a sheet.
   *
   * Separate from `onOpen` because the element has to differ: a figure that navigates is an
   * anchor — middle-clickable, openable in a new tab, and announced as a link — where one
   * that opens a dialog is a button. Rendering a link as a button is the commonest way a
   * navigation stops behaving like one.
   */
  href?: string;
}) {
  const body = (
    <>
      <p className="text-micro text-[var(--color-muted)]">{label}</p>
      <p
        // The affordance answers to EITHER way through — a sheet or a page. Keyed off
        // `onOpen` alone, the figures that navigate looked inert while behaving as
        // links, which is the worst pairing of the two mistakes.
        className={`mt-1 font-serif text-heading tabular-nums ${onOpen || href ? "underline decoration-[var(--color-line-strong)] decoration-1 underline-offset-4 transition-colors group-hover:decoration-[var(--color-accent)]" : ""}`}
      >
        {value}
      </p>
      {fact != null && (
        <p className="mt-1 text-micro leading-snug text-[var(--color-muted)]">
          {fact}
        </p>
      )}
    </>
  );
  /**
   * THE WHOLE BLOCK IS THE TARGET, by the owner's ruling — not the number, not a word in the
   * caption. A figure is one object; making a fragment of it clickable asks the reader to
   * find the hit area inside something they can already see the boundary of. `block h-full`
   * so every cell in the band is the same height and the hairlines stay continuous whichever
   * cells happen to be interactive.
   */
  const box =
    "block h-full w-full border-r border-[var(--color-line)] px-4 py-4 text-left last:border-r-0 transition-colors";
  const live = `${box} group hover:bg-[var(--color-panel)]`;

  if (href)
    return (
      <a href={href} className={live}>
        {body}
      </a>
    );
  return onOpen ? (
    <button onClick={onOpen} aria-haspopup="dialog" className={live}>
      {body}
    </button>
  ) : (
    <div className={box}>{body}</div>
  );
}

/**
 * One chart and the name that says what it is.
 *
 * A CARD, not a ruled section. The broadsheet grid held while the whole record was one
 * sheet; four charts deep it read as one undifferentiated column, and a chart is the one
 * content here dense enough to earn its own ground. `.record-card` wears the window's own
 * treatment — bevel, radius, top light — so the cards read as smaller panes of the same
 * glass, and each takes a slightly different tint so neighbours part without a rule.
 */
function Panel({
  title,
  note,
  tint,
  children,
}: {
  title: string;
  /** OPTIONAL since the 2026-08-24 text ruling, and now a DATA line where present (the
   *  Steps card's fortnight sum) — never a sentence explaining the chart. */
  note?: string;
  /** This card's ground, from CARD_TINTS. */
  tint?: string;
  children: React.ReactNode;
}) {
  return (
    <section
      className="record-card"
      style={{ "--card-bg": tint } as React.CSSProperties}
    >
      <div className="section-head">
        <h2 className="text-small font-semibold">{title}</h2>
        {note != null && (
          <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
            {note}
          </span>
        )}
      </div>
      <div className="mt-4">{children}</div>
    </section>
  );
}
