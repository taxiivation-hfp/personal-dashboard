"use client";

import { useEffect, useRef, useState } from "react";
import { projectedColour, SLAB_GYM, SLAB_NEUTRAL } from "@/lib/eventColor";
import type { ProductivitySegment } from "@/lib/productivity";

/**
 * HOW THE DAY'S COLUMN GOT ITS HEIGHT.
 *
 * The strip prints no productivity number, and that rule stands: an uncapped figure sitting
 * on a chart with no ceiling beside it invites a comparison it cannot support, and it is the
 * shortest path back to a scoreboard. This is the other side of the same bargain — the bar
 * stays a shape you glance at, and the arithmetic is one deliberate tap away. A drill-down
 * you opened on purpose is an explanation; a number on a chart is a score.
 *
 * WHAT DID NOT COUNT IS HALF THE SCREEN, and it is the more useful half. A day full of
 * scheduled hours can score nothing at all — an unmarked block pays nothing, a skipped or
 * drifted one pays nothing, a colour the table has never been taught pays nothing — and
 * every one of those is invisible on the bar. "I went to the gym, why is it not in there"
 * has an answer, and this is where it lives.
 *
 * It is a LEDGER, not a scoreboard. No target, no average, no comparison with any other
 * day, and nothing here is drawn as a ring — the score is uncapped, and a ring implies a
 * ceiling it does not have.
 */

