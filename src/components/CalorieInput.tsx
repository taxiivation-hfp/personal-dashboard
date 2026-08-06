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
    <div className="flex items-center gap-3">
      <label htmlFor="kcal" className="text-body text-[var(--color-muted)]">
        Calories
      </label>
      <input
        id="kcal"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onBlur={save}
        onKeyDown={(e) => e.key === "Enter" && save()}
        inputMode="numeric"
        placeholder="—"
        className="w-28 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3 py-2 text-body tabular-nums outline-none placeholder:text-[var(--color-muted)] focus:border-[var(--color-line-strong)]"
      />
      {saved && <span className="text-small text-[var(--color-muted)]">saved</span>}
    </div>
  );
}
