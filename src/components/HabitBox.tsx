"use client";

/**
 * The checklist's state box. ONE component for every row that has one.
 *
 * It used to be duplicated: the tick row drew a box with a tick inside it and the numeric
 * row drew a box with nothing in it, so logging a weight filled the square but never marked
 * it — the shapes had drifted, which is the whole argument for there being one of them. A
 * non-negotiable that is done looks done, whatever kind of thing it is.
 *
 * The hue is the row's PILLAR, so the checklist reads as categorised rather than as one
 * undifferentiated list. Nothing rides on colour alone: the tick and the muted label carry
 * done-ness too.
 */
export default function HabitBox({
  done,
  tone,
  /** A floor that has not been reached yet — drawn dashed, like a ghost ring. Used by the
   *  calorie row, where "not yet" is a real and common state rather than a failure. */
  pending = false,
}: {
  done: boolean;
  tone: string;
  pending?: boolean;
}) {
  return (
    <span
      aria-hidden
      className="flex h-[18px] w-[18px] shrink-0 items-center justify-center rounded-[5px] border transition-colors"
      style={{
        borderColor: done ? tone : "var(--color-line-strong)",
        borderStyle: !done && pending ? "dashed" : "solid",
        background: done ? tone : "transparent",
      }}
    >
      {done && (
        <svg width="11" height="11" viewBox="0 0 12 12" fill="none">
          <path
            d="M2.5 6.5l2.2 2.2L9.5 3.8"
            stroke="#fff"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
          />
        </svg>
      )}
    </span>
  );
}
