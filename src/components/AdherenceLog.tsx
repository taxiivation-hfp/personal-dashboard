"use client";

import { useEffect, useRef, useState } from "react";
import type { Block } from "@/lib/adherence";
import type { HabitView } from "@/lib/queries";

/**
 * WHAT A DAY'S ADHERENCE WAS MADE OF, split into what was adhered to and what was not.
 *
 * The counterpart to ProductivityLog, and it exists for the same reason: the bar on the
 * chart is a shape you glance at, and the arithmetic belongs one deliberate tap away. A
 * drill-down you opened on purpose is an explanation; a number sitting on a chart is a
 * score.
 *
 * IT SHOWS BOTH HALVES, blocks AND non-negotiables, because adherence is an even split of
 * the two — 50 points of blocked hours worked, 50 of non-negotiables ticked. A sheet
 * showing only the calendar would be explaining half a figure while appearing to explain
 * all of it, which is worse than explaining none.
 *
 * THE SPLIT IS "ADHERED" AND "NOT YET", never "failed". Everything in the second column is
 * a thing that did not add — it is not a thing held against you, because nothing in this
 * app's arithmetic subtracts. The figure climbs from zero and a day ends wherever it got
 * to; this sheet is where that becomes visible rather than merely true.
 *
 * A PARTIAL DRIFT APPEARS IN BOTH COLUMNS, correctly. An afternoon worked to 40% put 40% of
 * itself into the figure, so the worked share is stated on the left and the forfeited
 * remainder on the right. Anything else would make the sheet disagree with the ring it
 * exists to explain.
 */

type Payload = {
  date: string;
  blocks: Block[];
  habits: HabitView[];
  adherence: { pct: number | null } | null;
};

/** "09:00"–"10:30" -> "1h 30m". null when the block carries no duration — an all-day event
 *  is excluded from adherence entirely, and printing a span for one would imply otherwise. */
function span(b: Block): string | null {
  if (!b.time_start || !b.time_end) return null;
  const mins = (t: string) => {
    const [h, m] = t.split(":").map(Number);
    return (h ?? 0) * 60 + (m ?? 0);
  };
  const d = mins(b.time_end) - mins(b.time_start);
  if (!Number.isFinite(d) || d <= 0) return null;
  const h = Math.floor(d / 60);
  const m = d % 60;
  return h ? (m ? `${h}h ${m}m` : `${h}h`) : `${m}m`;
}

function Row({
  title,
  note,
  tone,
}: {
  title: string;
  note?: string | null;
  tone?: string;
}) {
  return (
    <li className="flex items-baseline gap-2 py-1.5">
      <span
        aria-hidden
        className="mt-1.5 h-1.5 w-1.5 shrink-0 rounded-full"
        style={{ background: tone ?? "var(--color-line-strong)" }}
      />
      <span className="min-w-0 flex-1 font-serif text-small leading-snug">
        {title}
      </span>
      {note && (
        <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
          {note}
        </span>
      )}
    </li>
  );
}

