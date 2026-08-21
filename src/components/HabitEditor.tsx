"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { addDays, todayISO } from "@/lib/dates";
import { weekdayBit } from "@/lib/engine";
import type { HabitView } from "@/lib/queries";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"]; // bit0=Mon … bit6=Sun
const ALL = 127;

/** A one-off non-negotiable still ahead, as /api/habits/one-off returns it. */
type OneOff = {
  id: number;
  date: string;
  title: string;
};

/** An open one-off task, as /api/tasks returns it. */
type OpenTask = {
  id: number;
  title: string;
  due: string;
  carried: number;
};

/** "2026-08-23" -> "Sat 23 Aug", for the rare one-off sitting past tomorrow. Noon, never
 *  midnight — a bare ISO date parses as UTC and lands on the day before west of
 *  Greenwich. */
const shortDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

export default function HabitEditor({ initial }: { initial: HabitView[] }) {
  const [habits, setHabits] = useState(initial);
  const [name, setName] = useState("");
  const today = todayISO();
  const tomorrowDate = addDays(today, 1);
  /** One-off non-negotiables still ahead. null until the fetch lands. */
  const [oneOffs, setOneOffs] = useState<OneOff[] | null>(null);
  const [oneOffTitle, setOneOffTitle] = useState("");
  /** A one-off write that was refused, in the server's own words — said quietly in
   *  muted ink and cleared by the next write that lands. The DELETE route 409s on
   *  purpose ("the caller hears it rather than a silent ok"), so this caller hears it. */
  const [oneOffError, setOneOffError] = useState<string | null>(null);
  /** Open one-off tasks. null until the fetch lands. */
  const [tasks, setTasks] = useState<OpenTask[] | null>(null);
  const [taskTitle, setTaskTitle] = useState("");
  /** Defaults to TOMORROW — this whole screen is about the day ahead. */
  const [taskDue, setTaskDue] = useState(tomorrowDate);

  useEffect(() => {
    fetch("/api/tasks")
      .then((r) => r.json())
      .then((d) => !d.error && setTasks(d.tasks ?? []))
      .catch(() => setTasks([]));
  }, []);

  useEffect(() => {
    fetch("/api/habits/one-off")
      .then((r) => r.json())
      .then((d) => !d.error && setOneOffs(d.oneOffs ?? []))
      .catch(() => setOneOffs([]));
  }, []);

  /** Every task write hands back the open list, so one round trip does both jobs. */
  async function taskCall(init: RequestInit, url = "/api/tasks") {
    const d = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((r) => r.json())
      .catch(() => ({ error: true }));
    if (!d.error) setTasks(d.tasks ?? []);
  }

  async function addTask() {
    const t = taskTitle.trim();
    if (!t) return;
    setTaskTitle("");
    await taskCall({
      method: "POST",
      body: JSON.stringify({ title: t, due: taskDue }),
    });
  }

  /** Same round-trip shape for the one-offs — every write returns the upcoming list.
   *  True on success, so a caller can decide what to give up (the typed title, say)
   *  only once the write has actually landed. */
  async function oneOffCall(
    init: RequestInit,
    url = "/api/habits/one-off",
  ): Promise<boolean> {
    const d = await fetch(url, {
      headers: { "content-type": "application/json" },
      ...init,
    })
      .then((r) => r.json())
      .catch(() => ({ error: "could not reach the server" }));
    if (d.error) {
      // Refused or unreachable — say so, and RE-READ the list rather than leave it
      // stale: the commonest refusal is a row whose day arrived while this page sat
      // open, and that row now belongs to Today's checklist, not to this planning list.
      setOneOffError(
        typeof d.error === "string" ? d.error : "that didn't save",
      );
      fetch("/api/habits/one-off")
        .then((r) => r.json())
        .then((x) => !x.error && setOneOffs(x.oneOffs ?? []))
        .catch(() => {});
      return false;
    }
    setOneOffError(null);
    setOneOffs(d.oneOffs ?? []);
    return true;
  }

  async function addOneOff() {
    const t = oneOffTitle.trim();
    if (!t) return;
    // No date travels: this section is named after the one day it writes to, and the
    // route defaults to tomorrow. The field clears only once the write has landed —
    // clearing first would discard the owner's words on a refusal.
    const ok = await oneOffCall({
      method: "POST",
      body: JSON.stringify({ title: t }),
    });
    if (ok) setOneOffTitle("");
  }

  async function reload() {
    const d = await fetch("/api/habits").then((r) => r.json());
    if (!d.error) setHabits(d.habits ?? []);
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setName("");
    await fetch("/api/habits", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n, days_mask: ALL }),
    });
    reload();
  }

  async function patch(body: Record<string, unknown>) {
    await fetch("/api/habits", {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body),
    });
    reload();
  }

  function toggleDay(h: HabitView, i: number) {
    const bit = 1 << i;
    const next = h.days_mask & bit ? h.days_mask & ~bit : h.days_mask | bit;
    // Zero days would make it invisible everywhere with no way back from Today.
    patch({ id: h.id, days_mask: next === 0 ? h.days_mask : next });
  }

  /** Tomorrow's standing checklist, read from the roster already on this screen — shown
   *  so the addition below is made against what the day already holds. */
  const tomorrowBit = weekdayBit(tomorrowDate);
  const standingTomorrow = habits.filter((h) => h.days_mask & tomorrowBit);

  return (
    <main className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-12 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-heading font-serif font-semibold">
          Non-negotiables
        </h1>
        <Link
          href="/"
          aria-label="Close"

          className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"

          >

            ×

          </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Small, binary, and separate from your blocks. No states and no reasons
        here — that&apos;s the point of the contrast. Pick which days each one
        applies to.
      </p>

      {/* A ruled list, not a stack of cards. The whole promise of this screen is that these
          are small plain things; a rounded panel around each one dressed a checklist up as a
          dashboard and made four items look like four features. */}
      <ul className="mt-8 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
        {habits.map((h) => (
          <li key={h.id} className="py-4">
            <div className="flex items-center justify-between gap-3">
              {/* The owner named it, so the field keeps the serif. The rule under it appears
                  on focus only — a resting underline on every row would read as a form to be
                  filled in rather than a list to be glanced at. */}
              <input
                defaultValue={h.name}
                onBlur={(e) =>
                  e.target.value.trim() &&
                  e.target.value !== h.name &&
                  patch({ id: h.id, name: e.target.value })
                }
                className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)]"
                aria-label={`Rename ${h.name}`}
              />
              <button
                onClick={() => patch({ id: h.id, remove: true })}
                className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                remove
              </button>
            </div>
            {/* Filled vs outlined, not dark vs pale: an off day has to look deliberately
                empty rather than switched off or unavailable, since most items legitimately
                run on a few days. Shape carries the state; the accent only confirms it. */}
            <div className="mt-3 flex gap-1.5">
              {DAYS.map((d, i) => {
                const on = Boolean(h.days_mask & (1 << i));
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(h, i)}
                    aria-label={`${d} ${on ? "on" : "off"}`}
                    aria-pressed={on}
                    className={`h-7 w-7 rounded-full border text-micro transition-colors ${
                      on
                        ? "border-[var(--color-accent)] bg-[var(--color-accent)] text-white"
                        : "border-[var(--color-line-strong)] text-[var(--color-muted)]"
                    }`}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-8 flex items-end gap-4">
        {/* Written on a line rather than into a box: what goes in here is the owner's own
            wording, and a bordered field asks for data where the page is asking for a
            sentence. Serif for the same reason. */}
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a non-negotiable…"
          className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          Add
        </button>
      </div>

      {/* TOMORROW, SPECIFICALLY — reshaped by the owner's ruling, 2026-08-21. This used to
          dress the STANDING rows differently for one day (a different name, a different
          pillar); that edit surface is gone. What tomorrow takes now is an ADDITION: a
          one-off non-negotiable, one more item of tomorrow's checklist and its adherence
          tally, gone from the roster the day after. The standing list is printed read-only
          so the addition is made against what the day already holds — here you add to
          tomorrow, you never edit it.

          Tomorrow and never today, and the engine enforces it: adherence divides by items
          scheduled, so an item joining a day already being lived could make the climbing
          figure FALL. Added tonight, it is part of what tomorrow morning already knows. */}
      <section className="mt-12">
        <div className="section-head">
          <h2 className="text-small font-semibold">Tomorrow, specifically</h2>
          <span className="text-micro text-[var(--color-muted)]">
            one day only · counts toward tomorrow&apos;s adherence
          </span>
        </div>

        <p className="mt-3 max-w-[60ch] text-small leading-relaxed text-[var(--color-muted)]">
          A non-negotiable for tomorrow alone. It joins tomorrow&apos;s
          checklist as an equal item and is gone the day after — unlike a task
          below, it never carries, and it is scored.
        </p>

        <div className="mt-4 flex items-end gap-4">
          <input
            value={oneOffTitle}
            onChange={(e) => setOneOffTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addOneOff()}
            maxLength={120}
            placeholder="Add one for tomorrow…"
            className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
          <button
            onClick={addOneOff}
            disabled={!oneOffTitle.trim()}
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {/* A refused write, in the server's own words — muted, no red, no blame. */}
        {oneOffError && (
          <p className="pt-2 text-micro leading-relaxed text-[var(--color-muted)]">
            {oneOffError}
          </p>
        )}

        {oneOffs == null && (
          <p className="pt-4 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {oneOffs != null && (
          <ul className="mt-5 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {/* The standing items first, as plain facts — no fields, no selects. The word
                "standing" is what says why there is no remove beside them: the roster
                above is where the every-day list is shaped. */}
            {standingTomorrow.map((h) => (
              <li
                key={`s${h.id}`}
                className="flex items-center justify-between gap-3 py-3"
              >
                <span className="min-w-0 flex-1 font-serif text-body text-[var(--color-muted)]">
                  {h.name}
                </span>
                <span className="shrink-0 text-micro text-[var(--color-muted)]">
                  standing
                </span>
              </li>
            ))}
            {oneOffs.map((o) => (
              <li key={o.id} className="flex items-center gap-3 py-3">
                <span className="min-w-0 flex-1 font-serif text-body">
                  {o.title}
                </span>
                {/* Only when it is NOT tomorrow's — the section is named after the day
                    it writes to, so tomorrow needs no caption and any straggler does. */}
                {o.date !== tomorrowDate && (
                  <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                    {shortDay(o.date)}
                  </span>
                )}
                <button
                  onClick={() =>
                    oneOffCall(
                      { method: "DELETE" },
                      `/api/habits/one-off?id=${o.id}`,
                    )
                  }
                  className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  remove
                </button>
              </li>
            ))}
            {standingTomorrow.length === 0 && oneOffs.length === 0 && (
              <li className="py-3 text-small text-[var(--color-muted)]">
                Nothing is on tomorrow&apos;s list yet.
              </li>
            )}
          </ul>
        )}
      </section>

      {/* ONE-OFF TASKS — the other half of "just tomorrow".

          The section above adds a SCORED item to one day's checklist. This adds something
          that exists on one day only and was never part of any list at all: "book the
          physio", "email the supervisor". If it is not ticked it carries forward until it
          is, so nothing has to be re-added and nothing quietly disappears.

          It is UNSCORED, and the note says so. The checklist's habit share is split evenly
          between the non-negotiables SCHEDULED for a day — a fixed denominator known each
          morning. A backlog joining it would make every other item worth less for reasons
          nothing you did today caused, which is the same argument that keeps the gym off
          the checklist. See src/lib/tasks.ts. */}
      <section className="mt-12">
        <div className="section-head">
          <h2 className="text-small font-semibold">Tasks</h2>
          <span className="text-micro text-[var(--color-muted)]">
            one day only · carries over until done · not scored
          </span>
        </div>

        <div className="mt-4 flex flex-wrap items-end gap-x-4 gap-y-3">
          <input
            value={taskTitle}
            onChange={(e) => setTaskTitle(e.target.value)}
            onKeyDown={(e) => e.key === "Enter" && addTask()}
            maxLength={120}
            placeholder="Add a task…"
            className="min-w-[12rem] flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
          />
          {/* Dated, and the floor is TODAY: a task is a thing you are going to do, and a
              day already gone is not a day you can plan. The default is tomorrow. */}
          <input
            type="date"
            value={taskDue}
            min={today}
            onChange={(e) => e.target.value && setTaskDue(e.target.value)}
            aria-label="The day this task is for"
            className="rounded border border-[var(--color-line)] bg-transparent px-2 py-1 font-serif text-micro outline-none transition-colors focus:border-[var(--color-accent)]"
          />
          <button
            onClick={addTask}
            disabled={!taskTitle.trim()}
            className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Add
          </button>
        </div>

        {tasks == null && (
          <p className="pt-4 text-small text-[var(--color-muted)]">Loading…</p>
        )}

        {tasks != null && tasks.length === 0 && (
          <p className="pt-4 text-small leading-relaxed text-[var(--color-muted)]">
            Nothing outstanding. A task added here shows up on Today on the day
            it is for, and stays there until you tick it.
          </p>
        )}

        {tasks != null && tasks.length > 0 && (
          <ul className="mt-5 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
            {tasks.map((t) => (
              <li
                key={t.id}
                className="flex flex-wrap items-center gap-x-3 gap-y-2 py-3"
              >
                <input
                  key={`${t.id}-${t.title}`}
                  defaultValue={t.title}
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value !== t.title &&
                    taskCall({
                      method: "PATCH",
                      body: JSON.stringify({ id: t.id, title: e.target.value }),
                    })
                  }
                  onKeyDown={(e) =>
                    e.key === "Enter" && (e.target as HTMLInputElement).blur()
                  }
                  aria-label={`Rename ${t.title}`}
                  className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)]"
                />

                {/* Moving the day is ordinary, not an admission — a plan is rewriteable,
                    which is the same thing the day title says about itself. */}
                <input
                  type="date"
                  value={t.due}
                  min={today}
                  onChange={(e) =>
                    e.target.value &&
                    taskCall({
                      method: "PATCH",
                      body: JSON.stringify({ id: t.id, due: e.target.value }),
                    })
                  }
                  aria-label={`The day ${t.title} is for`}
                  className="shrink-0 rounded border border-[var(--color-line)] bg-transparent px-1.5 py-0.5 font-serif text-micro outline-none transition-colors focus:border-[var(--color-accent)]"
                />

                {t.carried > 0 && (
                  <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                    carried {t.carried}d
                  </span>
                )}

                <button
                  onClick={() =>
                    taskCall({ method: "DELETE" }, `/api/tasks?id=${t.id}`)
                  }
                  className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  remove
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </main>
  );
}
