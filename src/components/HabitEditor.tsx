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
          className="text-small text-[var(--color-muted)] underline-offset-4 hover:text-[var(--color-ink)] hover:underline"
        >
          ← Today
        </Link>
      </header>

      <p className="mt-3 max-w-[60ch] text-body leading-relaxed text-[var(--color-muted)]">
        Small, binary, and separate from your blocks. No states and no reasons here — that&apos;s the
        point of the contrast. Pick which days each one applies to.
      </p>

      <ul className="mt-8 flex flex-col gap-2">
        {habits.map((h) => (
          <li key={h.id} className="rounded-2xl bg-[var(--color-panel)] px-4 py-3.5">
            <div className="flex items-center justify-between gap-3">
              <input
                defaultValue={h.name}
                onBlur={(e) => e.target.value.trim() && e.target.value !== h.name && patch({ id: h.id, name: e.target.value })}
                className="min-w-0 flex-1 bg-transparent font-serif text-body outline-none"
                aria-label={`Rename ${h.name}`}
              />
              <button
                onClick={() => patch({ id: h.id, remove: true })}
                className="shrink-0 text-small text-[var(--color-muted)] underline-offset-4 hover:underline"
              >
                remove
              </button>
            </div>
            <div className="mt-2.5 flex gap-1">
              {DAYS.map((d, i) => {
                const on = Boolean(h.days_mask & (1 << i));
                return (
                  <button
                    key={i}
                    onClick={() => toggleDay(h, i)}
                    aria-label={`${d} ${on ? "on" : "off"}`}
                    aria-pressed={on}
                    className="h-7 w-7 rounded-lg text-micro transition-colors"
                    style={{
                      background: on ? "var(--color-accent)" : "transparent",
                      color: on ? "#fff" : "var(--color-muted)",
                      border: on ? "1px solid var(--color-accent)" : "1px solid var(--color-line-strong)",
                    }}
                  >
                    {d}
                  </button>
                );
              })}
            </div>
          </li>
        ))}
      </ul>

      <div className="mt-6 flex items-center gap-2">
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && add()}
          placeholder="Add a non-negotiable…"
          className="min-w-0 flex-1 rounded-xl border border-[var(--color-line-strong)] bg-[var(--color-panel)] px-3.5 py-2.5 font-serif text-body outline-none placeholder:text-[var(--color-muted)]"
        />
        <button
          onClick={add}
          disabled={!name.trim()}
          className="shrink-0 rounded-xl bg-[var(--color-accent)] px-4 py-2.5 text-body text-white disabled:opacity-40"
        >
          Add
        </button>
      </div>
    </main>
  );
}
