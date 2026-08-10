"use client";

import { useState } from "react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import CalorieLog from "./CalorieLog";
import { CALORIE_FLOOR } from "@/lib/productivity";
import type { CalorieDay } from "@/lib/queries";

/**
 * EVERY DAY EVER LOGGED — the food log's whole backlog, the /sessions page's shape on the
 * calorie record: masthead, one gold window, each day a card. A COUNT of what was eaten
 * and when, never a score: no averages, no weekly totals, no comparison of one week
 * against the next.
 *
 * "Edit" on any day opens the same dialog Today's checklist opens, already pointed at that
 * day — one writing surface for the whole record, however you arrive at it.
 */

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const heading = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

export default function CalorieHistory({
  days,
  today,
}: {
  days: CalorieDay[];
  today: string;
}) {
  const router = useRouter();
  /** Which day the dialog opens on; null = closed. */
  const [editing, setEditing] = useState<string | null>(null);

  return (
    <div className="flex min-h-dvh flex-col bg-[var(--color-bg)] text-[var(--color-ink)]">
      <header className="shrink-0 border-b border-[var(--color-line-strong)] bg-[var(--color-bar)]">
        <div className="mx-auto flex w-full max-w-[64rem] items-baseline justify-between gap-4 px-6 py-5 sm:px-8">
          <h1 className="font-serif text-heading">Calories</h1>
          <Link
            href="/"
            aria-label="Close"
            className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-panel)] hover:text-[var(--color-ink)]"
          >
            ×
          </Link>
        </div>
      </header>

      {/* Gold — the Physical pillar's own surface, whose floor this record serves. */}
      <main className="mx-auto w-full max-w-[64rem] flex-1 px-6 pb-16 pt-6 sm:px-8">
        <div className="window bg-[var(--color-surface-3)] p-5 lg:p-8">
          {days.length === 0 && (
            <p className="max-w-[52ch] text-body leading-relaxed text-[var(--color-muted)]">
              Nothing logged yet. The food log is opened from Today&apos;s
              checklist — the Calories row — and every entry lands here, kept by
              day.
            </p>
          )}

          <div className="flex flex-col gap-5">
            {days.map((d) => (
              <section key={d.date} className="record-card">
                <div className="section-head">
                  <h2 className="text-small font-semibold">
                    {heading(d.date)}
                  </h2>
                  <span className="flex shrink-0 items-baseline gap-3">
                    <span className="text-small tabular-nums">
                      {d.total}
                      <span className="text-micro text-[var(--color-muted)]">
                        /{CALORIE_FLOOR}
                      </span>
                    </span>
                    <button
                      onClick={() => setEditing(d.date)}
                      aria-haspopup="dialog"
                      className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                    >
                      edit
                    </button>
                  </span>
                </div>

                <ul className="mt-2 divide-y divide-[var(--color-line)]">
                  {d.entries.map((e) => (
                    <li key={e.id} className="flex items-baseline gap-3 py-2">
                      <span className="min-w-0 flex-1 truncate font-serif text-small">
                        {e.note || (
                          <span className="text-[var(--color-muted)]">
                            unnamed
                          </span>
                        )}
                      </span>
                      <span className="shrink-0 text-small tabular-nums">
                        {e.kcal}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
          </div>
        </div>
      </main>

      {editing && (
        <CalorieLog
          date={today}
          initialDay={editing}
          total={null}
          entries={[]}
          onChanged={() => router.refresh()}
          onClose={() => {
            setEditing(null);
            // The page's day cards are server-rendered; a write in the dialog has to be
            // re-read or the card contradicts what was just saved.
            router.refresh();
          }}
        />
      )}
    </div>
  );
}
