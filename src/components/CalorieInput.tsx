"use client";

import { useEffect, useState } from "react";

/**
 * One number, typed by hand, once a day.
 *
 * No food database, no barcode, no API — those measured OUTPUT (what exactly you ate,
 * how precisely you hit a target), which this app deliberately doesn't score. The only
 * thing being tracked here is that you stayed aware enough to write a number down.
 */
export default function CalorieInput({
  date,
  calories,
  onChanged,
}: {
  date: string;
  calories: number | null;
  onChanged: () => void;
}) {
  const [value, setValue] = useState(calories == null ? "" : String(calories));
  const [saved, setSaved] = useState(false);

  useEffect(() => {
    setValue(calories == null ? "" : String(calories));
  }, [calories]);

  async function save() {
    const n = value.trim() === "" ? null : Number(value.replace(/[,\s]/g, ""));
    if (n != null && !Number.isFinite(n)) return;
    await fetch("/api/calories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date, calories: n }),
    });
    setSaved(true);
    setTimeout(() => setSaved(false), 1600);
    onChanged();
  }

  return (
    // A row, not a card. One number a day never warranted a panel of its own, and the top
    // hairline is what stops a lone field floating below the sections above it — the same
    // rule that separates every other row on this screen.
    <div className="flex items-baseline gap-3 border-t border-[var(--color-line)] py-3">
      <label htmlFor="kcal" className="text-body text-[var(--color-muted)]">
        Calories
      </label>
      {/* Confirmation sits LEFT of the number. Appearing after the field would shove the
          value sideways on every save, which is a twitch you'd notice a hundred times. */}
      {saved && <span className="text-micro text-[var(--color-muted)]">saved</span>}
      {/* Written on a line, not typed into a chip: the underline is the field, and it
          darkens to the accent on focus rather than growing a box. */}
      <input
        id="kcal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        inputMode="numeric"
        placeholder="—"
        className="ml-auto w-[4.5rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-body tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)]"
      />
    </div>
  );
}
