"use client";

import { useState } from "react";
import Link from "next/link";
import type { SkillView } from "@/lib/queries";

/**
 * The skills roster — rename any of them, add new ones, and PROMOTE OR PARK them.
 *
 * The deeper screen the Portfolio section links to, in the goals editor's own shape:
 * window, cards, blur-to-save inputs.
 *
 * Renames are BY ID, so every logged session stays attached to the skill whatever it is
 * called this month. Adding is deliberately small: a name, nothing else — a new skill is
 * born parked, and promoting it is its own decision on its own day.
 *
 * The state switch lives HERE and not on the board. Which two skills you are levelling is a
 * decision made deliberately, once in a while; the board is where you log the session you
 * just did. Putting a control that reshuffles the roster next to the one you tap daily is
 * how a roster gets reshuffled by accident.
 *
 * ALWAYS_ON is a real state that this control does not offer. Nothing is in it, nothing
 * documents it, and only the coach's tool can set it — so adding a third chip would put a
 * concept on screen the owner has never asked for. A skill that IS in it is still rendered
 * truthfully rather than being drawn as "active", because a control that misreports the
 * state it is editing is worse than one with a gap.
 */
export default function SkillsEditor({ initial }: { initial: SkillView[] }) {
  const [skills, setSkills] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);
  /** Which row is mid-write. The switch must not be tappable twice into a race, and the
   *  pick-two refusal only arrives after a round trip. */
  const [busy, setBusy] = useState<number | null>(null);

  async function reload() {
    const d = await fetch("/api/skills").then((r) => r.json());
    if (!d.error) setSkills(d.skills ?? []);
  }

  /**
   * Promote or park.
   *
   * NOT OPTIMISTIC, deliberately. `MAX_ACTIVE_SKILLS` is 2 and the engine answers a third
   * promotion with a 409 carrying the names already active — a refusal, not a malfunction.
   * Painting the chip first would show a skill as active for a moment before it snapped
   * back, which reads as a bug rather than as the rule doing its job.
   */
  async function setState(id: number, state: "active" | "parked") {
    setBusy(id);
    setError(null);
    try {
      const r = await fetch(`/api/skills/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ state }),
      })
        .then((x) => x.json())
        .catch(() => ({ error: "could not save" }));
      // The engine writes the sentence itself — "Already levelling X and Y. Park one before
      // promoting another." — so the cap is explained by the thing that enforces it rather
      // than by a copy of the rule that could drift from it.
      if (r.error) setError(String(r.error));
      else await reload();
    } finally {
      setBusy(null);
    }
  }

  async function rename(id: number, next: string) {
    await fetch(`/api/skills/${id}`, {
      method: "PATCH",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: next }),
    }).catch(() => {});
    reload();
  }

  async function add() {
    const n = name.trim();
    if (!n) return;
    setError(null);
    const r = await fetch("/api/skills", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ name: n }),
    })
      .then((x) => x.json())
      .catch(() => ({ error: "could not save" }));
    if (r.error) {
      setError(String(r.error));
      return;
    }
    setName("");
    reload();
  }

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
        <div className="mx-auto flex w-full max-w-[64rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
          <h1 className="font-serif text-heading">Skills</h1>
          <Link
            href="/"
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </Link>
        </div>
      </header>

      {/* Gold — the pillar window's surface, whose Portfolio ring these segment. */}
      <main className="mx-auto w-full max-w-[64rem] flex-1 px-6 pb-16 pt-6 sm:px-8">
        <div className="window bg-[var(--color-surface-3)] p-5 lg:p-8">
          <p className="max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
            Rename a skill and its history follows — sessions are attached to the
            skill, not the wording. New ones start parked, and{" "}
            <strong className="font-semibold text-[var(--color-ink)]">
              two can be active at a time
            </strong>{" "}
            — park one before promoting another. Parked skills keep everything
            they have ever logged and stay on the board. Colours are picked at{" "}
            <Link
              href="/colours"
              className="text-[var(--color-ink)] underline decoration-[var(--color-line-strong)] underline-offset-4 transition-colors hover:decoration-[var(--color-accent)]"
            >
              colours
            </Link>
            .
          </p>

          <div className="mt-8 record-card">
            <ul className="divide-y divide-[var(--color-line)]">
              {skills.map((s) => (
                <li
                  key={s.id}
                  className="flex items-center gap-3 py-3"
                >
                  <input
                    defaultValue={s.name}
                    onBlur={(e) => {
                      const v = e.target.value.trim();
                      if (v && v !== s.name) rename(s.id, v);
                    }}
                    onKeyDown={(e) =>
                      e.key === "Enter" && (e.target as HTMLInputElement).blur()
                    }
                    aria-label={`Rename ${s.name}`}
                    className={`min-w-0 flex-1 border-b border-transparent bg-transparent pb-0.5 font-serif text-body outline-none transition-colors focus:border-[var(--color-accent)] ${
                      s.state === "parked" ? "text-[var(--color-muted)]" : ""
                    }`}
                  />
                  {/* Two chips, not a toggle: a switch says on/off, and neither of these
                      is an off. Parked is a skill you are not levelling right now, which
                      is a choice rather than an absence — the same reason drift is never
                      drawn as a failure anywhere else in this app.

                      The active chip wears the accent as a TINT BEHIND INK
                      (--color-accent-soft), never as text colour: the accent measures
                      4.02:1 as type on this page, which is a real fail. */}
                  <span
                    role="group"
                    aria-label={`${s.name} state`}
                    className="flex shrink-0 items-center gap-1"
                  >
                    {(["active", "parked"] as const).map((st) => {
                      const on = s.state === st;
                      return (
                        <button
                          key={st}
                          type="button"
                          onClick={() => !on && setState(s.id, st)}
                          disabled={busy === s.id}
                          aria-pressed={on}
                          className={`rounded-full px-2.5 py-1 text-micro transition-colors disabled:opacity-40 ${
                            on
                              ? "bg-[var(--color-accent-soft)] text-[var(--color-ink)]"
                              : "text-[var(--color-muted)] hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
                          }`}
                        >
                          {st}
                        </button>
                      );
                    })}
                  </span>
                  {/* Only the coach can produce this state. Said plainly rather than drawn
                      as "active", which is what the old static label did. */}
                  {s.state === "always_on" && (
                    <span className="shrink-0 text-micro text-[var(--color-muted)]">
                      always on
                    </span>
                  )}
                </li>
              ))}
              {skills.length === 0 && (
                <li className="py-3 text-small text-[var(--color-muted)]">
                  No skills yet — name the first one below.
                </li>
              )}
            </ul>

            <div className="mt-5 flex items-end gap-4 border-t border-[var(--color-line)] pt-4">
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && add()}
                placeholder="Add a skill…"
                className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1.5 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-accent)]"
              />
              <button
                onClick={add}
                disabled={!name.trim()}
                className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Add
              </button>
            </div>

            {/* Weight, not red — same error treatment as everywhere else. */}
            {error && (
              <p role="alert" className="mt-3 text-small font-semibold">
                {error}
              </p>
            )}
          </div>
        </div>
      </main>
    </div>
  );
}
