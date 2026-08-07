"use client";

import { useEffect, useRef, useState } from "react";
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

/** Everything Tab can reach. Kept as one string so the trap and any future audit agree. */
const FOCUSABLE =
  'a[href], button:not([disabled]), input:not([disabled]), [tabindex]:not([tabindex="-1"])';

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
  const paneRef = useRef<HTMLDivElement>(null);
  const closingRef = useRef(false);
  /** Kept fresh so the Escape handler, which is bound once, never calls a stale callback. */
  const onCloseRef = useRef(onClose);
  onCloseRef.current = onClose;
  /** Whatever had focus when this opened, so it can be handed back. */
  const returnTo = useRef<HTMLElement | null>(null);

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

  /**
   * Focus goes IN on open and comes BACK on close.
   *
   * aria-modal is a promise that the rest of the page is inert, and a dialog that leaves
   * focus behind it breaks that promise in the most literal way: the next Tab lands on
   * something the user has been told is not there. A native <dialog> gives this for free,
   * but the expansion needs a plain element it can transform.
   *
   * Escape closes it, because it is a window and that is what closes windows.
   */
  useEffect(() => {
    returnTo.current = document.activeElement as HTMLElement | null;
    // The close control, not the first focusable thing — on a screen of charts the useful
    // first stop is the way out.
    paneRef.current
      ?.querySelector<HTMLElement>("[data-record-close]")
      ?.focus({ preventScroll: true });

    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") {
        startClose();
        return;
      }
      if (e.key !== "Tab") return;
      // A real trap. Without it Tab walks straight out of the overlay into the page
      // underneath, which is still fully focusable because it is still rendered.
      const items = paneRef.current?.querySelectorAll<HTMLElement>(FOCUSABLE);
      if (!items || items.length === 0) return;
      const first = items[0]!;
      const last = items[items.length - 1]!;
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      // On unmount rather than on the close gesture: the record is still on screen for the
      // length of the return trip, and moving focus out from under it would scroll the page
      // behind while it is still covering it.
      returnTo.current?.focus?.({ preventScroll: true });
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /**
   * Idempotent, and guarded by a REF rather than by the state it sets.
   *
   * The first version scheduled the unmount inside the setState updater. An updater is
   * supposed to be pure — React is free to call it twice, or to discard the result — so a
   * timer started in one is a timer that may be started twice or reasoned about wrongly.
   * A ref is read and written synchronously, which is exactly what a one-way latch needs.
   */
  function startClose() {
    if (closingRef.current) return;
    closingRef.current = true;
    setClosing(true);
    setTimeout(onCloseRef.current, CLOSE_MS);
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
        ref={paneRef}
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
