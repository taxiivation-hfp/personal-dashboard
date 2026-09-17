"use client";

import { useState } from "react";
import Link from "next/link";
import type { GoalView } from "@/lib/queries";

/**
 * The one deeper screen for goals, alongside /habits.
 *
 * EVERY GOAL IS A CAREER GOAL since the Health & Career pivot, so there is no pillar picker
 * here any more: the engine files a new goal under `portfolio` and the stored `pillar_id` on
 * the old rows is history. A picker with one option is a control that only ever asks a
 * question already answered.
 *
 * Weights: blank means AUTO — the subtask takes an equal share of whatever the explicit
 * ones leave behind. That is the default, so most goals never need a number typed at all.
 *
 * Progress is NOT editable here and has no field. It is derived from which subtasks are
 * ticked, and letting it be set by hand is what let the stored column drift out of step
 * with the subgoals that define it.
 *
 * THE DEADLINE IS WHAT PUTS A GOAL IN THE CAREER RING (career.ts: status 'active' AND a
 * deadline). It is optional and stays optional — a goal with no date is not a goal behind
 * schedule, it is a goal with no pace to be measured against, and it still lists when Career
 * is opened. That is why this screen edits the date and never demands one.
 */

/** "2026-09-18" -> "18 Sept". The same helper Timeline.tsx carries, for the same reason:
 *  a completion date printed as the database stores it is the one place this app would let
 *  its schema speak. Noon, never midnight — a bare ISO date parses as UTC and lands on the
 *  day before anywhere west of Greenwich. */
const shortDate = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
  });
