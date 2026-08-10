"use client";

import { useState } from "react";
import Link from "next/link";
import type { SkillView } from "@/lib/queries";

/**
 * The skills roster — rename any of them, add new ones. The deeper screen the Portfolio
 * section links to, in the goals editor's own shape: window, cards, blur-to-save inputs.
 *
 * Renames are BY ID, so every logged minute stays attached to the skill whatever it is
 * called this month. Adding is deliberately small: a name, nothing else — a new skill is
 * born parked, and promoting it to active is its own decision on its own day, gated by
 * the pick-two cap the engine enforces.
 */
export default function SkillsEditor({ initial }: { initial: SkillView[] }) {
  const [skills, setSkills] = useState(initial);
  const [name, setName] = useState("");
  const [error, setError] = useState<string | null>(null);

  async function reload() {
    const d = await fetch("/api/skills").then((r) => r.json());
    if (!d.error) setSkills(d.skills ?? []);
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
            Rename a skill and its history follows — the minutes are attached to
            the skill, not the wording. New ones start parked; the board is where
            one gets promoted to active, and its colour is picked at{" "}
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
                  <span className="shrink-0 text-micro text-[var(--color-muted)]">
                    {s.state === "parked" ? "parked" : "active"}
                  </span>
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
