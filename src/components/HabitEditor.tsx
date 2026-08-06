"use client";

import { useState } from "react";
import Link from "next/link";
import type { HabitView } from "@/lib/queries";

const DAYS = ["M", "T", "W", "T", "F", "S", "S"]; // bit0=Mon … bit6=Sun
const ALL = 127;

export default function HabitEditor({ initial }: { initial: HabitView[] }) {
  const [habits, setHabits] = useState(initial);
  const [name, setName] = useState("");

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

  return (
    <main className="mx-auto w-full max-w-[46rem] px-6 pb-24 pt-12 sm:px-8">
      <header className="flex items-baseline justify-between gap-4">
        <h1 className="text-heading font-serif font-semibold">Non-negotiables</h1>
        <Link
          href="/"
          className="text-small text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          ← Today
        </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Small, binary, and separate from your blocks. No states and no reasons here — that&apos;s the
        point of the contrast. Pick which days each one applies to.
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
                onBlur={(e) => e.target.value.trim() && e.target.value !== h.name && patch({ id: h.id, name: e.target.value })}
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
    </main>
  );
}
