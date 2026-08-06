"use client";

import { useState } from "react";
import Link from "next/link";
import type { GoalView, PillarView } from "@/lib/queries";

/**
 * The one deeper screen for goals, alongside /habits.
 *
 * Weights: blank means AUTO — the subgoal takes an equal share of whatever the explicit
 * ones leave behind. That is the default, so most goals never need a number typed at all.
 *
 * Progress is NOT editable here and has no field. It is derived from which subgoals are
 * ticked, and letting it be set by hand is what let the stored column drift out of step
 * with the subgoals that define it.
 */
export default function GoalEditor({
  initial,
  pillars,
}: {
  initial: GoalView[];
  pillars: PillarView[];
}) {
  const [goals, setGoals] = useState<GoalView[]>(initial);
  const [busy, setBusy] = useState(false);
  const [newGoal, setNewGoal] = useState("");
  const [newPillar, setNewPillar] = useState<string>(pillars[0]?.key ?? "");
  const [newSub, setNewSub] = useState<Record<number, string>>({});

  // Every mutating route returns the refreshed list, so one round trip does both jobs.
  async function call(url: string, init: RequestInit) {
    setBusy(true);
    try {
      const r = await fetch(url, { headers: { "content-type": "application/json" }, ...init })
        .then((x) => x.json())
        .catch(() => ({ error: true }));
      if (!r.error && r.goals) setGoals(r.goals);
    } finally {
      setBusy(false);
    }
  }

  return (
    <main className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-12 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-heading font-serif font-semibold">Goals</h1>
        <Link
          href="/"
          className="text-small text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          ← Today
        </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Subgoals split a goal evenly unless you set a weight. Leave one blank and it takes an
        equal share of whatever the others leave behind. Progress comes from what you&apos;ve
        ticked — there&apos;s nothing to set by hand.
      </p>

      {/* Ruled rows, not cards. Every goal used to be its own rounded panel, which made the
          list look like a board of tiles waiting to be filled — exactly the reading this app
          refuses. A hairline is enough to say where one goal ends. */}
      <div className="mt-10 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
        {goals.map((g) => (
          // The percentage hangs in the page margin, where it sits on Today too, so one goal
          // reads as one object across both screens instead of two different layouts.
          <section key={g.id} className="page-margin py-5">
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
                  className="min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)]"
                />
                <button
                  onClick={() =>
                    confirm(`Drop "${g.title}"? Its subgoals are kept.`) &&
                    call(`/api/goals/${g.id}`, { method: "DELETE" })
                  }
                  disabled={busy}
                  className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
                >
                  drop
                </button>
              </div>

              {/* The same bar as Today, drawn the same way, so ticking a subgoal here and
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
                      aria-label="Subgoal title"
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
                      defaultValue={s.weight > 0 ? Math.round(s.weight * 100) : ""}
                      onBlur={(e) =>
                        call(`/api/subgoals/${s.id}`, {
                          method: "PATCH",
                          body: JSON.stringify({
                            weight: e.target.value === "" ? 0 : Number(e.target.value) / 100,
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
                  Set weights total more than 100%, so the auto ones have nothing left.
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
                  onChange={(e) => setNewSub({ ...newSub, [g.id]: e.target.value })}
                  placeholder="Add a subgoal"
                  className="w-full border-b border-[var(--color-line-strong)] bg-transparent pb-1 font-serif text-small outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
                />
              </form>
            </div>
          </section>
        ))}

        {goals.length === 0 && (
          <p className="py-5 text-body text-[var(--color-muted)]">No goals yet.</p>
        )}
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault();
          const t = newGoal.trim();
          if (!t) return;
          setNewGoal("");
          // Sent as the pillar KEY, never a positional id — the seeded ids happen to be
          // 1/2/3 today and relying on that breaks the moment a pillar is added.
          call("/api/goals", {
            method: "POST",
            body: JSON.stringify({ title: t, pillar: newPillar }),
          });
        }}
        className="mt-10 flex items-end gap-4"
      >
        {/* Serif, because what gets typed here is a goal title — the same words that render
            serif everywhere else the moment it is saved. The pillar beside it is the app's
            own vocabulary, so it stays sans. */}
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="New goal"
          className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <select
          value={newPillar}
          onChange={(e) => setNewPillar(e.target.value)}
          aria-label="Pillar"
          className="shrink-0 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 text-small outline-none transition-colors focus:border-[var(--color-accent)]"
        >
          {pillars.map((p) => (
            <option key={p.key} value={p.key}>
              {p.name.split(" ")[0]}
            </option>
          ))}
        </select>
      </form>
    </main>
  );
}
