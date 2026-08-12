"use client";

import { useEffect, useMemo, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import StepsChart from "./StepsChart";
import WeightEntry from "./WeightEntry";
import CalorieLog from "./CalorieLog";
import {
  SegmentedRing,
  bandsForPillar,
  toneColor,
  type EventItem,
} from "./PillarRing";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import {
  CALENDAR_RATES,
  CALORIE_FLOOR,
  type ProductivitySegment,
} from "@/lib/productivity";
import type { GoalView, SkillSlice } from "@/lib/queries";
import {
  pillarCaption,
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

export default function Dashboard({
  date,
  today,
  /** Rendered inside an expanding overlay rather than as a page — the close control differs. */
  onClose,
}: {
  date: string;
  /** The real today. Every window here is anchored to `date`, which is the day the record
   *  was opened from and is no longer always today; this is only the far end of the two
   *  date pickers the cards carry, which belong to the calendar and not to the screen. */
  today?: string;
  onClose?: () => void;
}) {
  const [days, setDays] = useState<number>(WINDOWS[0].days);
  const [strip, setStrip] = useState<StripDay[] | null>(null);
  const [trends, setTrends] = useState<TrendDay[] | null>(null);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);
  const [facts, setFacts] = useState<PillarFactInput | null>(null);
  /** The band data the fortnight rings draw from — same feed the Today column reads. */
  const [socialEvents, setSocialEvents] = useState<EventItem[] | null>(null);
  const [birchEvents, setBirchEvents] = useState<EventItem[] | null>(null);
  const [skills14, setSkills14] = useState<SkillSlice[] | null>(null);
  const [colors, setColors] = useState<Partial<Record<PillarKey, string | null>>>({});
  const [streak, setStreak] = useState<number | null>(null);
  const [goals, setGoals] = useState<GoalView[] | null>(null);

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
        setSocialEvents(d.socialEventList ?? null);
        setBirchEvents(d.birchEventList ?? null);
        setSkills14(d.skills14 ?? null);
      })
      .catch(() => {});
    fetch("/api/goals")
      .then((r) => r.json())
      .then((d) => alive && !d.error && setGoals(d.goals ?? []))
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
          // Named the way the week strip names them, from the same table, so the chart's
          // legend and the strip's swatches can never call one colour two things.
          label:
            s.kind === "time"
              ? (CALENDAR_RATES.find((c) => c.id === s.colorId)?.label ??
                "Other")
              : "Non-negotiables",
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

  /**
   * The four figures across the top. Chosen so no two answer the same question:
   * today, this week, this fortnight, and the record so far.
   */
  const week = (strip ?? []).slice(-7);
  const weekHours = week.reduce((s, d) => s + (d.productivity?.minutes ?? 0), 0);
  /**
   * The percentage on the day this window ENDS on — which is `date`, and `date` is only
   * usually today.
   *
   * It used to look for the row flagged `isToday`, which is server truth about the real
   * today. Open the record from a day you have stepped back to and that row is simply not
   * in the window, so the figure read "—" under a label promising a number. Taking the
   * last row instead asks the question the window can actually answer, and the label below
   * says which day it is about.
   */
  const viewedPct = (strip ?? []).at(-1)?.pct ?? null;

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

  /**
   * Finished goals, newest first.
   *
   * Goals completed before this app started stamping completed_at have no date. They are
   * still listed — the achievement is real and the missing date is the app's fault, not the
   * owner's — and they sort last, because an undated thing cannot claim a place in a
   * sequence.
   */
  const done = (goals ?? [])
    .filter((g) => g.status === "done")
    .sort((a, b) => (b.completedAt ?? "").localeCompare(a.completedAt ?? ""));

  /**
   * What is in flight, and the ONE next thing in each.
   *
   * The owner's aim, in their words, is "a clear plan on what I have achieved and what I
   * wanna achieve next". Achieved is the list below; this is the other half, and the next
   * unticked subgoal is what makes it a plan rather than an inventory — a goal you cannot
   * name the next step of is a wish.
   *
   * Ordered by how far along, furthest first. Not a ranking: the nearly-done ones are the
   * ones a decision is actually pending on, and burying them under untouched ones is how a
   * list of intentions turns into wallpaper.
   */
  const active = (goals ?? [])
    .filter((g) => g.status === "active")
    .map((g) => ({ g, next: g.subgoals.find((s) => !s.done) ?? null }))
    .sort((a, b) => b.g.progress - a.g.progress);

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
            {/* EVERY ONE OF THESE ENDS ON `date`, and `date` is the day the record was
                opened from — which is only usually today. The window moved the moment Today
                learned to step back; the labels have to move with it or all four figures
                are about a fortnight ago while claiming to be about now. `anchored` is one
                suffix so they cannot drift apart. */}
            <Figure
              label={`adherence ${anchored}`}
              value={viewedPct == null ? "—" : `${viewedPct}%`}
              fact="70 parts hours, 30 parts non-negotiables"
            />
            <Figure
              label={onToday ? "hours worked, last 7 days" : `hours worked, 7 days ${anchored}`}
              value={asTime(weekHours)}
              fact="blocked time you marked adhered"
            />
            <Figure
              label={onToday ? "sessions, past fortnight" : `sessions, fortnight ${anchored}`}
              value={facts ? String(facts.workoutSessions) : "—"}
              fact="strength, cardio and misc together"
            />
            <Figure
              label={onToday ? "days logged in a row" : `days in a row ${anchored}`}
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
                // The SAME bands, the SAME motion, the SAME lamp as the Today column —
                // one object in two places, so opening the record never means relearning
                // the chart. bandsForPillar is the single constructor both call.
                const b = bandsForPillar(
                  pk,
                  ring,
                  { social: socialEvents, birch: birchEvents, skills: skills14 },
                  PILLAR_NAME[pk],
                );
                return (
                  <div
                    key={pk}
                    className="flex flex-col items-center border-t border-[var(--color-line)] pt-5"
                  >
                    <SegmentedRing
                      segments={b.segments}
                      mid={b.mid}
                      outer={b.outer}
                      size={170}
                      stroke={11}
                      tone={pk}
                      color={colors[pk]}
                      spin
                      glow
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

          {/* THE BOARD.

              Three lists that answer three different questions — what the fortnight
              counted, what is in flight, what is finished — set side by side rather than
              stacked. Stacked they were a report you scroll; side by side they are a board
              you read, which is what the owner asked this screen to be.

              One column below lg, in this order, because on a phone the question you open
              this for is almost always the first one. */}
          <div className="mt-10 grid gap-x-8 gap-y-10 lg:grid-cols-2">
            <div>
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
                      {/* The fact alone — the window slides, so "day x of 14" is gone
                          here as on the pillars. See PillarSections. */}
                      <span className="order-last w-full text-micro tabular-nums text-[var(--color-muted)] sm:order-none sm:w-auto sm:flex-1">
                        {m.fact}
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

            </div>
            <div className="flex flex-col gap-10">
            {/* WHAT IS NEXT. */}
            <section className="mt-10">
              <div className="section-head">
                <h2 className="text-small font-semibold">In flight</h2>
                <span className="text-micro text-[var(--color-muted)]">
                  and the next step in each
                </span>
              </div>
              {active.length === 0 ? (
                <p className="max-w-[62ch] pt-3 text-small leading-relaxed text-[var(--color-muted)]">
                  No goals in flight.{" "}
                  <a
                    href="/goals"
                    className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
                  >
                    Set one
                  </a>{" "}
                  and its subgoals become the plan.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
                  {active.map(({ g, next }) => (
                    <li key={g.id} className="py-3">
                      <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                        <span className="w-20 shrink-0 text-micro text-[var(--color-muted)]">
                          {PILLAR_NAME[g.pillar]}
                        </span>
                        <span className="min-w-0 flex-1 font-serif text-body">
                          {g.title}
                        </span>
                        <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                          {Math.round(g.progress * 100)}%
                        </span>
                        <span className="h-1.5 w-24 shrink-0 overflow-hidden rounded-full bg-[var(--color-line)]">
                          {g.progress > 0 && (
                            <span
                              className="motion-data block h-full w-full origin-left rounded-full bg-[var(--color-accent)]"
                              style={{ transform: `scaleX(${g.progress})` }}
                            />
                          )}
                        </span>
                      </div>
                      {/* The next step, indented to the title. Named plainly — "next" is the
                          word that turns a percentage into something you can act on this
                          afternoon. */}
                      <p className="mt-1 pl-[5.75rem] text-micro text-[var(--color-muted)]">
                        {next ? (
                          <>
                            next · <span className="text-[var(--color-ink)]">{next.title}</span>
                          </>
                        ) : g.subgoals.length === 0 ? (
                          "no subgoals yet — add a few and this becomes a plan"
                        ) : (
                          "every step ticked · mark it done when you agree"
                        )}
                      </p>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            {/* WHAT HAS BEEN ACHIEVED.

                A finished goal used to disappear: every screen filters status !== 'done', so
                the moment you completed something it left the app entirely. That is exactly
                backwards for someone who wants a clear view of what they have achieved and
                what is next — the achievements were the one thing being thrown away.

                Newest first, with the date it was finished. No count, no rate, no "3 this
                quarter": a list of things you have done is not a productivity figure, and
                turning it into one is how an archive becomes a quota. */}
            <section className="mt-10">
              <div className="section-head">
                <h2 className="text-small font-semibold">Achieved</h2>
                <span className="text-micro text-[var(--color-muted)]">
                  goals you have marked done
                </span>
              </div>
              {done.length === 0 ? (
                <p className="max-w-[62ch] pt-3 text-small leading-relaxed text-[var(--color-muted)]">
                  Nothing marked done yet. A goal moves here when you say it is
                  finished — never automatically at 100%, because deciding a thing
                  is done is the owner&apos;s call and not a threshold&apos;s.
                </p>
              ) : (
                <ul className="mt-3 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
                  {done.map((g) => (
                    <li
                      key={g.id}
                      className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                    >
                      <span className="w-20 shrink-0 text-micro text-[var(--color-muted)]">
                        {PILLAR_NAME[g.pillar]}
                      </span>
                      <span className="min-w-0 flex-1 font-serif text-body">
                        {g.title}
                      </span>
                      <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                        {g.completedAt
                          ? new Date(g.completedAt).toLocaleDateString("en-AU", {
                              day: "numeric",
                              month: "short",
                              year: "numeric",
                            })
                          : "date not recorded"}
                      </span>
                    </li>
                  ))}
                </ul>
              )}
            </section>

            </div>
          </div>

          {loading ? (
            <p className="py-16 text-small text-[var(--color-muted)]">
              Loading…
            </p>
          ) : (
            <div className="mt-10 grid gap-6 lg:grid-cols-2">
              <Panel
                title="Adherence"
                tint={CARD_TINTS.adherence}
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
                tint={CARD_TINTS.hours}
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
                tint={CARD_TINTS.weight}
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
                <WeightEntry
                  anchor={date}
                  today={today ?? date}
                  onSaved={reloadTrends}
                />
              </Panel>

              <Panel
                title="Calories"
                tint={CARD_TINTS.calories}
                note="Bars from zero — a line would imply Tuesday's intake flowed into Wednesday's."
              >
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
                  note="What the phone pushed. A day it never reported is a gap, not a day nobody walked — and the line at 7,000 is a floor to reach, never a ceiling."
                >
                  <StepsChart points={steps} />
                </Panel>
              </div>
            </div>
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

          <p className="mt-10 max-w-[62ch] border-t border-[var(--color-line)] pt-4 text-micro leading-relaxed text-[var(--color-muted)]">
            {daysLogged} of the {days} days {anchored} have something marked on
            them.
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

/**
 * One chart and the sentence that says what it is. Every chart here encodes a decision —
 * a ceiling, a floor, a gap that draws nothing — and a reader who does not know the
 * decision will misread the shape.
 *
 * A CARD now, not a ruled section. The broadsheet grid held while the whole record was one
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
  note: string;
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
      </div>
      <p className="max-w-[62ch] pt-2 text-micro leading-relaxed text-[var(--color-muted)]">
        {note}
      </p>
      <div className="mt-4">{children}</div>
    </section>
  );
}
