"use client";

import { useEffect, useState } from "react";
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
 * Today takes no wash at all. The calendar window IS today's ground, and being the one row
 * that isn't tinted is most of why it reads as the live one.
 */
const surface = (d: Day) =>
  d.isToday
    ? "transparent"
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

  useEffect(() => {
    fetch(`/api/adherence?days=${DAYS}&center=${date}`)
      .then((r) => r.json())
      .then((d) => !d.error && setDays(d.days ?? []))
      .catch(() => {});
  }, [date]);

  return (
    <section>
      <div className="section-head">
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
        {days.map((d) => (
          <li
            key={d.date}
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
