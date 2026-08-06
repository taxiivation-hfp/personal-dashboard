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

  const a = data.adherence;
  // Straight off DayView.pillars — no extra request for something already loaded.
  const colors = Object.fromEntries(
    data.pillars.map((p) => [p.key, p.color]),
  ) as Partial<Record<PillarKey, string | null>>;

  /** The tick / fill for a non-negotiable, in its pillar's hue. Unassigned habits stay
   *  amber. Extracted to a local so the two habit shapes below can't drift apart. */
  const habitTone = (pillar: PillarKey | null | undefined) =>
    pillar ? toneColor(pillar, colors[pillar]) : "var(--color-accent)";

  const middle = (
    <div className="flex flex-col gap-11">
      <section>
        {/* THE HERO. A large amber ring with the figure inside, and the seven-day strip
            beneath it — both fixed by CLAUDE.md, so the redesign works within them rather
            than around them. The stroke is finer and the circle wider than before: a line
            drawn around a number reads as a mark on a page, where a thick arc reads as a
            gauge on a dashboard, and this app is emphatically not the latter.
            `a.pct == null` is passed straight through: Ring guards before any arithmetic,
            so a morning with nothing due draws a neutral track and "—", never a 0% ring. */}
        <div className="flex flex-wrap items-center gap-x-8 gap-y-5">
          <Ring
            fill={a.pct == null ? null : a.pct / 100}
            size={176}
            stroke={8}
            tone="accent"
          >
            <div className="flex items-end">
              <span className="stat-hero text-hero">
                {a.pct == null ? "—" : a.pct}
              </span>
              {a.pct != null && (
                <span className="stat-hero pb-2 text-body text-[var(--color-muted)]">
                  %
                </span>
              )}
            </div>
          </Ring>
          <p className="max-w-[20rem] text-body text-[var(--color-muted)]">
            {a.pct == null
              ? "Nothing due yet today."
              : `adhered · ${a.adhered} of ${a.due} so far`}
            {a.unmarked > 0 && (
              <span className="text-[var(--color-ink)]">
                {" "}
                · {a.unmarked} to mark
              </span>
            )}
            {/* Say what is NOT yet in the denominator. The rate moves at the cutoff when
                these join it, and an unexplained drop at 9pm reads as a bug. */}
            {a.habitsPending > 0 && (
              <span className="mt-1 block text-small">
                {a.habitsPending} non-negotiable
                {a.habitsPending === 1 ? "" : "s"} not due yet
              </span>
            )}
          </p>
        </div>

        {/* The strip sits ON a baseline rule, the way a pencil chart sits on a ruled line,
            with the weekday letters below it as its axis. The old version floated seven
            fat rounded slabs in mid-air with no ground to read them against. */}
        <div className="mt-9">
          <div className="flex items-end gap-2">
            {strip.map((d) => (
              <div
                key={d.date}
                className="h-14 flex-1 overflow-hidden rounded-t-[3px] border-x border-t"
                style={{
                  // OUTLINED, not filled. --color-panel-2 measures 1.04:1 against the page,
                  // so a day with no bar vanished completely and the strip read as five
                  // days instead of seven — the same trap PillarRing documents for an
                  // unfilled ring. Filling the track with --color-line-strong fixed the
                  // legibility but put seven solid slabs under the hero, which is far more
                  // mass than a secondary element earns.
                  //
                  // An outline is the system's existing answer to exactly this: it is how
                  // "skipped" stays legible without becoming a third weight of fill. The
                  // day reads as present, the bar reads as its value, and neither shouts.
                  borderColor: "var(--color-line-strong)",
                  background: d.isToday
                    ? "var(--color-accent-soft)"
                    : "transparent",
                  // Upcoming days are drawn but empty — they haven't happened, and an
                  // empty bar reads as "not yet" rather than as a zero.
                  opacity: d.isFuture ? 0.45 : 1,
                }}
              >
                {d.pct != null && (
                  <div
                    className="motion-data h-full w-full rounded-t-[3px]"
                    style={{
                      // SLID, not grown. The bar is always full height and translates down
                      // so the track clips all but the top `pct`. translateY is composited
                      // and skips layout entirely.
                      //
                      // It replaced `height` + `marginTop`, which was wrong twice over:
                      // both are layout properties, and only `height` was in the transition
                      // list — so marginTop snapped while height eased, and the bar's top
                      // edge teleported on every change.
                      //
                      // translateY over scaleY because scaling squashes the corner radius
                      // vertically; sliding keeps the top corners perfectly round at every
                      // value, which is the only part of the bar the track doesn't clip.
                      transform: `translateY(${100 - Math.max(d.pct, 3)}%)`,
                      // Translucent, so a bar sits IN its track rather than on top of it
                      // and the day's shape reads as depth. Today stays fully opaque.
                      background: "var(--color-accent)",
                      opacity: d.isToday ? 1 : 0.78,
                    }}
                  />
                )}
              </div>
            ))}
          </div>
          <div className="h-px w-full bg-[var(--color-line-strong)]" />
          <div className="mt-2 flex gap-2">
            {strip.map((d) => (
              <span
                key={d.date}
                className="flex-1 text-center text-micro tabular-nums"
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
        </div>

        {/* A count, deliberately undramatised — no flame, no badge, no "don't break it".
            It is a fact about the record, not a thing you can lose. */}
        {data.streak > 0 && (
          <p className="mt-5 text-small text-[var(--color-muted)]">
            {data.streak} day{data.streak === 1 ? "" : "s"} logged in a row
          </p>
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
          <div className="mx-auto flex w-full max-w-[92rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
            {/* Serif because a page heading is the owner's side of the Author Rule, and
              text-heading rather than text-hero — 52px is the adherence numeral and
              nothing else, and a masthead outsizing the hero would invert the hierarchy
              PRODUCT.md fixes. */}
            <h1 className="font-serif text-heading">
              Look Into My Life by Nero
            </h1>
            <div className="flex shrink-0 items-baseline gap-4">
              {/* The date demotes to orienting meta. It used to be set in small tracked
                uppercase — the most over-used AI scaffold there is, and it made the one
                piece of orienting information the hardest thing on the screen to read. */}
              <p className="text-micro text-[var(--color-muted)]">
                {prettyDate(data.date)}
              </p>
              <Link
                href="/colours"
                className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                colours
              </Link>
            </div>
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
