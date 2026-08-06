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
      <h2 className="text-body font-semibold">Calendar</h2>
      <ul className="mt-4 flex flex-col gap-3">
        {days.map((d) => (
          <li
            key={d.date}
            className="rounded-2xl px-4 py-3"
            style={{
              background: d.isToday ? "var(--color-accent-soft)" : "var(--color-panel)",
              // Upcoming days are visibly quieter — they haven't happened yet.
              opacity: d.isFuture ? 0.65 : 1,
            }}
          >
            <div className="flex items-baseline justify-between gap-3">
              <p className="text-small">
                {d.isToday
                  ? "Today"
                  : new Date(`${d.date}T12:00:00`).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
              </p>
              <span className="shrink-0 text-small tabular-nums text-[var(--color-muted)]">
                {d.pct == null ? "—" : `${d.pct}%`}
              </span>
            </div>

            {d.blocks.length > 0 ? (
              <ul className="mt-2 flex flex-col gap-1">
                {d.blocks.slice(0, 4).map((b, i) => (
                  <li key={i} className="flex items-baseline gap-2">
                    <span aria-hidden className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-full" style={dot(b.state)} />
                    <span className="min-w-0 flex-1 truncate text-small font-serif text-[var(--color-muted)]">{b.title}</span>
                    <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                      {span(b.time, b.timeEnd)}
                    </span>
                  </li>
                ))}
                {d.blocks.length > 4 && (
                  <li className="pl-4 text-micro text-[var(--color-muted)]">+{d.blocks.length - 4} more</li>
                )}
              </ul>
            ) : (
              <p className="mt-1.5 text-small text-[var(--color-muted)]">Nothing scheduled.</p>
            )}
          </li>
        ))}
        {days.length === 0 && <li className="text-small text-[var(--color-muted)]">No calendar data.</li>}
      </ul>
    </section>
  );
}
