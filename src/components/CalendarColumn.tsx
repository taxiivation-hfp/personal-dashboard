"use client";

import { useEffect, useRef, useState, type CSSProperties } from "react";
import { projectedColour } from "@/lib/eventColor";

type Day = {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  pct: number | null;
  due: number;
  unmarked: number;
  blocks: {
    time: string | null;
    timeEnd: string | null;
    title: string;
    state: string | null;
    colorId: string | null;
  }[];
};

// 9 days: four above today, today, four below. Symmetric so today lands in the
// vertical middle of the column.
const DAYS = 9;

/**
 * Which row of the window is the day being VIEWED.
 *
 * /api/adherence's `center=` puts that day at `floor((n-1)/2)` — past above, upcoming
 * below — so the middle row is the one the screen is standing on. Derived from DAYS with
 * the same arithmetic rather than written as 4, so the two cannot come apart if the window
 * is ever widened.
 */
const MIDDLE = (DAYS - 1) >> 1;

/**
 * The scrolling ancestor this column sits in — the calendar WINDOW, and only on desktop.
 *
 * Found by walking up rather than by taking a ref, because the scrollport is not this
 * component's to own: Today.tsx gives each window `lg:h-full lg:overflow-y-auto` and the
 * column is three wrappers deep inside it. Asking the DOM what is actually scrolling keeps
 * that height-solving where it lives instead of duplicating a guess about it here.
 *
 * On the phone there IS no scrollport — the window shows all of itself and the PAGE
 * scrolls, which is the owner's ruling — and this returns null, which is what stands the
 * whole behaviour below down at that width. The walk stops at <body> deliberately: the page
 * itself must never be the thing this column decides to move.
 */
function scrollportOf(el: HTMLElement | null): HTMLElement | null {
  for (
    let p = el?.parentElement ?? null;
    p && p !== document.body;
    p = p.parentElement
  ) {
    const oy = getComputedStyle(p).overflowY;
    if (oy === "auto" || oy === "scroll") return p;
  }
  return null;
}

const dot = (state: string | null) =>
  state === "adhered"
    ? { background: "var(--color-adhered)" }
    : state === "drifted"
      ? { background: "var(--color-drifted)" }
      : state === "skipped"
        ? { border: "1px solid var(--color-skipped)" }
        : { border: "1px dashed var(--color-line-strong)" };

/**
 * The wash behind a day — an explicit token, never an opacity veil.
 *
 * A veil turns every colour underneath it into a composite nobody can audit: the 0.65 this
 * replaces dropped muted text to 2.5:1, which forced future rows to sit in full ink to stay
 * readable and left the column with two conflicting greying rules. Tokens are measured
 * against the surface they actually land on — recorded is ink 14.34:1 / muted 4.93:1, ahead
 * is 15.69:1 / 5.40:1.
 *
 * Today takes the GREEN, and it is the only place that colour appears in the app.
 *
 * It used to take no wash at all and let the window's own green through — which worked only
 * while the window was green, and made the live row indistinguishable from the ground when
 * the window stopped being. Today is now a fill like the other two states, so the column
 * reads as three kinds of row on one paper rather than two kinds and a hole.
 *
 * Warm past, green today, pale future: the day you can still act on is the only one with a
 * hue, and the two you cannot are a memory and a blank.
 */
const surface = (d: Day) =>
  d.isToday
    ? "var(--color-today)"
    : d.isFuture
      ? "var(--color-ahead)"
      : "var(--color-recorded)";

/** "10:00" -> "10am", "14:30" -> "2:30pm". Minutes only shown when they're not :00. */
function clock(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m
    ? `${h12}:${String(m).padStart(2, "0")}${suffix}`
    : `${h12}${suffix}`;
}

/** Just the allocated span, as written. No durations, no relative times. */
function span(start: string | null, end: string | null): string | null {
  const a = clock(start);
  if (!a) return null;
  const b = clock(end);
  return b ? `${a}–${b}` : a;
}

/**
 * Looking at the shape of recent days — not a second Today screen.
 *
 * Rendered in plain chronological order with the window CENTRED on today, so past
 * days sit above and upcoming days below, matching how a day actually moves down
 * the column.
 */
