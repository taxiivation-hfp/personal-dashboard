"use client";

/**
 * A COUNTED goal's tally — the control that stands where a subtask list stands on every
 * other goal. The owner's ruling, 2026-09-20: a goal made of 150 interchangeable items
 * (NeetCode problems, LeetCode SQL 50) is a count, not a checklist, and 150 subgoal rows
 * would be a page nobody could read to say the thing one number says.
 *
 * ONE COMPONENT, TWO CALLERS — /goals and the Career drill-down — for the reason every
 * shared rule in this app has a single home: two steppers would eventually disagree about
 * what "+" does at 150 of 150, with no error and no failing test.
 *
 * THE VALUE IS SENT ABSOLUTELY, never as a delta (engine.setGoalCount). A double-fired
 * pointer or a retried request must not advance the tally twice — the same reasoning
 * day_tasks runs under, where reading a task twice cannot move it twice.
 *
 * The figure is `.stat-hero` because it IS a figure rather than a row value, and the fill
 * is the accent because this is progress against a goal's own pace, which is what the
 * amber ring measures. No streak on it, no per-week chart, no total across goals: the
 * count fills one arc and reaches nothing else.
 */
export default function GoalCount({
  done,
  target,
  busy,
  onSet,
  label,
}: {
  done: number;
  target: number;
  busy?: boolean;
  onSet: (n: number) => void;
  /** The goal's title, for the buttons' accessible names — a stepper beside a list of
   *  goals has to say which goal it steps. */
  label: string;
}) {
  const atFloor = done <= 0;
  const atCap = done >= target;

  return (
    <div className="mt-3 flex items-center gap-3">
      <button
        type="button"
        onClick={() => onSet(done - 1)}
        disabled={busy || atFloor}
        aria-label={`One fewer for ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-body leading-none text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:opacity-35 disabled:hover:border-[var(--color-line-strong)] disabled:hover:text-[var(--color-muted)]"
      >
        −
      </button>

      {/* Typed as well as stepped: catching up on a week of problems is one edit, not
          twelve taps. Uncontrolled and KEYED BY THE VALUE, so a refresh that lands while
          the field is focused cannot pull the number out from under a cursor — the same
          rule the numeric non-negotiable field runs under on Today. */}
      {/* NOT flex-1: a stepper is a compact unit, and letting the figure absorb the card's
          width put the + seven hundred pixels from the − on the goals page — two controls
          that are one control, drawn as if they were unrelated. */}
      <label className="flex items-baseline gap-1.5">
        <input
          key={`${done}-${target}`}
          type="number"
          min={0}
          max={target}
          defaultValue={done}
          disabled={busy}
          aria-label={`How many done for ${label}, of ${target}`}
          onBlur={(e) => {
            const n = Number(e.target.value);
            if (Number.isFinite(n) && Math.round(n) !== done) onSet(Math.round(n));
          }}
          className="stat-hero w-[3.5ch] border-b border-transparent bg-transparent pb-0.5 text-right text-heading outline-none transition-colors focus:border-[var(--color-accent)]"
        />
        <span className="shrink-0 text-small text-[var(--color-muted)]">
          of {target}
        </span>
      </label>

      <button
        type="button"
        onClick={() => onSet(done + 1)}
        disabled={busy || atCap}
        aria-label={`One more for ${label}`}
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full border border-[var(--color-line-strong)] text-body leading-none text-[var(--color-muted)] transition-colors hover:border-[var(--color-accent)] hover:text-[var(--color-ink)] disabled:opacity-35 disabled:hover:border-[var(--color-line-strong)] disabled:hover:text-[var(--color-muted)]"
      >
        +
      </button>
    </div>
  );
}
