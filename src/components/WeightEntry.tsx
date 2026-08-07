"use client";

import { useEffect, useState } from "react";

/**
 * A weight reading, for any day.
 *
 * The checklist row on Today records this morning; this records the mornings you missed, or
 * the months of readings you already have written down somewhere else. Backfilling is not an
 * edge case for a record that is meant to last years — a chart of a fortnight is a chart
 * nobody consults.
 *
 * It sits under the weight chart, which is where you are already looking when you notice a
 * gap in it. Deliberately not on Today: that screen is for the day in front of you, and a
 * date picker on it would be one more thing between waking up and typing a number.
 */

const WEIGHT_KEY = "weight";

export default function WeightEntry({
  /** Today, so the picker cannot reach into the future. */
  today,
  onSaved,
}: {
  today: string;
  onSaved: () => void;
}) {
  const [habitId, setHabitId] = useState<number | null>(null);
  const [day, setDay] = useState(today);
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState<string | null>(null);

  // The habit's id is not knowable from here — it is whatever row carries system_key
  // 'weight', which the owner can rename freely without breaking this.
  useEffect(() => {
    let alive = true;
    fetch(`/api/today?date=${today}`)
      .then((r) => r.json())
      .then((d) => {
        if (!alive || d.error) return;
        const h = (d.habits ?? []).find(
          (x: { system_key: string | null; id: number }) =>
            x.system_key === WEIGHT_KEY,
        );
        setHabitId(h?.id ?? null);
      })
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [today]);

  async function save() {
    const n = Number(value);
    if (habitId == null || !value.trim() || !Number.isFinite(n) || n <= 0)
      return;
    setBusy(true);
    await fetch("/api/habits/log", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ habit_id: habitId, date: day, value: n }),
    }).catch(() => {});
    setBusy(false);
    setValue("");
    // Names the day it landed on rather than saying "saved". The whole point of this control
    // is that the day is not today, so the day is the part worth confirming.
    setSaved(day);
    onSaved();
  }

  if (habitId == null) return null;

  return (
    <div className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-2 border-t border-[var(--color-line)] pt-3">
      <span className="text-micro text-[var(--color-muted)]">add a reading</span>

      <input
        type="date"
        value={day}
        max={today}
        onChange={(e) => e.target.value && setDay(e.target.value)}
        aria-label="Date of the reading"
        className="rounded border border-[var(--color-line)] bg-transparent px-1.5 py-0.5 font-serif text-micro outline-none transition-colors focus:border-[var(--color-accent)]"
      />

      <span className="flex items-baseline gap-1">
        <input
          type="number"
          step="0.1"
          min="0"
          inputMode="decimal"
          placeholder="—"
          value={value}
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && save()}
          aria-label="Weight"
          className="w-[3.5rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
        />
        <span className="text-micro text-[var(--color-muted)]">kg</span>
      </span>

      <button
        onClick={save}
        disabled={busy || !value.trim()}
        className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-panel)] disabled:opacity-40"
      >
        {busy ? "Saving…" : "Save"}
      </button>

      {saved && (
        <span className="text-micro text-[var(--color-muted)]">
          saved to {saved}
        </span>
      )}
    </div>
  );
}
