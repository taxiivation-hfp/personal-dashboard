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
        <h1 className="text-[28px] font-semibold tracking-tight">Goals</h1>
        <Link
          href="/"
          className="text-[14px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
        >
          ← Today
        </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-[15px] leading-relaxed text-[var(--color-muted)]">
        Subgoals split a goal evenly unless you set a weight. Leave one blank and it takes an
        equal share of whatever the others leave behind. Progress comes from what you&apos;ve
        ticked — there&apos;s nothing to set by hand.
      </p>

      <div className="mt-10 flex flex-col gap-6">
        {goals.map((g) => (
          <section key={g.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-4">
            <div className="flex items-baseline justify-between gap-3">
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
                className="min-w-0 flex-1 bg-transparent text-[16px] outline-none focus-visible:underline"
              />
              <span className="shrink-0 text-[13px] tabular-nums text-[var(--color-muted)]">
                {Math.round(g.progress * 100)}%
              </span>
              <button
                onClick={() =>
                  confirm(`Drop "${g.title}"? Its subgoals are kept.`) &&
                  call(`/api/goals/${g.id}`, { method: "DELETE" })
                }
                disabled={busy}
                className="shrink-0 text-[12px] text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
              >
                drop
              </button>
            </div>

            <ul className="mt-3 flex flex-col gap-1.5">
              {g.subgoals.map((s) => (
                <li key={s.id} className="flex items-center gap-2">
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
                    className="min-w-0 flex-1 bg-transparent text-[14px] outline-none focus-visible:underline"
                  />
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
                    className="w-[4.5rem] shrink-0 rounded-lg bg-[var(--color-panel-2)] px-2 py-1 text-right text-[12px] tabular-nums outline-none"
                  />
                  <button
                    onClick={() =>
                      confirm(`Delete "${s.title}"?`) &&
                      call(`/api/subgoals/${s.id}`, { method: "DELETE" })
                    }
                    disabled={busy}
                    aria-label={`Delete ${s.title}`}
                    className="shrink-0 px-1 text-[15px] leading-none text-[var(--color-muted)] hover:text-[var(--color-ink)] disabled:opacity-40"
                  >
                    ×
                  </button>
                </li>
              ))}
            </ul>

            {g.overAllocated && (
              <p className="mt-2 text-[12px] text-[var(--color-muted)]">
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
                className="w-full rounded-lg bg-[var(--color-panel-2)] px-3 py-2 text-[14px] outline-none"
              />
            </form>
          </section>
        ))}

        {goals.length === 0 && (
          <p className="text-[15px] text-[var(--color-muted)]">No goals yet.</p>
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
        className="mt-10 flex gap-2"
      >
        <input
          value={newGoal}
          onChange={(e) => setNewGoal(e.target.value)}
          placeholder="New goal"
          className="min-w-0 flex-1 rounded-lg bg-[var(--color-panel)] px-3 py-2.5 text-[15px] outline-none"
        />
        <select
          value={newPillar}
          onChange={(e) => setNewPillar(e.target.value)}
          aria-label="Pillar"
          className="shrink-0 rounded-lg bg-[var(--color-panel)] px-2 py-2.5 text-[14px] outline-none"
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
