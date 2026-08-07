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

/** What the BAR shows, which is the three panes plus the way out to /stats. */
export type TabBarKey = PhoneTab | "stats";
const BAR: TabBarKey[] = ["calendar", "today", "pillars", "stats"];
const LABEL: Record<TabBarKey, string> = {
  calendar: "Calendar",
  today: "Today",
  pillars: "Pillars",
  stats: "Stats",
};

/** Below this, a horizontal drag is a swipe rather than a scroll. */
const SWIPE_PX = 56;
/** And only if it is clearly more horizontal than vertical, or every scroll flips a tab. */
const SWIPE_RATIO = 1.6;

export function PhoneTabBar({
  tab,
  onTab,
}: {
  /** "stats" when the bar is rendered on /stats, where none of the panes is showing. */
  tab: TabBarKey;
  /** Only ever called for the three panes. Omitted on /stats, where each pane label is a
   *  link home rather than a switch. */
  onTab?: (t: PhoneTab) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-[var(--z-sticky)] border-t border-[var(--color-line)] lg:hidden"
      style={{
        // Translucent so the page reads as continuing underneath rather than being cut
        // off by an opaque bar.
        // Frosted, on the same terms as the dialog backdrop — see globals.css. The
        // reduced-transparency fallback lives in CSS rather than here, so it can be a
        // media query rather than a subscription.
        background: "color-mix(in srgb, var(--color-bg) 86%, transparent)",
        backdropFilter: "blur(10px)",
        WebkitBackdropFilter: "blur(10px)",
        // The iPhone home indicator sits in this space; without it the labels are under
        // the user's thumb rail.
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="relative mx-auto flex max-w-[30rem]">
        {BAR.map((t) => {
          const on = t === tab;
          // Ink vs muted marks the active tab, never a weight change: bolding the label
          // would re-measure the text and nudge the others sideways on every tap. The
          // padding is what makes the row a thumb-sized target at 12px.
          const cls =
            "block flex-1 px-2 pb-4 pt-3 text-center text-micro transition-colors";
          const style = {
            color: on ? "var(--color-ink)" : "var(--color-muted)",
          };
          // A pane switch is state; anything crossing a route boundary is a link. Rendering
          // both as <button> would have cost the back button, the long-press menu and the
          // prefetch — three things the platform gives away free.
          return t === "stats" || !onTab ? (
            <Link
              key={t}
              href={t === "stats" ? "/stats" : "/"}
              aria-current={on ? "page" : undefined}
              className={cls}
              style={style}
            >
              {LABEL[t]}
            </Link>
          ) : (
            <button
              key={t}
              onClick={() => onTab(t as PhoneTab)}
              aria-current={on ? "page" : undefined}
              className={cls}
              style={style}
            >
              {LABEL[t]}
            </button>
          );
        })}
        {/* One indicator that SLIDES between tabs rather than three that blink. The
            movement is the thing that says "you moved sideways", which is exactly what
            the swipe did.
            This used to animate `left`, a layout property, which forces a style+layout
            pass on every frame of the one gesture that has to feel instant. The outer
            span is one tab wide and carries the transform; translateX by whole multiples
            of its own width lands it exactly on each tab with no arithmetic. The inner
            span is the 24px rule, centred by flex. */}
        <span
          aria-hidden
          className="motion-slide pointer-events-none absolute bottom-2.5 left-0 flex justify-center"
          style={{
            width: `${100 / BAR.length}%`,
            transform: `translateX(${Math.max(0, BAR.indexOf(tab)) * 100}%)`,
          }}
        >
          <span
            className="h-[2px] w-6 rounded-full"
            style={{ background: "var(--color-accent)" }}
          />
        </span>
      </div>
    </nav>
  );
}

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
