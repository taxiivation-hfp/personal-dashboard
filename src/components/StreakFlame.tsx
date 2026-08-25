"use client";

import { streakHue } from "@/lib/streaks";

/**
 * A row's streak, worn as a FLAME — the owner's ruling, 2026-08-24, revising the earlier
 * plain-count treatment. One 🔥 beside the count, its colour walking a CONTINUOUS hue from
 * light yellow at day 1 to purple at day 30 (streakHue in streaks.ts — the one home of
 * that walk), with the pill itself tinted and glowing in the same hue. The glow is a
 * sanctioned exception to the no-shadows rule — see .streak-flame in globals.css.
 *
 * What did NOT change: a streak of 0 draws NOTHING. A row that greets an off week with
 * "0" is a row that scolds, and a list that scolds is a list you stop ticking honestly.
 * Still no "don't break it" copy anywhere.
 *
 * ONE component for every streak on the screen — the habit rows, calories, steps, the
 * app-wide run on the week strip — so no two rows can disagree about what day 17 looks
 * like. Callers keep their own `back === 0` gate; streaks stay hidden off today.
 */
export default function StreakFlame({ count }: { count: number }) {
  if (count <= 0) return null;
  const hue = streakHue(count);
  return (
    <span
      className="streak-flame shrink-0 text-micro tabular-nums"
      style={{ "--streak-h": hue } as React.CSSProperties}
      title={`${count} day${count === 1 ? "" : "s"} in a row`}
      aria-label={`${count} day${count === 1 ? "" : "s"} in a row`}
    >
      <span aria-hidden className="streak-flame-mark">
        🔥
      </span>
      {count}d
    </span>
  );
}
