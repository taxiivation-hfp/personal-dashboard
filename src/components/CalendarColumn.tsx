"use client";

import { useEffect, useState } from "react";

type Day = {
  date: string;
  isToday: boolean;
  isFuture: boolean;
  pct: number | null;
  due: number;
  unmarked: number;
  blocks: { time: string | null; timeEnd: string | null; title: string; state: string | null }[];
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

/** "10:00" -> "10am", "14:30" -> "2:30pm". Minutes only shown when they're not :00. */
function clock(hhmm: string | null): string | null {
  if (!hhmm) return null;
  const [hStr, mStr] = hhmm.split(":");
  const h = Number(hStr);
  const m = Number(mStr);
  if (!Number.isFinite(h)) return null;
  const suffix = h < 12 ? "am" : "pm";
  const h12 = h % 12 === 0 ? 12 : h % 12;
  return m ? `${h12}:${String(m).padStart(2, "0")}${suffix}` : `${h12}${suffix}`;
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
          hairline now, and every number — the day's percentage and each block's time —
          hangs off the one margin rail, so the column scans vertically as a ledger. */}
      <ul className="mt-1 divide-y divide-[var(--color-line)]">
        {days.map((d) => (
          <li
            key={d.date}
            className="py-3"
            style={{
              // Upcoming days are visibly quieter — they haven't happened yet.
              opacity: d.isFuture ? 0.65 : 1,
            }}
          >
            {/* Today is found by weight and by a rule under its line, the way a section
                heading sits on one. A filled card would make one of nine days look like a
                control and the other eight look switched off. */}
            <div
              className={`page-margin items-baseline ${
                d.isToday ? "border-b border-[var(--color-line-strong)] pb-1.5" : ""
              }`}
            >
              {/* Same conditional the blocks below use, so the whole nine-day rail agrees
                  about its own colour. Future rows inherit ink because the 0.65 veil on
                  them composites muted down to ~2.5:1; muted everywhere else. */}
              <span
                className={`justify-self-end text-right text-micro tabular-nums ${
                  d.isFuture ? "" : "text-[var(--color-muted)]"
                }`}
              >
                {d.pct == null ? "—" : `${d.pct}%`}
              </span>
              <p className={`text-small ${d.isToday ? "font-semibold" : ""}`}>
                {d.isToday
                  ? "Today"
                  : new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
              </p>
            </div>

            {/* Muted sets the recorded days' blocks behind their percentage. Future rows
                inherit the ink instead: the 0.65 veil is already doing that job, and muted
                underneath it composites to 2.5:1 — quiet is not worth unreadable. */}
            {d.blocks.length > 0 ? (
              <ul className={`mt-2 flex flex-col gap-1 ${d.isFuture ? "" : "text-[var(--color-muted)]"}`}>
                {d.blocks.slice(0, 4).map((b, i) => (
                  <li key={i} className="page-margin items-baseline">
                    <span className="justify-self-end text-right text-micro tabular-nums">
                      {span(b.time, b.timeEnd)}
                    </span>
                    <span className="flex min-w-0 items-baseline gap-2">
                      <span aria-hidden className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={dot(b.state)} />
                      <span className="min-w-0 flex-1 truncate text-small font-serif">{b.title}</span>
                    </span>
                  </li>
                ))}
                {d.blocks.length > 4 && (
                  <li className="pl-[calc(var(--page-margin)+0.875rem)] text-micro">+{d.blocks.length - 4} more</li>
                )}
              </ul>
            ) : (
              <p
                className={`mt-2 pl-[calc(var(--page-margin)+0.875rem)] text-micro ${
                  d.isFuture ? "" : "text-[var(--color-muted)]"
                }`}
              >
                Nothing scheduled.
              </p>
            )}
          </li>
        ))}
        {days.length === 0 && <li className="py-3 text-small text-[var(--color-muted)]">No calendar data.</li>}
      </ul>
    </section>
  );
}