export default function GoalEditor({ initial }: { initial: GoalView[] }) {
  const [goals, setGoals] = useState<GoalView[]>(initial);
  const [busy, setBusy] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [newDeadline, setNewDeadline] = useState("");
  const [newSub, setNewSub] = useState<Record<number, string>>({});

  // Every mutating route returns the refreshed list, so one round trip does both jobs.
  async function call(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const r = await fetch(url, {
        headers: { "content-type": "application/json" },
        ...init,
      })
        .then((x) => x.json())
        .catch(() => ({ error: true }));
      if (!r.error && r.goals) setGoals(r.goals);
    } finally {
      setBusy(false);
    }
  }

  return (
    // The WINDOW LOOK, joining the record, the journal and the sessions log: masthead
    // band, one window on the page ground, each goal a card inside it. This page was bare
    // type floating on the beige — the last deeper screen outside the family.
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
        <div className="mx-auto flex w-full max-w-[64rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
          <h1 className="font-serif text-heading">Goals</h1>
          <Link
            href="/"
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </Link>
        </div>
      </header>

      {/* Gold, the pillar window's own surface — goals are read from that window on Today,
          so their deeper screen keeps its ground. */}
      <main className="mx-auto w-full max-w-[64rem] flex-1 px-6 pb-16 pt-6 sm:px-8">
        <div className="window bg-[var(--color-surface-3)] p-5 lg:p-8">
      {/* The weights explainer fell to the 2026-08-24 text ruling — the blank-means-auto
          rule is documented in goals.ts for the next reader of the code. */}
      {/* Each goal a CARD — the record's card treatment. The old ruling here was hairlines
          over cards, made when cards meant floating tiles on bare page; inside a window the
          card is a smaller pane of the same glass, which is the family look the owner asked
          every deeper screen to keep. */}
      <div className="mt-8 flex flex-col gap-5">
        {goals.map((g) => (
          // The percentage hangs in the page margin, where it sits on Today too, so one goal
          // reads as one object across both screens instead of two different layouts.
          <section key={g.id} className="record-card page-margin">
            <div className="pt-1.5 text-right text-micro tabular-nums text-[var(--color-muted)]">
              {Math.round(g.progress * 100)}%
            </div>

            <div className="min-w-0">
              <div className="flex items-baseline gap-3">
                {/* The owner's own title, so it keeps the serif inside the field it is edited
                    in — one string must not render serif on Today and sans here. The rule is
                    invisible until focus, because eight resting underlines would turn a list
                    of goals back into a form. */}
                <input
                  defaultValue={g.title}
                  aria-label="Goal title"
                  onBlur={(e) =>
                    e.target.value.trim() &&
                    e.target.value.trim() !== g.title &&
                    call(`/api/goals/${g.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({ title: e.target.value }),
                    })
                  }
                  className={`min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)] ${
                    g.status === "done" ? "text-[var(--color-muted)]" : ""
                  }`}
                />
                {/* MARKING A GOAL DONE IS THE OWNER'S CALL and has to be makeable from the
                    screen the Career drill-down links to, or "edit →" would open a page that
                    cannot do the one thing the list beside it offers. The engine stamps
                    completed_at on the way in and clears it on the way out, so reopening is
                    not a second state to keep in step. A finished goal keeps its card here —
                    listGoals returns everything but 'dropped' — because the screen that
                    writes goals must not be the screen that loses them. */}
                <button
                  onClick={() =>
                    call(`/api/goals/${g.id}`, {
                      method: "PATCH",
                      body: JSON.stringify({
                        status: g.status === "done" ? "active" : "done",
                      }),
                    })
                  }
                  disabled={busy}
                  className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
                >
                  {g.status === "done" ? "reopen" : "mark done"}
                </button>
                <button
                  onClick={() =>
                    confirm(`Drop "${g.title}"? Its subtasks are kept.`) &&
                    call(`/api/goals/${g.id}`, { method: "DELETE" })
                  }
                  disabled={busy}
                  className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
                >
                  drop
                </button>
              </div>

              {/* THE DEADLINE, on its own line under the title. An empty field CLEARS it
                  (the route reads "" as null), which is how a goal leaves the ring without
                  being finished or dropped.

                  KEYED BY THE STORED VALUE, deliberately: this is an uncontrolled field, and
                  React only writes defaultValue to the value ATTRIBUTE — which a browser
                  ignores once the field has been typed in. Without the key, a date the
                  server normalised or refused would leave the rejected one sitting on screen
                  as if it had been saved. The same rule the checklist's numeric rows run
                  under.

                  A done goal prints its completion date here instead: the field would be
                  asking when a finished thing is due. */}
              {g.status === "done" ? (
                <p className="mt-2 text-micro tabular-nums text-[var(--color-muted)]">
                  {/* Goals finished before completed_at was ever written are undated. They
                      still say they are done — an undated fact is not a missing one. */}
                  done{g.completedAt ? ` ${shortDate(g.completedAt)}` : ""}
                </p>
              ) : (
                <label className="mt-2 flex items-center gap-2 text-micro text-[var(--color-muted)]">
                  deadline
                  <input
                    key={`${g.id}-${g.deadline ?? ""}`}
                    type="date"
                    defaultValue={g.deadline ?? ""}
                    onBlur={(e) =>
                      call(`/api/goals/${g.id}`, {
                        method: "PATCH",
                        body: JSON.stringify({
                          deadline: e.target.value || null,
                        }),
                      })
                    }
                    className="border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-micro tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]"
                  />
                </label>
              )}

              {/* The same bar as Today, drawn the same way, so ticking a subtask here and
                  seeing it there is plainly the one number. The track is a rule rather than a
                  recessed slab: with the cards gone, --color-panel-2 sits two points off the
                  page and the bar loses its ground.
                  scaleX, not width — transform is composited and skips layout entirely. */}
              <div className="mt-2.5 h-1.5 w-full overflow-hidden rounded-full bg-[var(--color-line)]">
                <div
                  className="motion-data h-full w-full origin-left rounded-full bg-[var(--color-accent)]"
                  style={{ transform: `scaleX(${g.progress})` }}
                />
              </div>

              <ul className="mt-3 divide-y divide-[var(--color-line)]">
                {g.subgoals.map((s) => (
                  <li key={s.id} className="flex items-center gap-3 py-2">
                    <input
                      defaultValue={s.title}
                      aria-label="Subtask title"
                      onBlur={(e) =>
                        e.target.value.trim() &&
                        e.target.value.trim() !== s.title &&
                        call(`/api/subgoals/${s.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({ title: e.target.value }),
                        })
                      }
                      className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-small outline-none transition-colors focus:border-[var(--color-accent)]"
                    />
                    {/* A setting, not writing: sans and tabular so a column of weights stays
                        a column. Written on a line rather than in a filled chip — the chip
                        read as a value the app had decided, when blank is the normal state. */}
                    <input
                      type="number"
                      min={0}
                      max={100}
                      placeholder="auto"
                      aria-label={`Weight for ${s.title}, blank for auto`}
                      defaultValue={
                        s.weight > 0 ? Math.round(s.weight * 100) : ""
                      }
                      onBlur={(e) =>
                        call(`/api/subgoals/${s.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            weight:
                              e.target.value === ""
                                ? 0
                                : Number(e.target.value) / 100,
                          }),
                        })
                      }
                      className="w-14 shrink-0 border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-micro tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                    />
                    <button
                      onClick={() =>
                        confirm(`Delete "${s.title}"?`) &&
                        call(`/api/subgoals/${s.id}`, { method: "DELETE" })
                      }
                      disabled={busy}
                      aria-label={`Delete ${s.title}`}
                      className="shrink-0 px-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
                    >
                      ×
                    </button>
                  </li>
                ))}
              </ul>

              {/* Fires only when explicit overrides exceed 100% — an all-auto goal is
                  well-formed and must never warn. Muted and plain: it is a fact about the
                  arithmetic, not a fault. */}
              {g.overAllocated && (
                <p className="mt-2 text-micro text-[var(--color-muted)]">
                  Set weights total more than 100%, so the auto ones have
                  nothing left.
                </p>
              )}

              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  const t = (newSub[g.id] ?? "").trim();
                  if (!t) return;
                  setNewSub({ ...newSub, [g.id]: "" });
                  call("/api/subgoals", {
                    method: "POST",
                    body: JSON.stringify({ goal_id: g.id, title: t }),
                  });
                }}
                className="mt-3"
              >
                <input
                  value={newSub[g.id] ?? ""}
                  onChange={(e) =>
                    setNewSub({ ...newSub, [g.id]: e.target.value })
                  }
                  placeholder="Add a subtask"
                  className="w-full border-b border-[var(--color-line-strong)] bg-transparent pb-1 font-serif text-small outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                />
              </form>
            </div>
          </section>
        ))}

        {goals.length === 0 && (
          <p className="py-5 text-body text-[var(--color-muted)]">
            No goals yet.
          </p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = newGoal.trim();
          if (!t) return;
          // Both fields clear together, on the same submit the title always cleared on:
          // a date left standing behind a title that has gone would quietly become the
          // next goal's deadline.
          setNewGoal("");
          setNewDeadline("");
          // No pillar: the engine files every goal under Career. The route ignores a
          // `pillar` field from an older client rather than refusing it.
          call("/api/goals", {
            method: "POST",
            body: JSON.stringify({ title: t, deadline: newDeadline || null }),
          });
        }}
        className="mt-10 flex items-end gap-4"
      >
        {/* Serif, because what gets typed here is a goal title — the same words that render
            serif everywhere else the moment it is saved. The deadline beside it is the app's
            own vocabulary, so it stays sans. */}
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="New goal"
          className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <label className="flex shrink-0 items-center gap-2 pb-1.5 text-micro text-[var(--color-muted)]">
          deadline
          <input
            type="date"
            value={newDeadline}
            onChange={(e) => setNewDeadline(e.target.value)}
            className="border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-micro tabular-nums outline-none transition-colors focus:border-[var(--color-accent)]"
          />
        </label>
      </form>
        </div>
      </main>
    </div>
  );
}
