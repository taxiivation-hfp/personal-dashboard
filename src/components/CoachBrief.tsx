"use client";

/**
 * The morning brief slot.
 *
 * Phase 4 (Telegram + cron) is what fills this automatically each morning. Until
 * then it holds the shape of the feature and offers the manual door into it —
 * the coach can already plan a day on demand, it just isn't scheduled yet.
 */
export default function CoachBrief({ onPlanDay }: { onPlanDay: () => void }) {
  return (
    <section className="rounded-2xl border border-[var(--color-line)] p-4">
      <div className="flex items-center gap-2">
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-[var(--color-accent)]" />
        <h2 className="text-sm font-semibold tracking-wide">Morning brief</h2>
      </div>

      <p className="mt-2 max-w-[68ch] text-sm leading-relaxed text-[var(--color-muted)]">
        This is where the day gets proposed: the two or three actions that actually move a goal,
        time-blocked around what&apos;s already on your calendar. Subtraction is the skill — not a
        fifteen-item list.
      </p>

      <div className="mt-3.5 flex flex-wrap items-center gap-x-3 gap-y-2">
        <button
          onClick={onPlanDay}
          className="rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90 active:opacity-75"
        >
          Plan my day
        </button>
        <span className="text-xs text-[var(--color-muted)]">Scheduled briefs aren&apos;t wired up yet.</span>
      </div>
    </section>
  );
}
