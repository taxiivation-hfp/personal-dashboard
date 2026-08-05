"use client";

import { useEffect, useState } from "react";

type Ev = { id: string; summary: string; start: string | null; end: string | null; allDay: boolean };
type State = { configured: boolean; connected: boolean; events: Ev[] };

function fmtTime(iso: string | null): string {
  if (!iso || iso.length <= 10) return "";
  return new Intl.DateTimeFormat("en-AU", {
    hour: "2-digit",
    minute: "2-digit",
    hour12: false,
    timeZone: "Australia/Melbourne",
  }).format(new Date(iso));
}

export default function CalendarToday({ date }: { date: string }) {
  const [state, setState] = useState<State | null>(null);

  useEffect(() => {
    fetch(`/api/calendar?date=${date}`)
      .then((r) => r.json())
      .then(setState)
      .catch(() => {});
  }, [date]);

  // Hidden entirely until Google creds are configured in .env.local.
  if (!state || !state.configured) return null;

  if (!state.connected) {
    return (
      <section className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Google Calendar</h2>
          <p className="mt-0.5 text-xs text-[var(--color-muted)]">Link it so the coach time-blocks around your real day.</p>
        </div>
        <a
          href="/api/google/connect"
          className="shrink-0 rounded-xl bg-[var(--color-accent)] px-3.5 py-2 text-sm font-medium text-black transition-opacity hover:opacity-90"
        >
          Connect
        </a>
      </section>
    );
  }

  return (
    <section className="rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)]">
      <header className="flex items-center justify-between gap-2 border-b border-[var(--color-line)] px-4 py-3">
        <h2 className="text-sm font-semibold tracking-wide">On your calendar</h2>
        <button
          onClick={async () => {
            await fetch("/api/google/disconnect", { method: "POST" });
            setState((s) => (s ? { ...s, connected: false, events: [] } : s));
          }}
          className="shrink-0 text-[11px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
        >
          disconnect
        </button>
      </header>

      {state.events.length === 0 ? (
        <p className="px-4 py-4 text-sm text-[var(--color-muted)]">Nothing on your calendar today.</p>
      ) : (
        <ul className="divide-y divide-[var(--color-line)]">
          {state.events.map((e) => (
            <li key={e.id} className="flex flex-col gap-0.5 px-4 py-2.5 text-sm">
              <span className="tabular-nums text-[11px] text-[var(--color-muted)]">
                {e.allDay ? "all day" : `${fmtTime(e.start)}${e.end ? "–" + fmtTime(e.end) : ""}`}
              </span>
              <span className="min-w-0 truncate leading-snug">{e.summary}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
