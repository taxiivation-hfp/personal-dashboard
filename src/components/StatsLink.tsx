"use client";

/**
 * The way through to /stats, sitting under the adherence tracker.
 *
 * IT PREVIEWS NOTHING NOW. It used to draw a fourteen-bar adherence sparkline, on the
 * argument that showing the fortnight it leads to earned the height a plain link would have
 * cost. The Recent window answered that argument itself: the tracker card above this is a
 * real adherence chart with a real average on it, so the sparkline had become a second,
 * smaller, mute drawing of the same series two inches below the first — and the one that
 * could be misread, because it had no axis and no figure.
 *
 * So this is a line of type and an arrow. It also stopped fetching, which is the part worth
 * knowing: a link that opens a network request on every day you step to was paying for a
 * picture nobody needed.
 */

export default function StatsLink({
  onOpen,
}: {
  /** Opens the record in place. A BUTTON rather than a link, because nothing navigates:
   *  the record is this column read at length, and losing the page you were on to see more
   *  of a part of it is the wrong gesture. */
  onOpen: () => void;
}) {
  return (
    <button
      onClick={onOpen}
      aria-haspopup="dialog"
      className="group -mx-2 flex w-[calc(100%+1rem)] shrink-0 items-center gap-3 rounded-lg px-2 py-3 text-left transition-colors hover:bg-[var(--color-panel)]"
    >
      {/* One line, not two. The second line was restating what the destination is called. */}
      <span className="min-w-0 flex-1 truncate text-small font-semibold">
        The record
      </span>

      {/* Travels on hover, and only on hover — a pointer is the one input that can say
          "considering this" without committing. Nothing here moves on a phone. */}
      <span
        aria-hidden
        className="motion-slide shrink-0 text-micro text-[var(--color-muted)] group-hover:translate-x-0.5"
      >
        →
      </span>
    </button>
  );
}
