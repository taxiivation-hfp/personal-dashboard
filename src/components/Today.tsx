"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BlockList from "./BlockList";
import CalorieInput from "./CalorieInput";
import JournalPanel from "./JournalPanel";
import CoachNote from "./CoachNote";
import CalendarColumn from "./CalendarColumn";
import PillarSections from "./PillarSections";
import Ring, { toneColor } from "./PillarRing";
import { PhoneTabBar, PhoneSwipe, type PhoneTab } from "./PhoneTabs";
import type { Workout } from "./WorkoutLog";
import { prettyDate } from "@/lib/dates";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import { CALENDAR_RATES, type ProductivitySegment } from "@/lib/productivity";
import type { DayView, GoalView, SkillView, PillarKey } from "@/lib/queries";
import type {
  PillarFactInput,
  PillarRingView,
  WorkoutKind,
} from "@/lib/rings";

type StripDay = {
  date: string;
  /** 0-100, and it only ever climbs through the day. Never null — see adherence.ts. */
  pct: number;
  isToday: boolean;
  isFuture: boolean;
  /** Hours SPENT, uncapped. null when the calendar is unreachable — see CLAUDE.md's
   *  Productivity section; it is a quarantined exception, not a second adherence. */
  productivity: { points: number; segments: ProductivitySegment[] } | null;
  /** What the owner intends the day to be. */
  title: string | null;
};

/**
 * The gap between the week's columns, as a PERCENTAGE of the row.
 *
 * Four separate rows have to line up over each other — the percentages, the adherence bars,
 * the productivity columns and the weekday letters. A percentage gap keeps them aligned at
 * every width by construction; a px gap only agrees with itself, which is fine, but it made
 * the earlier SVG overlay drift because that was drawn in a stretched 0-100 box. The overlay
 * is gone and the percentage stayed: it costs nothing and removes a whole class of drift.
 */
const STRIP_GAP_PCT = 2;

/** The stack, bottom-up, in the fill each slab is drawn with. Blocked time keeps the colour
 *  it had in the calendar; the one thing that is not blocked time goes grey. */
const slabFill = (s: ProductivitySegment): string =>
  s.kind === "time" ? (projectedColour(s.colorId) ?? SLAB_NEUTRAL) : SLAB_NEUTRAL;

// Desktop only: each column owns its scroll, bounded to whatever the masthead leaves.
//
// `h-full` inside a flex-1 parent, NOT a calc() against the viewport. The old version
// subtracted a hand-measured 8.5rem for the header, which was wrong the moment the header
// changed height — and would be wrong again on the next masthead edit. The shell is a
// full-height flex column, the content row takes the remainder, and the columns fill it.
//
// `scrollbar-gutter: stable` keeps a column from reflowing when its content grows past
// the fold. On mobile these are inert — the page scrolls as one, as it should.
const colScroll = "lg:h-full lg:overflow-y-auto lg:[scrollbar-gutter:stable]";

/** Hours to one decimal, with no trailing ".0" — "3.5 of 8h" reads; "3.50 of 8.00h" does not. */
const round1 = (n: number) => String(Math.round(n * 10) / 10);

/**
 * One row of the day's checklist.
 *
 * A top rule on EVERY row rather than `divide-y` on the list. divide-y draws between
 * siblings in DOM order, which in a two-column grid puts a rule between the last item of
 * the left column and the first of the right — a line across a column break. Ruling each
 * row from the top gives both columns a matching top edge and costs nothing.
 */
const CHECK_ROW = "border-t border-[var(--color-line)]";

/** The one numeric field shape, so the weight row and the calorie row cannot drift apart. */
const NUM_FIELD =
  "w-[3rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]";

