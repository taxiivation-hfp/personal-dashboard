"use client";

import Link from "next/link";
import { useRef, useState, type ReactNode } from "react";

/**
 * The three columns become three tabs below `lg`.
 *
 * Opens on TODAY — the day's work is the hero and must be what you land on. Tab state is
 * component state rather than a route, so a reload returns you there rather than wherever
 * you happened to wander.
 *
 * Desktop is untouched: this component renders nothing above `lg`, where the three-column
 * grid is already the right answer.
 */

export type PhoneTab = "calendar" | "today" | "pillars";

/**
 * The three PANES, which is what the swipe moves between.
 *
 * Stats is deliberately not in here. It is a route, not a pane — a swipe that navigated the
 * browser would be a gesture you cannot undo with the same gesture, which is a different and
 * worse contract than the one the other three have.
 */
const ORDER: PhoneTab[] = ["calendar", "today", "pillars"];

/** Below this, a horizontal drag is a swipe rather than a scroll. */
const SWIPE_PX = 56;
/** And only if it is clearly more horizontal than vertical, or every scroll flips a tab. */
const SWIPE_RATIO = 1.6;

/**
 * Wraps the three panes and handles the swipe. Only the ACTIVE pane is mounted below
 * `lg`, so the phone never pays to render the other two.
 */
export function PhoneSwipe({
  tab,
  onTab,
  children,
}: {
  tab: PhoneTab;
  onTab: (t: PhoneTab) => void;
  children: ReactNode;
}) {
  const start = useRef<{ x: number; y: number } | null>(null);
  const [dragging, setDragging] = useState(false);

  function down(e: React.PointerEvent) {
    // Never steal a gesture from the journal canvas, an input, or an open dialog.
    if (document.querySelector("dialog[open]")) return;
    const el = e.target as HTMLElement;
    if (el.closest("canvas, textarea, input, select, [data-no-swipe]")) return;
    start.current = { x: e.clientX, y: e.clientY };
    setDragging(true);
  }

  function up(e: React.PointerEvent) {
    const s = start.current;
    start.current = null;
    setDragging(false);
    if (!s) return;
    const dx = e.clientX - s.x;
    const dy = e.clientY - s.y;
    // Horizontal INTENT, not just horizontal distance — otherwise a diagonal scroll
    // flips the tab out from under you.
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO)
      return;
    const i = ORDER.indexOf(tab);
    const next = dx < 0 ? i + 1 : i - 1;
    if (next >= 0 && next < ORDER.length) onTab(ORDER[next]);
  }

  return (
    <div
      onPointerDown={down}
      onPointerUp={up}
      onPointerCancel={() => {
        start.current = null;
        setDragging(false);
      }}
      className="lg:contents"
      style={{ touchAction: dragging ? "pan-y" : undefined }}
    >
      {children}
    </div>
  );
}
