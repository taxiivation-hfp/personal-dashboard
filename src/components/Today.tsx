"use client";

import { useCallback, useEffect, useState } from "react";
import Link from "next/link";
import BlockList from "./BlockList";
import CalorieInput from "./CalorieInput";
import JournalPanel from "./JournalPanel";
import CoachNote from "./CoachNote";
import CalendarColumn from "./CalendarColumn";
import PillarSections from "./PillarSections";
import Ring from "./PillarRing";
import { prettyDate } from "@/lib/dates";
import type { DayView, GoalView, SkillView } from "@/lib/queries";
import type { PillarRingView, WorkoutKind } from "@/lib/rings";

type StripDay = { date: string; pct: number | null; isToday: boolean; isFuture: boolean };

// Desktop only: each column owns its scroll, bounded to the viewport below the header.
// `scrollbar-gutter: stable` keeps a column from reflowing when its content grows past
// the fold. On mobile these are inert — the page scrolls as one, as it should.
const colScroll =
  "lg:max-h-[calc(100dvh-9rem)] lg:overflow-y-auto lg:pr-2 lg:[scrollbar-gutter:stable]";

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
  const [workoutsToday, setWorkoutsToday] = useState<WorkoutKind[]>([]);

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
        setWorkoutsToday(s.workoutsToday ?? []);
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
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.goals) setGoals(r.goals);
  }

  async function mutateSkills(url: string, init: RequestInit) {
    const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init })
      .then((x) => x.json())
      .catch(() => ({ error: true }));
    if (!r.error && r.skills) setSkills(r.skills);
    loadRings(); // a skill session feeds the Portfolio ring
  }

  async function toggleWorkout(kind: WorkoutKind, on: boolean) {
    await fetch("/api/gym", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: data.date, kind, on }),
    }).catch(() => {});
    loadRings();
  }

  const a = data.adherence;

  const middle = (
    <div className="flex flex-col gap-12">
      <section>
        {/* Large, amber, thick stroke, number INSIDE — deliberately unlike the small,
            hued, thin pillar rings. Adherence is the hero, not one more quota to fill.
            `a.pct == null` is passed straight through: Ring guards before any arithmetic,
            so a morning with nothing due draws a neutral track and "—", never a 0% ring. */}
        <div className="flex flex-wrap items-center gap-x-7 gap-y-4">
          <Ring fill={a.pct == null ? null : a.pct / 100} size={168} stroke={10} tone="accent">
            <div className="flex items-end">
              <span className="stat-hero text-[3.25rem]">{a.pct == null ? "—" : a.pct}</span>
              {a.pct != null && (
                <span className="stat-hero pb-1.5 text-[1.05rem] text-[var(--color-muted)]">%</span>
              )}
            </div>
          </Ring>
          <p className="max-w-[22rem] text-[15px] leading-relaxed text-[var(--color-muted)]">
            {a.pct == null
              ? "Nothing due yet today."
              : `adhered · ${a.adhered} of ${a.due} so far`}
            {a.unmarked > 0 && <span className="text-[var(--color-ink)]"> · {a.unmarked} to mark</span>}
            {/* Say what is NOT yet in the denominator. The rate moves at the cutoff when
                these join it, and an unexplained drop at 9pm reads as a bug. */}
            {a.habitsPending > 0 && (
              <span className="block text-[13px]">
                {a.habitsPending} non-negotiable{a.habitsPending === 1 ? "" : "s"} not due yet
              </span>
            )}
          </p>
        </div>

        <div className="mt-6 flex items-end gap-1.5">
          {strip.map((d) => (
            <div key={d.date} className="flex flex-1 flex-col items-center gap-1.5">
              <div
                className="h-16 w-full overflow-hidden rounded-md"
                style={{
                  background: d.isToday ? "var(--color-accent-soft)" : "var(--color-panel-2)",
                  // Upcoming days are drawn but empty — they haven't happened, and an
                  // empty bar reads as "not yet" rather than as a zero.
                  opacity: d.isFuture ? 0.5 : 1,
                }}
              >
                {d.pct != null && (
                  <div
                    className="w-full rounded-md bg-[var(--color-accent)] transition-[height] duration-300"
                    style={{ height: `${Math.max(d.pct, 3)}%`, marginTop: `${100 - Math.max(d.pct, 3)}%` }}
                  />
                )}
              </div>
              <span
                className="text-[11px]"
                style={{ color: d.isToday ? "var(--color-ink)" : "var(--color-muted)" }}
              >
                {new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", { weekday: "narrow" })}
              </span>
            </div>
          ))}
        </div>
        {data.streak > 0 && (
          <p className="mt-4 text-[14px] text-[var(--color-muted)]">
            {data.streak} day{data.streak === 1 ? "" : "s"} logged in a row
          </p>
        )}
      </section>

      <CoachNote date={data.date} />

      <section>
        <h2 className="text-[15px] font-semibold">Today&apos;s blocks</h2>
        <div className="mt-4">
          {data.calendarConnected ? (
            <BlockList date={data.date} blocks={data.blocks} onChanged={refresh} />
          ) : (
            <p className="text-[15px] leading-relaxed text-[var(--color-muted)]">
              Google Calendar isn&apos;t connected, so there are no blocks to mark.{" "}
              <a href="/api/google/connect" className="text-[var(--color-accent)] underline underline-offset-4">
                Connect it
              </a>
              .
            </p>
          )}
        </div>
      </section>

      <section>
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="text-[15px] font-semibold">Non-negotiables</h2>
          <Link
            href="/habits"
            className="text-[13px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
          >
            edit
          </Link>
        </div>
        <ul className="mt-3 flex flex-col gap-0.5">
          {data.habits.map((h) => (
            <li key={h.id}>
              <button
                onClick={() => toggleHabit(h.id, !h.done)}
                aria-pressed={h.done}
                className="flex w-full items-center gap-3 rounded-xl px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-panel)]"
              >
                <span
                  aria-hidden
                  className="flex h-5 w-5 shrink-0 items-center justify-center rounded-md border transition-colors"
                  style={{
                    borderColor: h.done ? "var(--color-accent)" : "var(--color-line-strong)",
                    background: h.done ? "var(--color-accent)" : "transparent",
                  }}
                >
                  {h.done && (
                    <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
                      <path d="M2.5 6.5l2.2 2.2L9.5 3.8" stroke="#fff" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
                    </svg>
                  )}
                </span>
                <span className={`text-[15px] ${h.done ? "text-[var(--color-muted)]" : ""}`}>{h.name}</span>
              </button>
            </li>
          ))}
          {data.habits.length === 0 && (
            <li className="px-2 py-2 text-[15px] text-[var(--color-muted)]">
              Nothing set for today.{" "}
              <Link href="/habits" className="text-[var(--color-accent)] underline underline-offset-4">
                Add some
              </Link>
              .
            </li>
          )}
        </ul>
      </section>

      <section>
        <h2 className="text-[15px] font-semibold">Journal</h2>
        <div className="mt-4">
          <JournalPanel date={data.date} entries={data.journal} onChanged={refresh} />
        </div>
      </section>

      <section>
        <CalorieInput date={data.date} calories={data.calories} onChanged={refresh} />
      </section>
    </div>
  );

  return (
    <div className="mx-auto w-full max-w-[92rem] px-6 pb-24 pt-10 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <p className="text-[13px] uppercase tracking-[0.16em] text-[var(--color-muted)]">
          {prettyDate(data.date)}
        </p>
        {/* Phone only. The grid stacks middle → left → right, so the right column sits
            below the day's work AND the 9-day calendar — pillar rings there alone would
            be buried. On desktop the full sections are visible, so this is hidden and the
            old text chips are gone entirely. */}
        <div className="flex gap-2.5 lg:hidden">
          {(rings ?? []).map((r) => (
            <Ring key={r.pillar} fill={r.fill} size={18} stroke={2.5} tone={r.pillar} />
          ))}
        </div>
      </header>

      {/* Source order is middle → left → right, which IS the stacked mobile order, so
          the phone needs no reordering and the day's work leads the document. Desktop
          only moves the columns spatially. */}
      {/* Per-column scrolling turned out to be two utility classes rather than a
          layout rewrite, so it's in: each column bounds its own height below the
          header and scrolls independently. Trivially removable — delete `colScroll`
          from the three wrappers and the columns go back to one page scroll. */}
      <div className="mt-8 flex flex-col gap-14 lg:grid lg:grid-cols-[minmax(15rem,1fr)_minmax(26rem,1.9fr)_minmax(16rem,1.15fr)] lg:items-start lg:gap-10">
        <div className={`lg:order-2 ${colScroll}`}>{middle}</div>
        <div className={`lg:order-1 ${colScroll}`}>
          <CalendarColumn date={data.date} />
        </div>
        <div className={`lg:order-3 ${colScroll}`}>
          <PillarSections
            goals={goals}
            skills={skills}
            rings={rings}
            workoutsToday={workoutsToday}
            onSubgoal={(id, done) =>
              mutateGoals(`/api/subgoals/${id}`, { method: "PATCH", body: JSON.stringify({ done }) })
            }
            onLogTime={(skillId, minutes) =>
              mutateSkills(`/api/skills/${skillId}/time`, {
                method: "POST",
                body: JSON.stringify({ minutes, date: data.date }),
              })
            }
            onUndoTime={(skillId) =>
              mutateSkills(`/api/skills/${skillId}/time?date=${data.date}`, { method: "DELETE" })
            }
            onToggleWorkout={toggleWorkout}
          />
        </div>
      </div>
    </div>
  );
}