export default function Today({
  initial,
  goals: initialGoals,
  skills: initialSkills,
}: {
  initial: DayView;
  goals: GoalView[];
  skills: SkillView[];
}) {
  const [data, setData] = useState<DayView>(initial);
  const [strip, setStrip] = useState<StripDay[]>([]);
  // Goals, skills and rings are OWNED here rather than left as server props. page.tsx
  // renders once per request, so every new control (subgoal tick, +15/+30/+60, gym
  // toggle) would otherwise mutate data the screen could not re-read without a full
  // navigation.
  const [goals, setGoals] = useState<GoalView[]>(initialGoals);
  const [skills, setSkills] = useState<SkillView[]>(initialSkills);
  const [rings, setRings] = useState<PillarRingView[] | null>(null);
  /** The raw fortnight printed under each pillar's name. Separate from `rings` because it
   *  is a different kind of statement — see pillarCaption. */
  const [facts, setFacts] = useState<PillarFactInput | null>(null);
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  // Phone only: which of the three panes is showing. Opens on the day's work, and a
  // reload returns there rather than wherever you last wandered.
  const [tab, setTab] = useState<PhoneTab>("today");
  // Naming TODAY. The days ahead used to be nameable inline on the strip; the strip now
  // ends on today and holds none of them, so only today's intention is set from this screen.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  // Raised by the Journal row in the checklist — the journal is written, not ticked.
  const [journalPrompt, setJournalPrompt] = useState(false);

  // ENDS on the day being viewed. There is no future half: the calendar column says what
  // tomorrow holds, and a strip that reserved three columns for it spent a third of its
  // width on days that had not happened. A consequence worth knowing — no day on this strip
  // is ever `isFuture`, which is why nothing below branches on it.
  const loadStrip = useCallback(() => {
    fetch(`/api/adherence?days=7&to=${data.date}`)
      .then((r) => r.json())
      .then((s) => !s.error && setStrip(s.days ?? []))
      .catch(() => {});
  }, [data.date]);

  const loadRings = useCallback(() => {
    fetch(`/api/rings?date=${data.date}`)
      .then((r) => r.json())
      .then((s) => {
        if (s.error) return;
        setRings(s.pillars ?? []);
        setFacts(s.facts ?? null);
        setWorkouts(s.workouts ?? []);
      })
      .catch(() => {});
  }, [data.date]);

  const refresh = useCallback(async () => {
    const d = await fetch(`/api/today?date=${data.date}`).then((r) => r.json());
    if (!d.error) setData(d);
    loadStrip();
    loadRings();
  }, [data.date, loadStrip, loadRings]);

  useEffect(loadStrip, [loadStrip]);
  useEffect(loadRings, [loadRings]);

  async function toggleHabit(id: number, done: boolean) {
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: id, date: data.date, done }),
    });
    refresh();
  }

  // Mutating routes return the refreshed collection, so one round trip does both jobs.
  // Deliberately await-then-set rather than optimistic: there are no optimistic updates
  // anywhere in this codebase, and adding the first one beside a toggle that isn't would
  // need rollback semantics nothing else has.
  async function mutateGoals(url: string, init: RequestInit) {
    const r = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.goals) setGoals(r.goals);
  }

  async function mutateSkills(url: string, init: RequestInit) {
    const r = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.skills) setSkills(r.skills);
    loadRings(); // a skill session feeds the Portfolio ring
  }

  /** Numeric non-negotiable (weight). An empty field clears the day. */
  async function setHabitNumber(id: number, raw: string) {
    const v = raw.trim() === "" ? null : Number(raw);
    if (v !== null && !Number.isFinite(v)) return;
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: id, date: data.date, value: v }),
    }).catch(() => {});
    refresh();
  }

  /** id null logs a NEW session; an id edits that one. A day can hold two lifts. */
  async function saveWorkout(
    kind: WorkoutKind,
    note: string,
    id: number | null,
  ) {
    await fetch("/api/gym", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.date, kind, note, id }),
    }).catch(() => {});
    loadRings();
  }

  async function deleteWorkout(id: number) {
    await fetch(`/api/gym?date=${data.date}&id=${id}`, {
      method: "DELETE",
    }).catch(() => {});
    loadRings();
  }

  /** Name a day, or clear it with an empty string. An intention, so rewriting is normal. */
  async function saveDayTitle(date: string, title: string) {
    setEditingTitle(false);
    await fetch("/api/day-title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, title }),
    }).catch(() => {});
    refresh();
  }

  const a = data.adherence;

  /**
   * The week's one piece of arithmetic: how tall the tallest column is.
   *
   * Productivity is UNCAPPED, so there is no ceiling to scale against and it is scaled to
   * the week's own high — the caption says so out loud, since a shape whose scale is
   * unstated is a shape that lies.
   *
   * Adherence needs nothing here. It is a percentage, so its scale is fixed 0..100 and its
   * bar is just the number drawn. That asymmetry is the reason the two are no longer sharing
   * a box: one of them has an axis and the other cannot have one.
   */
  /** 1 keeps the maths safe before the fetch lands, when there are no bars to draw. */
  const peak = Math.max(1, ...strip.map((d) => d.productivity?.points ?? 0));

  /**
   * A key for the stack, built from what the visible week actually contains.
   *
   * Derived rather than declared, so it can never list a colour that isn't on screen — a
   * legend naming four things when three are drawn is worse than none. It is also the only
   * place the grey slabs are named at all; a hue borrowed from the calendar explains
   * itself, and a grey one cannot.
   *
   * Ordered by the registry rather than by first appearance, so it does not reshuffle
   * itself when the week's composition changes.
   */
  const stackKey = (() => {
    const seen = new Map<string, { label: string; rank: number }>();
    for (const d of strip)
      for (const s of d.productivity?.segments ?? []) {
        const fill = slabFill(s);
        if (seen.has(fill)) continue;
        if (s.kind === "time") {
          const i = CALENDAR_RATES.findIndex((c) => c.id === s.colorId);
          seen.set(fill, {
            label: CALENDAR_RATES[i]?.label ?? "Other",
            rank: i < 0 ? CALENDAR_RATES.length : i,
          });
        } else {
          // After every calendar colour: the hours came first, and this is the one thing
          // in the bar that was not an hour.
          seen.set(fill, {
            label: "Non-negotiables",
            rank: CALENDAR_RATES.length + 1,
          });
        }
      }
    return [...seen]
      .map(([fill, v]) => ({ fill, ...v }))
      .sort((x, y) => x.rank - y.rank);
  })();
  // Straight off DayView.pillars — no extra request for something already loaded.
  const colors = Object.fromEntries(
    data.pillars.map((p) => [p.key, p.color]),
  ) as Partial<Record<PillarKey, string | null>>;

  /** The tick / fill for a non-negotiable, in its pillar's hue. Unassigned habits stay
   *  amber. Extracted to a local so the two habit shapes below can't drift apart. */
  const habitTone = (pillar: PillarKey | null | undefined) =>
    pillar ? toneColor(pillar, colors[pillar]) : "var(--color-accent)";

  const middle = (
    <div className="flex flex-col gap-10">
      {/* THE DAY. Date first and small — orienting meta, not a headline — then what you
          INTEND the day to be, in your own words. The intention is deliberately connected
          to nothing: it feeds no rate, no ring and no score, because the moment naming a
          day becomes something you can fail at, it stops being a plan. */}
      <header>
        <p className="text-micro text-[var(--color-muted)]">
          {prettyDate(data.date)}
        </p>
        {editingTitle ? (
          <input
            autoFocus
            value={titleDraft}
            onChange={(e) => setTitleDraft(e.target.value)}
            onBlur={() => saveDayTitle(data.date, titleDraft)}
            onKeyDown={(e) => {
              if (e.key === "Enter") (e.target as HTMLInputElement).blur();
              if (e.key === "Escape") setEditingTitle(false);
            }}
            maxLength={80}
            placeholder="What is today for?"
            aria-label="What is today for?"
            className="mt-1 w-full border-b border-[var(--color-line-strong)] bg-transparent pb-1 font-serif text-heading outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
        ) : (
          <button
            onClick={() => {
              setTitleDraft(data.title ?? "");
              setEditingTitle(true);
            }}
            className="mt-1 block w-full text-left font-serif text-heading transition-colors hover:text-[var(--color-accent)]"
          >
            {data.title ?? (
              <span className="text-[var(--color-muted)]">
                What is today for?
              </span>
            )}
          </button>
        )}
      </header>

      {/* THE HERO. The ring keeps the left side to itself and stays the largest thing on
          the screen; the checklist sits beside it deliberately quieter, because the number
          is the answer and the list is the work. */}
      <section className="flex flex-wrap items-start gap-x-9 gap-y-7">
        <div className="shrink-0">
          {/* The figure CLIMBS from zero: 70 parts blocked hours, 30 parts non-negotiables.
              It is always a number now — a morning that has earned nothing reads 0, which is
              a true statement, where the old null-and-dash meant "nothing has come due" and
              had to be explained every time. Nothing here ever subtracts. */}
          <Ring fill={a.pct / 100} size={176} stroke={8} tone="accent">
            <div className="flex items-end">
              <span className="stat-hero text-hero">{a.pct}</span>
              <span className="stat-hero pb-2 text-body text-[var(--color-muted)]">%</span>
            </div>
          </Ring>
          <p className="mt-3 max-w-[11rem] text-micro text-[var(--color-muted)]">
            {/* What the figure is MADE of, so the number is never a black box. Hours to one
                decimal — "3.5 of 8h" is the shape of a day; "3.4999" is noise. */}
            {round1(a.adheredHours)} of {round1(a.totalHours)}h blocked
            {a.habitsScheduled > 0 && (
              <>
                {" · "}
                {a.habitsDone} of {a.habitsScheduled} ticked
              </>
            )}
            {a.unmarked > 0 && (
              <span className="mt-1 block text-[var(--color-ink)]">
                {a.unmarked} to mark
              </span>
            )}
          </p>
        </div>

        {/* THE CHECKLIST, in TWO COLUMNS.

            One column ran the block well past the bottom of the 176px ring and left the row
            looking like a ring with a list falling off it. Two columns halve the height and
            put the whole day's list inside the ring's own bounds, which is what makes the
            row read as one object rather than two stacked ones.

            Calories and Steps live IN here, as rows of the list. The owner's ruling — they
            are things you do each day, and a second block underneath for two numbers was a
            second block to look at. The weight and calorie history that used to hang off
            these rows has moved to /stats; nothing here is a link any more.

            auto-fit rather than a breakpoint: the column this sits in is 178px wide beside
            the ring on a wide screen and the full 390px below it when it wraps, and neither
            of those is a viewport width. minmax lets the grid answer for itself — two
            columns when there is room for two, one when there is not. */}
        <div className="min-w-[15rem] flex-1">
          {/* 9rem and a 20px gutter, which is what makes two columns land at 308px — the
              width this block actually gets beside the ring. At 10.5rem it needed 364px and
              silently stayed one column, which is the failure mode of auto-fit: it does not
              warn, it just gives you back what you already had. Below ~308px it drops to one
              column on its own, which is the right answer on a narrow phone. */}
          <ul
            className="grid gap-x-5"
            style={{
              gridTemplateColumns: "repeat(auto-fit, minmax(9rem, 1fr))",
            }}
          >
            {data.habits.map((h) =>
              h.input === "number" ? (
                // A NUMERIC non-negotiable — weight. Typing the number IS the tick: the
                // entry exists or it does not, so adherence needs no special case, and
                // clearing the field clears the day exactly like unticking.
                <li key={h.id} className={CHECK_ROW}>
                  <div className="flex w-full items-center gap-2.5 py-2.5">
                    <span
                      aria-hidden
                      className="h-[18px] w-[18px] shrink-0 rounded-[5px] border transition-colors"
                      style={{
                        borderColor: h.done
                          ? habitTone(h.pillar)
                          : "var(--color-line-strong)",
                        background: h.done
                          ? habitTone(h.pillar)
                          : "transparent",
                      }}
                    />
                    <label
                      htmlFor={`h${h.id}`}
                      className={`min-w-0 flex-1 font-serif text-small leading-snug ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </label>
                    {/* A value written on a line, not typed into a chip. The underline is
                        the field; it darkens on focus rather than growing a box. */}
                    <span className="flex shrink-0 items-baseline gap-1">
                      <input
                        id={`h${h.id}`}
                        type="number"
                        step="0.1"
                        min="0"
                        inputMode="decimal"
                        placeholder="—"
                        defaultValue={h.value ?? ""}
                        onBlur={(e) => setHabitNumber(h.id, e.target.value)}
                        onKeyDown={(e) =>
                          e.key === "Enter" &&
                          (e.target as HTMLInputElement).blur()
                        }
                        className={NUM_FIELD}
                      />
                      {h.unit && (
                        <span className="text-micro text-[var(--color-muted)]">
                          {h.unit}
                        </span>
                      )}
                    </span>
                  </div>
                </li>
              ) : (
                <li key={h.id} className={CHECK_ROW}>
                  <button
                    onClick={() =>
                      // The journal is not a thing you tick, it is a thing you write. Its
                      // row opens the page picker instead of toggling, and the tick follows
                      // from saving a page — the only honest signal that one exists.
                      h.system_key === "journal"
                        ? setJournalPrompt(true)
                        : toggleHabit(h.id, !h.done)
                    }
                    aria-pressed={
                      h.system_key === "journal" ? undefined : h.done
                    }
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-2.5 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
                  >
                    <span
                      aria-hidden
                      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors"
                      style={{
                        // Its pillar's hue, so the checklist reads as categorised rather
                        // than as one undifferentiated list. The tick and the muted label
                        // carry done-ness too, so nothing rides on colour alone.
                        borderColor: h.done
                          ? habitTone(h.pillar)
                          : "var(--color-line-strong)",
                        background: h.done
                          ? habitTone(h.pillar)
                          : "transparent",
                      }}
                    >
                      {h.done && (
                        <svg
                          width="11"
                          height="11"
                          viewBox="0 0 12 12"
                          fill="none"
                        >
                          <path
                            d="M2.5 6.5l2.2 2.2L9.5 3.8"
                            stroke="#fff"
                            strokeWidth="2"
                            strokeLinecap="round"
                            strokeLinejoin="round"
                          />
                        </svg>
                      )}
                    </span>
                    <span
                      className={`min-w-0 font-serif text-small leading-snug ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </span>
                  </button>
                </li>
              ),
            )}

            {/* CALORIES. A row of the checklist like any other, with the running total
                where a tick would be — because a total IS the state here, and a box you
                tick would be a second thing to remember once the number is already in. */}
            <li className={CHECK_ROW}>
              <CalorieInput
                date={data.date}
                calories={data.calories}
                entries={data.calorieEntries}
                onChanged={refresh}
              />
            </li>

            {/* STEPS. No writer exists for this yet — an iOS Shortcut posting one number is
                separate, unstarted work — so it is a dashed placeholder rather than a zero.
                A zero would be a failure no behaviour could fix; a dashed rule says plainly
                that nothing is wired up, which is the same language the ghost rings use. */}
            <li className={CHECK_ROW}>
              <div className="flex items-center gap-2.5 py-2.5">
                <span
                  aria-hidden
                  className="h-[18px] w-[18px] shrink-0 rounded-[5px] border border-dashed border-[var(--color-line-strong)]"
                />
                <span className="min-w-0 flex-1 font-serif text-small leading-snug text-[var(--color-muted)]">
                  Steps
                </span>
                <span className="shrink-0 text-micro text-[var(--color-muted)]">
                  soon
                </span>
              </div>
            </li>

            {data.habits.length === 0 && (
              <li className="py-2.5 text-small leading-relaxed text-[var(--color-muted)]">
                Nothing set for today.{" "}
                <Link
                  href="/habits"
                  className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
                >
                  Add some
                </Link>
                .
              </li>
            )}
          </ul>
        </div>
      </section>

      {/* THE WEEK — two measurements, two rows, and deliberately no shared axis.

          Adherence is a thin horizontal bar per day, filling left to right in the accent.
          Productivity is the column beneath it, stacked in the colours those hours had in
          the calendar. They used to share one box with adherence drawn as a line over the
          bars; separating them says plainly that they are two different questions, and it
          stops a reader trying to compare a percentage against an uncapped score.

          The window ENDS ON TODAY. There is no future half any more — the calendar column
          is what says what tomorrow holds, and a week strip that reserved three empty
          columns for it was spending a third of its width on nothing. */}
      <section>
        <div className="mb-2.5 flex items-baseline justify-between gap-3">
          {/* "adherence" has left this line: it prints its own number above its own bar
              now, and a caption naming it as well would be the third time. What is left is
              the one scale a reader cannot infer — the columns, which are uncapped. */}
          <span className="text-micro text-[var(--color-muted)]">
            seven days to today · hours to this week&apos;s high
          </span>
          {data.streak > 0 && (
            // A count, deliberately undramatised — no flame, no badge, no "don't break it".
            // A fact about the record, not a thing you can lose.
            <span className="text-micro text-[var(--color-muted)]">
              {data.streak} day{data.streak === 1 ? "" : "s"} logged in a row
            </span>
          )}
        </div>

        {/* ADHERENCE. The number and its bar are one unit — the bar is the number drawn,
            not a second measurement — so they sit together above the rule with the columns
            below it. Productivity gets no number at all: its height is the whole claim, and
            an uncapped score printed with no ceiling beside it invites a comparison it
            cannot support. */}
        <div className="flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <span
              key={d.date}
              className="min-w-0 flex-1 text-center text-micro tabular-nums"
              style={{
                color: d.isToday ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {d.pct}%
            </span>
          ))}
        </div>

        <div className="mt-1 flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <div
              key={d.date}
              className="h-[3px] min-w-0 flex-1 overflow-hidden"
              // --color-line-strong, not --color-line: a 0% day must still draw a bar. Against
              // the column's #fffdf9 surface, line-strong measures 1.68:1 and line only 1.36:1,
              // which at 3px tall is the difference between an empty bar and no bar. It is the
              // same swap the ring track already made, for the same reason.
              style={{ background: "var(--color-line-strong)" }}
            >
              {/* SQUARE ends, no rounding — the butt-cap rule, applied to a bar. A 1.5px cap at
                  each end of a 40px phone column overstates a small figure by about four points,
                  and the low end is exactly where honesty matters most.

                  scaleX from the left edge, never width: transform is composited and skips
                  layout. A floor of 2%, so a day that earned something never reads as a day that
                  earned nothing; a true 0 draws nothing at all and the track carries the day. */}
              {d.pct > 0 && (
                <div
                  className="h-full w-full origin-left"
                  style={{
                    transform: `scaleX(${Math.max(d.pct, 2) / 100})`,
                    background: "var(--color-accent)",
                    opacity: d.isToday ? 1 : 0.75,
                  }}
                />
              )}
            </div>
          ))}
        </div>

        {/* PRODUCTIVITY. */}
        <div className="mt-2.5 flex items-end" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <div
              key={d.date}
              className="relative h-20 min-w-0 flex-1 overflow-hidden rounded-t-[3px] border-x border-t"
              style={{
                // OUTLINED, not filled. --color-panel-2 measures 1.04:1 against the page,
                // so a day with no bar vanished entirely and the strip read as five days
                // instead of seven. An outline is the system's existing answer: it is how
                // "skipped" stays legible without becoming a third weight of fill.
                //
                // Today is marked by a STRONGER OUTLINE rather than an amber wash. The wash
                // sat behind the slabs and tinted every colour in the stack, which is the
                // one thing a chart made of colours cannot afford.
                borderColor: d.isToday
                  ? "var(--color-ink)"
                  : "var(--color-line-strong)",
              }}
            >
              {/* Each slab sized against the WEEK'S PEAK directly, bottom-aligned.
                  Deliberately un-transformed: a scaleY on the stack would have been
                  composited and free, but it scales the separators with it, so the
                  hairlines that make two slabs read as two would thin toward nothing on
                  exactly the short days that need them most. */}
              {d.productivity && d.productivity.points > 0 && (
                <div className="absolute inset-0 flex flex-col justify-end">
                  {/* Drawn bottom-up, so the largest slab sits at the base and the day
                      reads as a foundation with the extras on top. `segments` arrives
                      largest first — see scoreDay. */}
                  {[...d.productivity.segments].reverse().map((s, i) => (
                    <div
                      key={`${s.kind}-${s.colorId ?? "d"}-${i}`}
                      style={{
                        height: `${(s.points / peak) * 100}%`,
                        background: slabFill(s),
                        // A hairline in the column's own surface, so two slabs of a similar
                        // tone still read as two things.
                        borderTop:
                          i === 0
                            ? undefined
                            : "1px solid var(--color-surface-1)",
                      }}
                    />
                  ))}
                </div>
              )}
            </div>
          ))}
        </div>

        <div className="h-px w-full bg-[var(--color-line-strong)]" />

        <div className="mt-2 flex" style={{ gap: `${STRIP_GAP_PCT}%` }}>
          {strip.map((d) => (
            <span
              key={d.date}
              className="min-w-0 flex-1 text-center text-micro"
              style={{
                color: d.isToday ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", {
                weekday: "narrow",
              })}
            </span>
          ))}
        </div>

        {/* Swatches, not a boxed legend. A few small marks on one line under the chart read
            in a glance and cost a line; a bordered key would cost a block and turn the strip
            into a figure with an apparatus. */}
        {stackKey.length > 0 && (
          <ul className="mt-2.5 flex flex-wrap gap-x-3 gap-y-1">
            {stackKey.map((k) => (
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
      </section>


      <CoachNote date={data.date} />

      <section>
        <div className="section-head">
          <h2 className="text-small font-semibold">Today&apos;s blocks</h2>
        </div>
        <div className="mt-4">
          {data.calendarConnected ? (
            <BlockList
              date={data.date}
              blocks={data.blocks}
              onChanged={refresh}
            />
          ) : (
            <p className="max-w-[42ch] text-body text-[var(--color-muted)]">
              Google Calendar isn&apos;t connected, so there are no blocks to
              mark.{" "}
              <a
                href="/api/google/connect"
                className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
              >
                Connect it
              </a>
              .
            </p>
          )}
        </div>
      </section>

      {/* The JOURNAL, as a shelf of pages and nothing else.

          Its write / type buttons used to sit here as well as behind the checklist row
          above, which offered the same two choices twice; the row is the way in now. The
          pages stay, because they are the artefact and they exist nowhere else. The panel
          is always mounted whether or not there are any — it owns the chooser and the
          writing surface the row opens.

          Non-negotiables and calories were repeated here verbatim and are simply gone:
          both now sit beside the ring, where they are read. */}
      <section>
        <JournalPanel
          date={data.date}
          entries={data.journal}
          onChanged={refresh}
          prompt={journalPrompt}
          actions={false}
          onPromptHandled={() => setJournalPrompt(false)}
        />
      </section>
    </div>
  );

  const pillarPane = (
    <PillarSections
      goals={goals}
      skills={skills}
      rings={rings}
      facts={facts}
      colors={colors}
      workouts={workouts}
      date={data.date}
      onSubgoal={(id, done) =>
        mutateGoals(`/api/subgoals/${id}`, {
          method: "PATCH",
          body: JSON.stringify({ done }),
        })
      }
      onLogTime={(skillId, minutes) =>
        mutateSkills(`/api/skills/${skillId}/time`, {
          method: "POST",
          body: JSON.stringify({ minutes, date: data.date }),
        })
      }
      onUndoTime={(skillId) =>
        mutateSkills(`/api/skills/${skillId}/time?date=${data.date}`, {
          method: "DELETE",
        })
      }
      onSaveWorkout={saveWorkout}
      onDeleteWorkout={deleteWorkout}
    />
  );

  // Below `lg` only ONE pane is mounted, so the phone never pays to render the other two.
  // Above it every pane is shown and the tab is ignored entirely.
  const pane = (t: PhoneTab, node: React.ReactNode) =>
    tab === t ? node : <div className="hidden lg:block">{node}</div>;

  return (
    <PhoneSwipe tab={tab} onTab={setTab}>
      {/* THE MASTHEAD. Full-bleed, one step darker than the windows below it, so the page
          reads as a document with a head rather than three panels adrift.
          Not sticky: on desktop the columns scroll inside the viewport so it never leaves
          anyway, and on mobile a sticky band plus the fixed tab bar would eat ~112px of a
          390px screen.
          Only ink and muted may appear here — --color-skipped measures 4.39:1 on this
          surface and fails, so no block-state chip belongs in the band. */}
      {/* The shell is a full-height flex column on desktop so the columns can fill
          whatever the masthead leaves, rather than a calc() that goes stale. */}
      <div className="lg:flex lg:h-dvh lg:flex-col">
        <div className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
          {/* The title is CENTRED on the page, not on the space left over beside the
              link — hence a three-column grid with an empty cell mirroring the link. A
              flex row with one item pushed right would drift the title off centre by
              exactly half the link’s width. */}
          <div className="mx-auto grid w-full max-w-[92rem] grid-cols-[1fr_auto_1fr] items-baseline gap-4 px-6 py-5 sm:px-8">
            <span aria-hidden />
            {/* Serif because a page heading is the owner’s side of the Author Rule, and
                text-heading rather than text-hero — 52px is the adherence numeral and
                nothing else, and a masthead outsizing the hero would invert the
                hierarchy PRODUCT.md fixes. */}
            <h1 className="text-center font-serif text-heading">
              The Book of Nero
            </h1>
            {/* The date lives on the middle window now, above the ring, where it belongs
                to the day rather than to the app. */}
            <Link
              href="/colours"
              className="justify-self-end text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              colours
            </Link>
          </div>
        </div>

        <div className="mx-auto w-full max-w-[92rem] px-6 pb-28 pt-6 sm:px-8 lg:min-h-0 lg:flex-1 lg:pb-6">
          {/* Source order is middle → left → right, which IS the stacked mobile order, so
            the phone needs no reordering and the day's work leads the document. Desktop
            only moves the columns spatially.
            Three WINDOWS now, each on its own surface with a hairline and a gutter of page
            ground between them. Their tones differ by only 1.03–1.07:1 — the hairline and
            the gutter do the separating; the tone just says which one you are in. */}
          <div className="flex flex-col gap-6 lg:grid lg:h-full lg:grid-cols-[minmax(15rem,1fr)_minmax(26rem,1.9fr)_minmax(16rem,1.15fr)] lg:items-stretch lg:gap-4">
            <div
              className={`window bg-[var(--color-surface-1)] p-5 lg:order-2 lg:p-6 ${colScroll}`}
            >
              {pane("today", middle)}
            </div>
            <div
              className={`window bg-[var(--color-surface-2)] p-5 lg:order-1 lg:p-6 ${colScroll}`}
            >
              {pane("calendar", <CalendarColumn date={data.date} />)}
            </div>
            <div
              className={`window bg-[var(--color-surface-3)] p-5 lg:order-3 lg:p-6 ${colScroll}`}
            >
              {pane("pillars", pillarPane)}
            </div>
          </div>
        </div>
      </div>

      <PhoneTabBar tab={tab} onTab={setTab} />

    </PhoneSwipe>
  );
}
