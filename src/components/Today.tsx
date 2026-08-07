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
import type { DayView, GoalView, SkillView, PillarKey } from "@/lib/queries";
import type { PillarRingView, WorkoutKind } from "@/lib/rings";

type StripDay = {
  date: string;
  pct: number | null;
  isToday: boolean;
  isFuture: boolean;
  /** Hours SPENT, uncapped. null when the calendar is unreachable — see CLAUDE.md's
   *  Productivity section; it is a quarantined exception, not a second adherence. */
  productivity: { points: number } | null;
  /** What the owner intends the day to be. */
  title: string | null;
};

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
  const [workouts, setWorkouts] = useState<Workout[]>([]);
  // Phone only: which of the three panes is showing. Opens on the day's work, and a
  // reload returns there rather than wherever you last wandered.
  const [tab, setTab] = useState<PhoneTab>("today");
  // Naming the day. `editingTitle` is today's; `editingDay` is a date in the strip.
  const [editingTitle, setEditingTitle] = useState(false);
  const [titleDraft, setTitleDraft] = useState("");
  const [editingDay, setEditingDay] = useState<string | null>(null);
  // Raised by the Journal row in the checklist — the journal is written, not ticked.
  const [journalPrompt, setJournalPrompt] = useState(false);

  // Centred on today: past days to the left, upcoming to the right.
  const loadStrip = useCallback(() => {
    fetch(`/api/adherence?days=7&center=${data.date}`)
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
    setEditingDay(null);
    await fetch("/api/day-title", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, title }),
    }).catch(() => {});
    refresh();
  }

  const a = data.adherence;

  /**
   * The productivity trace across the visible week, as polyline points in a 0-100 box.
   *
   * Scaled to the week's OWN high because the score is uncapped and has no ceiling to
   * scale against — the caption says so out loud, since a shape whose scale is unstated is
   * a shape that lies. Stops at today: a line drawn through days that have not happened
   * would be a prediction, and this app does not make those.
   */
  const productivityLine = (() => {
    const upTo = strip.filter((d) => !d.isFuture && d.productivity != null);
    if (upTo.length < 2) return null;
    const peak = Math.max(...upTo.map((d) => d.productivity!.points), 1);
    // Each bar is one 1/n slice of the row; the point sits at its centre.
    const n = strip.length;
    const points = upTo
      .map((d) => {
        const i = strip.findIndex((s) => s.date === d.date);
        const x = ((i + 0.5) / n) * 100;
        // 8% headroom at the top so the peak never touches the frame.
        const y = 100 - (d.productivity!.points / peak) * 92;
        return `${x.toFixed(2)},${y.toFixed(2)}`;
      })
      .join(" ");
    return { points };
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

        {/* The checklist, beside the ring rather than below it. Five items is the settled
            size of this list, so it fits without scrolling or shrinking the ring. */}
        <div className="min-w-[15rem] flex-1">
          <ul className="divide-y divide-[var(--color-line)]">
            {data.habits.map((h) =>
              h.input === "number" ? (
                // A NUMERIC non-negotiable — weight. Typing the number IS the tick: the
                // entry exists or it does not, so adherence needs no special case, and
                // clearing the field clears the day exactly like unticking.
                <li key={h.id}>
                  <div className="flex w-full items-center gap-3 py-2.5">
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
                      className={`font-serif text-body ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </label>
                    <span className="ml-auto flex items-baseline gap-1.5">
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
                        className="w-[3.5rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-body tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]"
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
                <li key={h.id}>
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
                    className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-bg)]"
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
                      className={`font-serif text-body ${h.done ? "text-[var(--color-muted)]" : ""}`}
                    >
                      {h.name}
                    </span>
                  </button>
                </li>
              ),
            )}
            {data.habits.length === 0 && (
              <li className="py-2.5 text-body text-[var(--color-muted)]">
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

          <CalorieInput
            date={data.date}
            calories={data.calories}
            entries={data.calorieEntries}
            onChanged={refresh}
          />

          {/* STEPS. No writer exists for this yet — an iOS Shortcut posting one number is
              separate, unstarted work — so it is a dashed placeholder rather than a zero. A
              zero would be a failure no behaviour could fix; a dashed rule says plainly
              that nothing is wired up, which is the same language the ghost rings use. */}
          <div className="flex items-baseline gap-3 border-t border-[var(--color-line)] py-3">
            <span className="text-body text-[var(--color-muted)]">Steps</span>
            <span
              aria-hidden
              className="ml-auto w-14 border-b border-dashed border-[var(--color-line-strong)]"
            />
            <span className="text-micro text-[var(--color-muted)]">
              from your phone, soon
            </span>
          </div>
        </div>
      </section>

      {/* THE WEEK. Bars are adherence, capped 0-100. The line is the productivity score,
          which is uncapped, so it is scaled to this week's own high and says so. It is
          drawn in INK, never the accent: a second amber quantity beside the adherence bars
          would read as one measurement instead of two. */}
      <section>
        <div className="mb-2 flex items-baseline justify-between gap-3">
          <span className="text-micro text-[var(--color-muted)]">
            adherence · productivity to this week&apos;s high
          </span>
          {data.streak > 0 && (
            // A count, deliberately undramatised — no flame, no badge, no "don't break it".
            // A fact about the record, not a thing you can lose.
            <span className="text-micro text-[var(--color-muted)]">
              {data.streak} day{data.streak === 1 ? "" : "s"} logged in a row
            </span>
          )}
        </div>

        <div className="flex gap-2">
          {strip.map((d) => (
            <span
              key={d.date}
              className="flex-1 text-center text-micro tabular-nums"
              style={{
                color: d.isToday ? "var(--color-ink)" : "var(--color-muted)",
              }}
            >
              {d.productivity ? d.productivity.points : "—"}
            </span>
          ))}
        </div>

        <div className="relative mt-1.5">
          <div className="flex items-end gap-2">
            {strip.map((d) => (
              <div
                key={d.date}
                className="h-16 flex-1 overflow-hidden rounded-t-[3px] border-x border-t"
                style={{
                  // OUTLINED, not filled. --color-panel-2 measures 1.04:1 against the page,
                  // so a day with no bar vanished entirely and the strip read as five days
                  // instead of seven. An outline is the system's existing answer: it is how
                  // "skipped" stays legible without becoming a third weight of fill.
                  borderColor: "var(--color-line-strong)",
                  background: d.isToday
                    ? "var(--color-accent-soft)"
                    : "transparent",
                  opacity: d.isFuture ? 0.55 : 1,
                }}
              >
                {d.pct != null && (
                  <div
                    className="motion-data h-full w-full rounded-t-[3px]"
                    style={{
                      // SLID, not grown. The bar is always full height and translates down
                      // so the track clips all but the top `pct`. translateY is composited
                      // and skips layout entirely — the old height+marginTop version
                      // animated two layout properties and only transitioned one of them.
                      transform: `translateY(${100 - Math.max(d.pct, 3)}%)`,
                      background: "var(--color-accent)",
                      opacity: d.isToday ? 1 : 0.78,
                    }}
                  />
                )}
              </div>
            ))}
          </div>

          {/* The productivity trace, over the bars. Not animated: `points` is neither
              transform nor opacity, so the Transform-Only Rule forbids it, and
              stroke-dasharray is reserved for ring arcs — using it here would make the line
              look like it was being drawn, which is to say celebrated. */}
          {productivityLine && (
            <svg
              className="pointer-events-none absolute inset-0 h-full w-full"
              viewBox="0 0 100 100"
              preserveAspectRatio="none"
              aria-hidden
            >
              <polyline
                points={productivityLine.points}
                fill="none"
                stroke="var(--color-ink)"
                strokeWidth="1.5"
                vectorEffect="non-scaling-stroke"
                strokeLinejoin="round"
              />
            </svg>
          )}
        </div>

        <div className="h-px w-full bg-[var(--color-line-strong)]" />

        <div className="mt-2 flex gap-2">
          {strip.map((d) => (
            <span
              key={d.date}
              className="flex-1 text-center text-micro"
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

        {/* Naming the days ahead. The strip already holds the next three, so they are named
            where they are read rather than on a screen of their own. */}
        <div className="mt-2 flex gap-2">
          {strip.map((d) =>
            d.isFuture ? (
              <div key={d.date} className="min-w-0 flex-1">
                {editingDay === d.date ? (
                  <input
                    autoFocus
                    defaultValue={d.title ?? ""}
                    onBlur={(e) => saveDayTitle(d.date, e.target.value)}
                    onKeyDown={(e) => {
                      if (e.key === "Enter")
                        (e.target as HTMLInputElement).blur();
                      if (e.key === "Escape") setEditingDay(null);
                    }}
                    maxLength={80}
                    aria-label={`Name ${d.date}`}
                    className="w-full border-b border-[var(--color-accent)] bg-transparent text-center font-serif text-micro outline-none"
                  />
                ) : (
                  <button
                    onClick={() => setEditingDay(d.date)}
                    className="block w-full truncate text-center font-serif text-micro text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
                  >
                    {d.title ?? "+"}
                  </button>
                )}
              </div>
            ) : (
              <div key={d.date} className="min-w-0 flex-1" />
            ),
          )}
        </div>
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

      <section>
        <div className="section-head">
          <h2 className="text-small font-semibold">Non-negotiables</h2>
          <Link
            href="/habits"
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            edit
          </Link>
        </div>
        {/* Hairline-separated rows, not a stack of rounded cards. Ticking one of these is
            the single most repeated act in the app; the row is the target, and the rule
            below it is all the separation it needs. */}
        <ul className="divide-y divide-[var(--color-line)]">
          {data.habits.map((h) =>
            // A NUMERIC non-negotiable — weight. Typing a number is the tick: the entry
            // exists or it does not, so adherence needs no special case. Clearing the
            // field clears the day, exactly like unticking.
            h.input === "number" ? (
              <li key={h.id}>
                <div className="flex w-full items-center gap-3.5 py-3">
                  <span
                    aria-hidden
                    className="h-[18px] w-[18px] shrink-0 rounded-[5px] border transition-colors"
                    style={{
                      borderColor: h.done
                        ? habitTone(h.pillar)
                        : "var(--color-line-strong)",
                      background: h.done ? habitTone(h.pillar) : "transparent",
                    }}
                  />
                  <label
                    htmlFor={`h${h.id}`}
                    className={`font-serif text-body ${h.done ? "text-[var(--color-muted)]" : ""}`}
                  >
                    {h.name}
                  </label>
                  {/* A value written on a line, not typed into a chip. The underline is
                      the field; it darkens on focus rather than growing a box. */}
                  <span className="ml-auto flex items-baseline gap-1.5">
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
                      className="w-[4rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-body tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]"
                    />
                    {h.unit && (
                      <span className="text-small text-[var(--color-muted)]">
                        {h.unit}
                      </span>
                    )}
                  </span>
                </div>
              </li>
            ) : (
              <li key={h.id}>
                <button
                  onClick={() => toggleHabit(h.id, !h.done)}
                  aria-pressed={h.done}
                  className="-mx-2 flex w-[calc(100%+1rem)] items-center gap-3.5 rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-panel)]"
                >
                  <span
                    aria-hidden
                    className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors"
                    style={{
                      // Its pillar's hue, so the checklist reads as categorised rather than
                      // as one undifferentiated list. The tick and the muted label carry
                      // done-ness too, so nothing here rides on colour alone.
                      borderColor: h.done
                        ? habitTone(h.pillar)
                        : "var(--color-line-strong)",
                      background: h.done ? habitTone(h.pillar) : "transparent",
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
                    className={`font-serif text-body ${h.done ? "text-[var(--color-muted)]" : ""}`}
                  >
                    {h.name}
                  </span>
                </button>
              </li>
            ),
          )}
          {data.habits.length === 0 && (
            <li className="py-3 text-body text-[var(--color-muted)]">
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
      </section>

      <section>
        <div className="section-head">
          <h2 className="text-small font-semibold">Journal</h2>
        </div>
        <div className="mt-4">
          <JournalPanel
            date={data.date}
            entries={data.journal}
            onChanged={refresh}
            prompt={journalPrompt}
            onPromptHandled={() => setJournalPrompt(false)}
          />
        </div>
      </section>

      <section>
        <CalorieInput
          date={data.date}
          calories={data.calories}
          entries={data.calorieEntries}
          onChanged={refresh}
        />
      </section>
    </div>
  );

  const pillarPane = (
    <PillarSections
      goals={goals}
      skills={skills}
      rings={rings}
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
