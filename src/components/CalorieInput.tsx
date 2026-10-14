"use client";

import { useState } from "react";
import HabitBox from "./HabitBox";
import CalorieLog from "./CalorieLog";
import StreakFlame from "./StreakFlame";
import { CALORIE_FLOOR } from "@/lib/rings";
import type { CalorieEntry } from "@/lib/queries";

/**
 * Calories, as one row of the checklist: the box, the word, and the total against its
 * floor. The total IS a button — it opens the food log, which is where the writing
 * happens now.
 *
 * The inline increment field is gone, and the collision went with it. This row used to
 * hold the label, the running total, the floor AND an input on one 170px line, and the
 * total was pressed up against "/2500" with the field jammed after both. One control
 * remains: the number you read is the thing you tap to change it.
 *
 * Still no food database, no barcode, no API. The log takes a NAME now, but the name is
 * plain text for the owner's own memory — nothing reads it, nothing scores it.
 */
export default function CalorieInput({
  date,
  today,
  calories,
  entries,
  streak = 0,
  tone,
  onChanged,
}: {
  date: string;
  /** The real today, so the log's date picker is capped by the calendar rather than by
   *  whichever day the checklist happens to be showing. */
  today?: string;
  calories: number | null;
  entries: CalorieEntry[];
  /** Consecutive days the LOG reached 2,000 — logging the day, deliberately not the
   *  2,500 eating floor (see streaks.ts). 0 draws nothing: a zero here would scold. */
  streak?: number;
  /**
   * The HEALTH tone, already resolved by the caller through `toneColor`.
   *
   * Passed in rather than resolved here because every other row on the checklist gets
   * its tick colour the same way — one resolver, so no box can disagree with the rings.
   */
  tone: string;
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const met = (calories ?? 0) >= CALORIE_FLOOR;

  return (
    <div className="flex items-center gap-2.5 py-2.5">
      {/* A FLOOR, not a ceiling — the direction is the whole point for someone training,
          where under-eating is the failure and there is no upper bound worth drawing. The
          box is dashed until it is met, which is this app's existing word for "not yet"
          rather than "failed"; most of the day is legitimately spent below the line. */}
      <HabitBox done={met} pending tone={tone} />
      <span
        className={`min-w-0 flex-1 font-serif text-small leading-snug ${met ? "text-[var(--color-muted)]" : ""}`}
      >
        Calories
      </span>

      {/* The LOG streak STACKS above the pill, the Steps row's arrangement — inline
          beside the label it squeezed the min-w-0 word below its own width, and a single
          word cannot wrap, so "Calories" overflowed its span with the flame painted over
          the glyphs. One shared flame, so this row cannot drift from the list it sits in.
          Nothing at zero. */}
      <span className="flex shrink-0 flex-col items-end gap-1">
        <StreakFlame count={streak} />

        {/* The total against its floor, as the way in. A bordered pill rather than bare
            type, so it reads as a control — the bare number here looked like a reading
            and hid the fact that anything could be done about it. Tabular so it doesn't
            jitter as the day climbs. */}
        <button
          onClick={() => setOpen(true)}
          aria-haspopup="dialog"
          aria-label="Open the food log"
          className="rounded-full border border-[var(--color-line-strong)] px-2.5 py-1 text-small tabular-nums transition-colors hover:bg-[var(--color-panel)]"
        >
          {calories == null ? (
            <span className="text-[var(--color-muted)]">—</span>
          ) : (
            calories
          )}
          <span className="text-micro text-[var(--color-muted)]">
            /{CALORIE_FLOOR}
          </span>
        </button>
      </span>

      {/* Mounted only while open, so its history fetch never runs behind a closed row. */}
      {open && (
        <CalorieLog
          date={date}
          today={today}
          total={calories}
          entries={entries}
          onChanged={onChanged}
          onClose={() => setOpen(false)}
        />
      )}
    </div>
  );
}