type Rate = { id: string | null; google: string; label: string; rate: number };
type Ignored = {
  title: string;
  minutes: number | null;
  colorId: string | null;
  state: string | null;
  reason: string | null;
};
type Payload = {
  date: string;
  calendarConnected: boolean;
  score: {
    points: number;
    timePoints: number;
    habitPoints: number;
    sessionPoints: number;
    minutes: number;
    segments: ProductivitySegment[];
  } | null;
  rates: Rate[];
  ignored: Ignored[];
  habits: {
    done: number;
    scheduled: number;
    points: number;
    calories: number | null;
    calorieFloor: number;
    calorieCounted: boolean;
  };
  /** The kinds logged that day — "strength", "cardio", "misc" — one entry per session. */
  sessions: string[];
  constants: { perHour: number; perHabit: number; perSession: number };
};

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const longDay = (iso: string) =>
  new Date(`${iso}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

/** 150 -> "2h 30m". Time is shown as time; an abstract number would read as a score. */
function asTime(minutes: number): string {
  if (minutes <= 0) return "—";
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  if (!h) return `${m}m`;
  return m ? `${h}h ${m}m` : `${h}h`;
}

/** "×1", "×0.5" — the rate as it reads in a line of arithmetic. */
const asRate = (r: number) => `×${r % 1 === 0 ? r : String(r)}`;

export default function ProductivityLog({
  date,
  onClose,
  onOpenDay,
}: {
  date: string;
  onClose: () => void;
  /** The way through to catching up on this day. Kept as a quiet link inside the sheet
   *  rather than on the tap that opened it — see the strip's own comment. */
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

  const s = data?.score ?? null;
  const time = (s?.segments ?? []).filter((x) => x.kind === "time");


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

      <p className="mt-2 max-w-[52ch] text-micro leading-relaxed text-[var(--color-muted)]">
        Hours spent, never results produced. A block worked badly and a block
        worked brilliantly score the same — nothing about quality, or what got
        finished, reaches this. Scheduled time is priced by the clock and its
        calendar colour; a gym session is priced flat, because three hours under
        a bar is not more productive than two.
      </p>

      {error && (
        <p role="alert" className="mt-4 text-small font-semibold">
          {error}
        </p>
      )}
      {!data && !error && (
        <p className="py-12 text-small text-[var(--color-muted)]">Reading…</p>
      )}

      {data && !data.calendarConnected && (
        <p className="mt-4 max-w-[52ch] text-small leading-relaxed text-[var(--color-muted)]">
          Google Calendar could not be reached, so this day has no score to show
          — not a zero, an unknown.
        </p>
      )}

      {data && s && (
        <>
          {/* THE TOTAL. Printed HERE and nowhere else — it is the thing the workings below
              add up to, and a breakdown whose total is withheld is not a breakdown. */}
          <div className="mt-4 flex items-baseline gap-3 border-y border-[var(--color-line-strong)] py-3">
            <span className="font-serif text-heading tabular-nums">
              {s.points}
            </span>
            <span className="min-w-0 flex-1 text-micro leading-snug text-[var(--color-muted)]">
              points · {data.constants.perHour} an hour at full rate,{" "}
              {data.constants.perSession} a gym session,{" "}
              {data.constants.perHabit} a non-negotiable. No ceiling, so this is
              only ever compared with the days beside it on the strip.
            </span>
          </div>

          {/* THE HOURS. One row per colour, in the colour those hours had in the calendar,
              with the arithmetic written out: time × rate = points. */}
          <div className="mt-4">
            <div className="section-head">
              <h3 className="text-small font-semibold">Hours</h3>
              <span className="text-micro tabular-nums text-[var(--color-muted)]">
                {s.timePoints}
              </span>
            </div>
            {time.length === 0 ? (
              <p className="max-w-[52ch] pt-3 text-small leading-relaxed text-[var(--color-muted)]">
                No blocked hours scored. Only blocks you marked{" "}
                <span className="text-[var(--color-ink)]">adhered</span> count —
                see what is below.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {time.map((seg, i) => (
                  <li
                    key={`${seg.colorId ?? "d"}-${i}`}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]"
                      style={{
                        background:
                          projectedColour(seg.colorId) ?? SLAB_NEUTRAL,
                      }}
                    />
                    <span className="w-28 shrink-0 text-small">
                      {seg.label}
                    </span>
                    <span className="min-w-0 flex-1 text-micro tabular-nums text-[var(--color-muted)]">
                      {asTime(seg.minutes)} {asRate(seg.rate ?? 0)}
                    </span>
                    <span className="shrink-0 text-small tabular-nums">
                      {seg.points}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* TRAINING. A FLAT figure per session, never per hour — three hours under a bar
              is not more productive than two, and an hourly rate would say it was. The
              scheduled block is worth nothing; this row is where the gym lives. */}
          <div className="mt-5">
            <div className="section-head">
              <h3 className="text-small font-semibold">Gym</h3>
              <span className="text-micro tabular-nums text-[var(--color-muted)]">
                {s.sessionPoints}
              </span>
            </div>
            {data.sessions.length === 0 ? (
              <p className="max-w-[52ch] pt-3 text-small leading-relaxed text-[var(--color-muted)]">
                No session logged. A gym block on the calendar earns nothing on
                its own — the write-up is the record.
              </p>
            ) : (
              <ul className="divide-y divide-[var(--color-line)]">
                {data.sessions.map((kind, i) => (
                  <li
                    key={i}
                    className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5"
                  >
                    <span
                      aria-hidden
                      className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]"
                      style={{ background: SLAB_GYM }}
                    />
                    <span className="w-28 shrink-0 text-small capitalize">
                      {kind}
                    </span>
                    <span className="min-w-0 flex-1 text-micro tabular-nums text-[var(--color-muted)]">
                      one session · flat, whatever its length
                    </span>
                    <span className="shrink-0 text-small tabular-nums">
                      {data.constants.perSession}
                    </span>
                  </li>
                ))}
              </ul>
            )}
          </div>

          {/* THE TICKED THINGS. Achromatic, as they are on the bar — there is no calendar
              colour behind a non-negotiable for a hue to mean. */}
          <div className="mt-5">
            <div className="section-head">
              <h3 className="text-small font-semibold">Ticked</h3>
              <span className="text-micro tabular-nums text-[var(--color-muted)]">
                {s.habitPoints}
              </span>
            </div>
            <ul className="divide-y divide-[var(--color-line)]">
              <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]"
                  style={{ background: SLAB_NEUTRAL }}
                />
                <span className="w-28 shrink-0 text-small">Non-negotiables</span>
                <span className="min-w-0 flex-1 text-micro tabular-nums text-[var(--color-muted)]">
                  {data.habits.done} of {data.habits.scheduled}{" "}
                  {asRate(data.constants.perHabit)}
                </span>
                <span className="shrink-0 text-small tabular-nums">
                  {data.habits.points}
                </span>
              </li>
              <li className="flex flex-wrap items-baseline gap-x-3 gap-y-1 py-2.5">
                <span
                  aria-hidden
                  className="h-2 w-2 shrink-0 translate-y-[-1px] rounded-[2px]"
                  style={{ background: SLAB_NEUTRAL }}
                />
                <span className="w-28 shrink-0 text-small">Calories</span>
                <span className="min-w-0 flex-1 text-micro tabular-nums text-[var(--color-muted)]">
                  {data.habits.calories ?? 0} of {data.habits.calorieFloor}
                  {data.habits.calorieCounted ? "" : " · floor not reached"}
                </span>
                <span className="shrink-0 text-small tabular-nums">
                  {data.habits.calorieCounted ? data.constants.perHabit : 0}
                </span>
              </li>
            </ul>
          </div>

          {/* WHAT DID NOT COUNT, and why. The half of this screen that actually answers a
              question — everything above is visible on the bar already. */}
          {data.ignored.length > 0 && (
            <div className="mt-5">
              <div className="section-head">
                <h3 className="text-small font-semibold">Didn&apos;t count</h3>
                <span className="text-micro text-[var(--color-muted)]">
                  scheduled, but earned nothing
                </span>
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
