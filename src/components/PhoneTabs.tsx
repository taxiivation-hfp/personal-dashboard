"use client";

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

const ORDER: PhoneTab[] = ["calendar", "today", "pillars"];
const LABEL: Record<PhoneTab, string> = {
  calendar: "Calendar",
  today: "Today",
  pillars: "Pillars",
};

/** Below this, a horizontal drag is a swipe rather than a scroll. */
const SWIPE_PX = 56;
/** And only if it is clearly more horizontal than vertical, or every scroll flips a tab. */
const SWIPE_RATIO = 1.6;

export function PhoneTabBar({
  tab,
  onTab,
}: {
  tab: PhoneTab;
  onTab: (t: PhoneTab) => void;
}) {
  return (
    <nav
      aria-label="Sections"
      className="fixed inset-x-0 bottom-0 z-30 border-t border-[var(--color-line)] lg:hidden"
      style={{
        // Translucent so the page reads as continuing underneath rather than being cut
        // off by an opaque bar.
        background: "color-mix(in srgb, var(--color-bg) 88%, transparent)",
        backdropFilter: "blur(12px)",
        // The iPhone home indicator sits in this space; without it the labels are under
        // the user's thumb rail.
        paddingBottom: "max(0.5rem, env(safe-area-inset-bottom))",
      }}
    >
      <div className="mx-auto flex max-w-[30rem]">
        {ORDER.map((t) => {
          const on = t === tab;
          return (
            <button
              key={t}
              onClick={() => onTab(t)}
              aria-current={on ? "page" : undefined}
              className="flex-1 px-2 pb-1 pt-2.5 text-[12px] transition-colors"
              style={{ color: on ? "var(--color-ink)" : "var(--color-muted)" }}
            >
              <span className="block">{LABEL[t]}</span>
              <span
                aria-hidden
                className="mx-auto mt-1.5 block h-[2px] w-6 rounded-full transition-opacity"
                style={{
                  background: "var(--color-accent)",
                  opacity: on ? 1 : 0,
                }}
              />
            </button>
          );
        })}
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
    if (Math.abs(dx) < SWIPE_PX || Math.abs(dx) < Math.abs(dy) * SWIPE_RATIO) return;
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