export default function AdherenceLog({
  date,
  onClose,
}: {
  date: string;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  // null while the fetch is out. An empty day and an unanswered one are different facts,
  // and printing "nothing marked" during the wait states the wrong one.
  const [data, setData] = useState<Payload | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  useEffect(() => {
    let alive = true;
    fetch(`/api/today?date=${date}`)
      .then((r) => (r.ok ? r.json() : Promise.reject(new Error("unreachable"))))
      .then((d: Payload) => alive && setData(d))
      .catch(() => alive && setError("Could not read that day."));
    return () => {
      alive = false;
    };
  }, [date]);

  const blocks = data?.blocks ?? [];
  // A block with no duration is excluded from adherence entirely — an all-day event is not
  // eight hours of work you failed to do — so it is excluded from its explanation too.
  const timed = blocks.filter((b) => span(b) != null);

  const adhered = timed.filter((b) => b.state === "adhered");
  const partial = timed.filter(
    (b) => b.state === "drifted" && (b.workedFraction ?? 0) > 0,
  );
  const missed = timed.filter(
    (b) =>
      b.state !== "adhered" &&
      !(b.state === "drifted" && (b.workedFraction ?? 0) > 0),
  );

  const habits = data?.habits ?? [];
  const ticked = habits.filter((h) => h.done);
  const unticked = habits.filter((h) => !h.done);

  const pct = data?.adherence?.pct ?? null;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      className="w-[min(94vw,720px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="min-w-0 truncate text-small font-semibold">
          {new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
            weekday: "long",
            day: "numeric",
            month: "long",
          })}
          {pct != null && (
            <span className="ml-2 font-normal tabular-nums text-[var(--color-muted)]">
              {pct}%
            </span>
          )}
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          close
        </button>
      </div>

      {error && (
        <p className="pt-4 text-small text-[var(--color-muted)]">{error}</p>
      )}
      {!error && data == null && (
        <p className="pt-4 text-small text-[var(--color-muted)]">reading…</p>
      )}

      {data != null && (
        <div className="mt-4 lg:grid lg:grid-cols-2 lg:gap-5">
          {/* WHAT ADDED. Left, and first on a phone — the figure climbs from zero, so this
              is the column that built it. */}
          <div className="lg:border-r lg:border-[var(--color-line)] lg:pr-5">
            <h3 className="text-micro font-semibold text-[var(--color-muted)]">
              Adhered
            </h3>
            <ul className="mt-1 divide-y divide-[var(--color-line)]">
              {adhered.map((b) => (
                <Row
                  key={b.event_id}
                  title={b.title || "(busy)"}
                  note={span(b)}
                  tone="var(--color-adhered)"
                />
              ))}
              {partial.map((b) => (
                <Row
                  key={b.event_id}
                  title={b.title || "(busy)"}
                  // The share that COUNTED. The remainder appears opposite, which is the
                  // honest way to draw a half-lived afternoon.
                  note={`${Math.round((b.workedFraction ?? 0) * 100)}% of ${span(b)}`}
                  tone="var(--color-adhered)"
                />
              ))}
              {ticked.map((h) => (
                <Row key={`h${h.id}`} title={h.name} tone="var(--color-adhered)" />
              ))}
              {adhered.length + partial.length + ticked.length === 0 && (
                <li className="py-2 text-small text-[var(--color-muted)]">
                  Nothing marked on this day.
                </li>
              )}
            </ul>
          </div>

          {/* WHAT DID NOT ADD. Never "failed" — nothing here was subtracted from anything,
              and the wording has to keep saying so or the sheet becomes a scorecard. */}
          <div className="mt-5 lg:mt-0">
            <h3 className="text-micro font-semibold text-[var(--color-muted)]">
              Didn&apos;t add
            </h3>
            <ul className="mt-1 divide-y divide-[var(--color-line)]">
              {missed.map((b) => (
                <Row
                  key={b.event_id}
                  title={b.title || "(busy)"}
                  note={
                    b.state === "drifted"
                      ? `drifted · ${span(b)}`
                      : b.state === "skipped"
                        ? `skipped · ${span(b)}`
                        : `unmarked · ${span(b)}`
                  }
                />
              ))}
              {partial.map((b) => (
                <Row
                  key={`rest${b.event_id}`}
                  title={b.title || "(busy)"}
                  note={`the other ${100 - Math.round((b.workedFraction ?? 0) * 100)}%`}
                />
              ))}
              {unticked.map((h) => (
                <Row key={`u${h.id}`} title={h.name} />
              ))}
              {missed.length + partial.length + unticked.length === 0 && (
                <li className="py-2 text-small text-[var(--color-muted)]">
                  Everything on this day was accounted for.
                </li>
              )}
            </ul>
          </div>
        </div>
      )}

      <p className="mt-5 border-t border-[var(--color-line)] pt-3 text-micro leading-relaxed text-[var(--color-muted)]">
        Adherence is an even split: half the blocked hours you worked, half the
        non-negotiables you ticked. It only ever climbs — nothing on the right
        was taken off anything, it simply hasn&apos;t been added.
      </p>
    </dialog>
  );
}
