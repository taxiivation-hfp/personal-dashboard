"use client";

import { useEffect, useRef, useState } from "react";
import { projectedColour, SLAB_NEUTRAL } from "@/lib/eventColor";
import type { DayHours, HourCategoryLabel } from "@/lib/productivity";

/**
 * WHERE ONE DAY'S HOURS WENT.
 *
 * THE SCORE IS GONE — the owner's ruling of 2026-09-18: "quantifying productivity is
 * stupid." This sheet used to explain a points total: a rate per hour, a flat figure per
 * logged gym session, a figure per ticked non-negotiable. None of that is printed anywhere
 * in the app any more. What survives is the honest half of it, the question the score was
 * only ever a proxy for — where did the day's hours go — answered in MINUTES, which are a
 * duration you actually spent rather than a number the app invented.
 *
 * The bar on the record's Hours chart is a shape you glance at; this is the arithmetic, one
 * deliberate tap away. A drill-down you opened on purpose is an explanation.
 *
 * WHAT DID NOT COUNT IS STILL THE HALF THAT EARNS THE SCREEN. A day full of scheduled hours
 * can hold no hours worked — an unmarked block adds nothing, a skipped or drifted one adds
 * nothing, a colour that is not one of the four categories adds nothing — and every one of
 * those is invisible on a stack. "I went to the gym, why is it not in there" has an answer,
 * and this is where it lives. It is stated without scolding: an unmarked block is
 * information about the log, never a verdict on the day.
 *
 * A LEDGER, not a scoreboard. No target, no average, no comparison with any other day.
 */

type Ignored = {
  title: string;
  minutes: number | null;
  colorId: string | null;
  state: string | null;
  reason: string | null;
};

/** Exactly what /api/productivity returns. */
type Payload = {
  date: string;
  calendarConnected: boolean;
  /** null when Google could not be reached — an outage is "no data", not a day with
   *  nothing worked. */
  hours: DayHours | null;
  /** The four categories in stacking order, for a legend on a day that holds none. */
  categories: { label: HourCategoryLabel; colorId: string | null }[];
  /** The minutes that did not count, with the reason each did not. */
  ignored: Ignored[];
};

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** 150 -> "2h 30m". Time is shown as TIME. A bare number here is the shape a score wears,
 *  and the whole point of this sheet since the pivot is that it no longer holds one. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

export default function ProductivityLog({
  date,
  onClose,
  onOpenDay,
}: {
  date: string;
  onClose: () => void;
  /** The way through to catching up on this day. Kept as a quiet link inside the sheet
   *  rather than on the tap that opened it. */
  onOpenDay?: (date: string) => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    setData(null);
    setError(null);
    fetch(`/api/productivity?date=${date}`)
      .then((r) => r.json())
      .then((d: Payload & { error?: string }) => {
        if (!alive) return;
        if (d.error) return setError(d.error);
        setData(d);
      })
      .catch(() => alive && setError("could not read this day"));
    return () => {
      alive = false;
    };
  }, [date]);

  const hours = data?.hours ?? null;
  const categories = hours?.categories ?? [];

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,34rem)] max-h-[92dvh] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="min-w-0 font-serif text-body">{longDay(date)}</h2>
        <button
          onClick={onClose}
          aria-label="Close"
          className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
        >
          ×
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-4 text-small font-semibold">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="py-12 text-small text-[var(--color-muted)]">Reading…</p>
      )}

      {/* AND NOTHING ELSE. Without the calendar there are no blocks, so neither half of
          this sheet has anything true to say — an empty ledger under this line would read
          as a day in which nothing was worked. */}
      {data && !data.calendarConnected && (
        <p className="mt-4 text-small text-[var(--color-muted)]">
          Google Calendar could not be reached.
        </p>
      )}

      {data && data.calendarConnected && hours && (
        <>
          {/* THE FIGURE THIS SHEET ADDS UP TO. Printed here because a breakdown that
              withholds its total is not a breakdown — and it is hours, which is a fact
              about where a day went rather than a judgement about it. */}
          <div className="mt-4 flex items-baseline gap-3 border-y border-[var(--color-line-strong)] py-3">
            <span className="stat-hero text-heading">
              {asTime(hours.minutes)}
            </span>
            <span className="min-w-0 flex-1 text-micro leading-snug text-[var(--color-muted)]">
              hours worked
            </span>
          </div>

          {/* THE HOURS, one row per category, in the colour those hours had in the
              calendar. Merged by CATEGORY and not by colour — Work Part Time owns two
              calendar colours, and the route already collapsed them. */}
          <div className="mt-4">
            <div className="section-head">
              <h3 className="text-small font-semibold">Hours</h3>
            </div>
            {categories.length === 0 ? (
              <>
                <p className="pt-3 text-small text-[var(--color-muted)]">
                  No blocked hours worked.
                </p>
                {/* The four categories, named but unlit. On a day that holds none this is
                    the only thing that says what the stack would have been made of; on
                    any other day the rows above say it, so it is not drawn twice. */}
                <ul className="mt-3 flex flex-wrap gap-x-3 gap-y-1">
                  {data.categories.map((c) => (
                    <li
                      key={c.label}
                      className="flex items-center gap-1.5 text-micro text-[var(--color-muted)]"
                    >
                      <span
                        aria-hidden
                        className="h-2 w-2 shrink-0 rounded-[2px]"
                        style={{
                          background: projectedColour(c.colorId) ?? SLAB_NEUTRAL,
                        }}
                      />
                      {c.label}
                    </li>
                  ))}
                </ul>
              </>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {categories.map((c) => (
                  <li
                    key={c.label}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]"
                      style={{
                        background: projectedColour(c.colorId) ?? SLAB_NEUTRAL,
                      }}
                    />
                    <span className="min-w-0 flex-1 text-small">{c.label}</span>
                    <span className="shrink-0 text-small tabular-nums">
                      {asTime(c.minutes)}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* WHAT DID NOT COUNT, and why. See the module docblock — this is the half of
              the screen that answers a question, because everything above it is already
              visible on the bar. */}
          {data.ignored.length > 0 && (
            <div className="mt-5">
              <div className="section-head">
                <h3 className="text-small font-semibold">Didn&apos;t count</h3>
              </div>
              <ul className="divide-y divide-[var(--color-line)]">
                {data.ignored.map((b, i) => (
                  <li key={i} className="py-2.5">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 truncate font-serif text-small">
                        {b.title}
                      </span>
                      <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                        {b.minutes ? asTime(b.minutes) : "all day"}
                      </span>
                    </div>
                    {/* Never scolding. A block that has not been marked is information
                        about the log, not a verdict on the day — the honest-logging rule
                        covers this list exactly as it covers the three states. */}
                    <p className="mt-0.5 text-micro text-[var(--color-muted)]">
                      {b.reason}
                    </p>
                  </li>
                ))}
              </ul>
            </div>
          )}

          {/* The way through to the day itself, for the commonest thing this screen makes
              you want to do: mark the block that did not count. */}
          {onOpenDay && (
            <button
              onClick={() => onOpenDay(date)}
              className="mt-5 inline-flex items-center gap-1.5 border-t border-[var(--color-line)] pt-3 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              open this day to mark it
              <span aria-hidden>→</span>
            </button>
          )}
        </>
      )}
    </dialog>
  );
}