export default function CalendarColumn({ date }: { date: string }) {
  const [days, setDays] = useState<Day[]>([]);
  /** The column itself — the foot of the walk up to whatever is scrolling. */
  const scope = useRef<HTMLElement | null>(null);
  /** The fold. Measured, not assumed: it covers the top of the scrollport, so it is not
   *  part of the area a row can be centred in. */
  const head = useRef<HTMLDivElement | null>(null);
  /** Today's row, and only when today is the day being viewed — see `live`. */
  const nowRow = useRef<HTMLLIElement | null>(null);

  useEffect(() => {
    fetch(`/api/adherence?days=${DAYS}&center=${date}`)
      .then((r) => r.json())
      .then((d) => !d.error && setDays(d.days ?? []))
      .catch(() => {});
  }, [date]);

  /**
   * IS THERE A "NOW" TO POINT AT?
   *
   * The middle row is the day being viewed (see MIDDLE); if that day is also the real
   * today, the screen is live. Read off the rows themselves rather than compared against a
   * clock in the browser: `isToday` is stamped by the server from todayISO(), which is the
   * one place in this app that decides what day it is.
   */
  const live = days.length === DAYS && days[MIDDLE].isToday;

  /**
   * WHERE THE COLUMN OPENS: with today in the MIDDLE of what you can see.
   *
   * It opened at the top, which meant it opened on four days that had already happened and
   * put the only day you can still act on below the fold. The column runs chronologically
   * downward, so parking it here is what makes that direction useful — what is coming is on
   * screen, and the past is a scroll UP, which is where a past belongs.
   *
   * TODAY ONLY. On a day being caught up on there is no "now" for a middle to be about, so
   * the column goes to the TOP instead — the earliest of the nine days, read downward like
   * any other record. The alternative, centring the viewed day, was rejected because it
   * would claim the same thing this centring claims — "here is the live edge, look below
   * it" — about a day where nothing is upcoming and the whole column is already history.
   * The top is also the honest reset: without it a step back from today would leave the
   * window parked at a scroll position that was measured against a different day's rows.
   *
   * Keyed on `days`, which is a new array exactly once per fetch and the fetch runs once per
   * date — so this is mount plus every date change, and never a yank of a scroll the owner
   * has since moved themselves.
   *
   * A JUMP, not a travel: `scrollTop` is assigned, no smooth behaviour anywhere near it.
   * The column has not been looked at yet when this runs, so there is no continuity for a
   * scroll animation to preserve — it would be motion for its own sake, which is the one
   * kind this app does not ship. Nothing here to suppress under reduced motion.
   */
  useEffect(() => {
    if (days.length === 0) return;
    const sc = scrollportOf(scope.current);
    if (!sc) return; // the phone: the page scrolls, and it is not ours to move
    const row = nowRow.current;
    if (!row) {
      sc.scrollTop = 0;
      return;
    }
    // What the fold hides. Measured off `position` rather than off a width guess, so the
    // two rules stay one fact: where the head is not sticky it occludes nothing.
    const h = head.current;
    const behind =
      h && getComputedStyle(h).position === "sticky" ? h.offsetHeight : 0;
    const r = row.getBoundingClientRect();
    const s = sc.getBoundingClientRect();
    // clientTop is the scrollport's own border, which rect coordinates include and
    // scrollTop does not. clientHeight is the padding box, which is what a row is centred
    // in — less the fold sitting over the top of it. The browser clamps the ends for us.
    sc.scrollTop +=
      r.top -
      s.top -
      sc.clientTop -
      behind -
      (sc.clientHeight - behind - r.height) / 2;
  }, [days]);

  return (
    <section ref={scope}>
      {/* THE FOLD. The column's name stays put while the days run under it.
       *
       * `sticky`, not a header lifted out of the column: the title sits on its rule like
       * every other .section-head in the app, and a bar the window grew would be one more
       * piece of furniture on a screen the subtraction rule keeps thin.
       *
       * DESKTOP ONLY, because desktop is the only place this column is a scrollport. On the
       * phone the window shows all of itself and the PAGE scrolls — the owner's ruling — so
       * there is nothing for a title to stay ahead of, and a band pinned to the top of a
       * 390px viewport would eat exactly the real estate the masthead was denied.
       *
       * -mt-6/pt-6 and -mx-6/px-6 are the window's own lg:p-6 handed back: the head starts
       * at the window's padding-box top and wears that padding itself, so at rest it lands
       * precisely where it did before and then NEVER MOVES when the scroll starts. A title
       * that jumps 24px up on the first wheel click is a header being animated at you; this
       * one is simply always there, and the days pass behind it.
       *
       * The ground restates the ONE LAMP rather than taking a flat fill. --color-surface-2
       * alone would read as an unlit band across the brightest 50px of the window, since
       * .window's highlight is pinned to the border box and deliberately does not scroll —
       * so the head repaints the same 0.38 -> 0 over 220px from the same origin (its top IS
       * that border box's padding edge) and the seam disappears. Opaque underneath, so no
       * row is ever legible through it. No shadow and no fade below it: the hairline
       * .section-head already carries is the fold. */}
      <div
        ref={head}
        style={
          {
            "--fold":
              "linear-gradient(180deg, rgb(255 255 255 / 0.38) 0, rgb(255 255 255 / 0) 220px) var(--color-surface-2)",
          } as CSSProperties
        }
        // z-index from the token, not a number: the day rows carry positioned marks of
        // their own — today's masked gradient stroke — and a positioned descendant later in
        // the document would otherwise paint over a sticky header that has none.
        /**
         * `-top-6`, NOT `top-0`, and this is the whole fix for the gap.
         *
         * `position: sticky` pins against the scrollport's PADDING box, not its border box.
         * The window carries `lg:p-6`, so `top: 0` pinned the head 24px down from the
         * window's edge — and a scrolling day row passed through that 24px strip in full
         * view above the title, which is exactly the gap that was reported. The head also
         * stepped down by 24px at the moment it stuck.
         *
         * Pulling the pin up by the window's own padding puts the head's border box at the
         * window edge when stuck, which is where `-mt-6` already puts it at rest — so the
         * two states are identical and there is no strip left to see through. The `pt-6`
         * then holds the title on the same baseline in both.
         *
         * The rounded corners still clip it: `overflow-y: auto` on the window makes it a
         * scroll container, and a scroll container clips to its border radius.
         */
        className="section-head lg:sticky lg:-top-6 lg:z-[var(--z-sticky)] lg:-mx-6 lg:-mt-6 lg:px-6 lg:pt-6 lg:[background:var(--fold)]"
      >
        <h2 className="text-small font-semibold">Calendar</h2>
      </div>

      {/* Nine rounded panels made nine identical objects out of nine different days, and a
          stack of them read as a dashboard rather than a page. Days are separated by the
          hairline, and every number — the day's percentage and each block's time — hangs off
          the one margin rail, so the column scans vertically as a ledger. The wash groups
          those rows into three tenses; the hairline still divides one day from the next.

          TWO INK LEVELS AND NO THIRD. Today is ink, every other day is muted throughout — a
          level in between is what a severity ramp looks like in greyscale. Inside a greyed
          row the text-small / text-micro step does the separating instead. The app's own
          words — percentages, times, counts, "Nothing scheduled" — stay muted on every row
          including today, because that is what the .page-margin rail is for. */}
      <ul className="mt-1 divide-y divide-[var(--color-line)]">
        {days.map((d, i) => (
          <li
            key={d.date}
            // The row the column parks on, and it is taken ONLY when the screen is live —
            // an absent ref is what tells the effect above there is no "now" here, so the
            // rule lives in one place rather than being asked twice.
            ref={i === MIDDLE && live ? nowRow : null}
            // The -mx-3 px-3 bleed carries the wash out to the window's inner edge without
            // reaching its border, so a day reads as a band across the column rather than a
            // chip sitting inside it. Today additionally takes the app's one gradient: a
            // full accent stroke where the day began, dissolving downward toward tomorrow.
            // A filled card would make one of nine days look like a control and the other
            // eight look switched off.
            className={`-mx-3 rounded-lg px-3 py-3 ${d.isToday ? "today-mark" : ""}`}
            style={{ background: surface(d) }}
          >
            <div className="page-margin items-baseline">
              <span className="justify-self-end text-right text-micro tabular-nums text-[var(--color-muted)]">
                {d.pct == null ? "—" : `${d.pct}%`}
              </span>
              <p
                className={`text-small ${d.isToday ? "font-semibold" : "text-[var(--color-muted)]"}`}
              >
                {d.isToday
                  ? "Today"
                  : new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
              </p>
            </div>

            {d.blocks.length > 0 ? (
              <ul
                className={`mt-2 flex flex-col gap-1 ${d.isToday ? "" : "text-[var(--color-muted)]"}`}
              >
                {d.blocks.slice(0, 4).map((b, i) => {
                  const hue = projectedColour(b.colorId);
                  return (
                    <li key={i} className="page-margin items-baseline">
                      <span className="justify-self-end text-right text-micro tabular-nums text-[var(--color-muted)]">
                        {span(b.time, b.timeEnd)}
                      </span>
                      <span className="flex min-w-0 items-baseline gap-2">
                        {/* Position carries category, form carries status. The event's own
                            colour is a stroke at the edge of the row and nothing else; the
                            block state keeps its dot, so the two can never be read as one
                            mark. No colour means no rule — absence is the default here, not
                            a twelfth state. */}
                        {hue ? (
                          <span
                            aria-hidden
                            className="w-[2px] shrink-0 self-stretch rounded-full"
                            style={{ background: hue }}
                          />
                        ) : null}
                        <span
                          aria-hidden
                          className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full"
                          style={dot(b.state)}
                        />
                        <span className="min-w-0 flex-1 truncate font-serif text-small">
                          {b.title}
                        </span>
                      </span>
                    </li>
                  );
                })}
                {d.blocks.length > 4 && (
                  <li className="pl-[calc(var(--page-margin)+0.875rem)] text-micro text-[var(--color-muted)]">
                    +{d.blocks.length - 4} more
                  </li>
                )}
              </ul>
            ) : (
              <p className="mt-2 pl-[calc(var(--page-margin)+0.875rem)] text-micro text-[var(--color-muted)]">
                Nothing scheduled.
              </p>
            )}
          </li>
        ))}
        {days.length === 0 && (
          <li className="py-3 text-small text-[var(--color-muted)]">
            No calendar data.
          </li>
        )}
      </ul>
    </section>
  );
}
