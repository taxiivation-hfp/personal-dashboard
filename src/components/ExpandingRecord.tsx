"use client";

import { useEffect, useState } from "react";
import Dashboard from "./Dashboard";

/**
 * The Pillars window, opening out into the whole screen.
 *
 * Not a navigation. The record is the same fortnight the pillar column already shows, read
 * at length — so it should feel like the column being opened rather than like somewhere you
 * were taken. Losing the page you were on to see more of a part of it is the wrong gesture.
 *
 * HOW IT MOVES, and why it is transform-only anyway. The overlay is mounted at FULL SIZE and
 * given a starting transform that maps it DOWN onto the source column's rectangle. Animating
 * the box itself — top/left/width/height — would be four layout properties on every frame;
 * this is one composited matrix, and it arrives at exactly the right size by construction
 * because the size never changed.
 *
 * THE START STATE IS DECLARED IN CSS, NOT SET FROM JAVASCRIPT. The first version mounted
 * collapsed and released on a double requestAnimationFrame — which never fires in a hidden
 * tab, so the record opened as a frozen thumbnail with its contents invisible. @starting-style
 * is the declarative form: the browser owns the from-state, the resting state is the OPEN
 * one, and if the transition never runs the element is simply already open. That is the same
 * rule the sparkline learned — a reveal must enhance an already-visible default.
 *
 * The scale is non-uniform on purpose: a column is tall and narrow and the screen is not, so
 * the two axes differ and the content is briefly stretched. That IS what a window opening
 * looks like. The content cross-fades in behind the move, so the stretched frames are the
 * ones you cannot read anyway.
 */

/** Matches --dur-expand. Only used to time the unmount on the way back. */
const CLOSE_MS = 260;

/** When the source cannot be measured, open from slightly small rather than from nowhere. */
const FALLBACK = "scale(0.96)";

export default function ExpandingRecord({
  date,
  from,
  onClose,
}: {
  date: string;
  /** The element the record grows out of. Measured once, before the first paint. */
  from: HTMLElement | null;
  onClose: () => void;
}) {
  const [closing, setClosing] = useState(false);

  /**
   * The transform that maps the full-screen overlay onto the source column, computed during
   * render so it is present in the very first committed style. A useEffect would set it one
   * frame late, and one frame late is a visible flash of the full-size overlay.
   */
  const origin = (() => {
    if (!from || typeof window === "undefined") return FALLBACK;
    const r = from.getBoundingClientRect();
    // documentElement.clientWidth, not innerWidth: a minimised or off-screen window reports
    // innerWidth 0, and 0 as a divisor yields scale(Infinity) — an invalid transform the
    // browser silently drops, which turns the whole expansion off with no error anywhere.
    const vw = document.documentElement.clientWidth || window.innerWidth;
    const vh = document.documentElement.clientHeight || window.innerHeight;
    // A source with no box is a source that was never laid out. Falling back to a plain
    // scale is honest: it still reads as opening, it just does not appear to come from
    // anywhere in particular.
    if (!vw || !vh || !r.width || !r.height) return FALLBACK;
    const sx = Math.min(1, Math.max(r.width / vw, 0.02));
    const sy = Math.min(1, Math.max(r.height / vh, 0.02));
    return `translate(${r.left}px, ${r.top}px) scale(${sx}, ${sy})`;
  })();

  /** Escape closes it, because it is a window and that is what closes windows. */
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") startClose();
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  function startClose() {
    setClosing((was) => {
      if (!was) setTimeout(onClose, CLOSE_MS);
      return true;
    });
  }

  return (
    <div
      // Above everything, including the phone tab bar — a window filling the screen is not
      // something the furniture underneath should show through.
      className="fixed inset-0 z-[var(--z-modal)]"
      role="dialog"
      aria-modal="true"
      aria-label="The record"
      style={{ ["--record-from" as string]: origin }}
    >
      <div
        className={`record-pane ${closing ? "is-closing" : ""}`}
        // Overflow hidden so the rounded corner is real while it travels.
        style={{ overflow: "hidden" }}
      >
        <div className="record-body h-full">
          <Dashboard date={date} onClose={startClose} />
        </div>
      </div>
    </div>
  );
}
