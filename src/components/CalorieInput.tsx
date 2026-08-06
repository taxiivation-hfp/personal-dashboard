"use client";

import { useState } from "react";
import type { CalorieEntry } from "@/lib/queries";

/**
 * Calories, added through the day.
 *
 * No food database, no barcode, no API — those measured OUTPUT (what exactly you ate, how
 * precisely you hit a target), which this app deliberately doesn't score. The only thing
 * tracked here is that you stayed aware enough to write a number down.
 *
 * ADDITIVE. 400 in the morning and 800 later reads 1200. The field is an increment, not
 * the day's value, so it clears after each entry rather than holding the total — a field
 * that shows 1200 and then adds 1200 when you tab away is the obvious way to get this
 * wrong.
 */
export default function CalorieInput({
  date,
  calories,
  entries,
  onChanged,
}: {
  date: string;
  calories: number | null;
  entries: CalorieEntry[];
  onChanged: () => void;
}) {
  const [value, setValue] = useState("");
  const [busy, setBusy] = useState(false);

  async function add() {
    const n = Number(value.replace(/[,\s]/g, ""));
    if (!value.trim() || !Number.isFinite(n) || n < 1) return;
    setBusy(true);
    await fetch("/api/calories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, kcal: n }),
    }).catch(() => {});
    setValue("");
    setBusy(false);
    onChanged();
  }

  /**
   * Undo is not a nicety here. In an additive field a mistyped 20000 is otherwise
   * unrecoverable, and a field you are afraid to touch is a field you stop using — which
   * is exactly the honest-logging failure the whole app is built to avoid.
   */
  async function undo() {
    const last = entries[entries.length - 1];
    if (!last) return;
    setBusy(true);
    await fetch(`/api/calories?id=${last.id}&date=${date}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    onChanged();
  }

  return (
    // A row, not a card. The top hairline is what stops a lone field floating below the
    // sections above it — the same rule that separates every other row on this screen.
    <div className="flex items-baseline gap-3 border-t border-[var(--color-line)] py-3">
      <label htmlFor="kcal" className="text-body text-[var(--color-muted)]">
        Calories
      </label>

      {/* The total is the value now, so it takes ink — the field beside it is only an
          increment. Tabular so it doesn't jitter as it climbs through the day. */}
      <span className="ml-auto text-body tabular-nums">
        {calories == null ? <span className="text-[var(--color-muted)]">—</span> : calories}
      </span>

      {entries.length > 0 && (
        <button
          onClick={undo}
          disabled={busy}
          className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
        >
          undo
        </button>
      )}

      {/* Written on a line, not typed into a chip: the underline is the field, and it
          darkens to the accent on focus rather than growing a box. */}
      <input
        id="kcal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={add}
        onKeyDown={(e) => e.key === "Enter" && add()}
        disabled={busy}
        inputMode="numeric"
        placeholder="+"
        aria-label="Add calories"
        className="w-[3.5rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-body tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
      />
    </div>
  );
}
