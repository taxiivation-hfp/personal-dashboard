"use client";

import { useEffect, useRef, useState } from "react";
import DayChart, { type ChartPoint } from "./DayChart";
import { CALORIE_FLOOR } from "@/lib/productivity";
import type { CalorieDay, CalorieEntry } from "@/lib/queries";

/**
 * THE FOOD LOG, in the WorkoutLog's dialog.
 *
 * The spread, at the owner's direction: the RECORDS own the left — the day being written,
 * and under it the past fortnight, one scrolling column — and the right pane is the month
 * drawn as bars, the record page's own calories chart with its pointer answers and the
 * floor's one red dotted line. Writing on one side, the shape of it on the other.
 *
 * ANY DAY, not just today. The log opens on the day in front of you, and the date line
 * moves it — the same catching-up rule the workout log established, because a dinner you
 * forgot to write down is not a dinner that didn't happen. Every past day in the sidebar
 * carries its own way in ("edit").
 *
 * Still no food database, no barcode, no API. The name is TEXT — a label you will
 * recognise later, not a record that means anything to a machine.
 */

/** The chart's window. A month of bars beside a fortnight of rows — the chart is context
 *  for the records, so it reaches a little further back than they do. */
const TREND_DAYS = 30;

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const dayHeading = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
  });

/** Each pane scrolls itself, so the dialog stays one spread instead of a long page. */
const PANE =
  "overflow-y-auto max-h-[min(60dvh,480px)] lg:[scrollbar-gutter:stable]";

export default function CalorieLog({
  date,
  total,
  entries,
  initialDay,
  onChanged,
  onClose,
}: {
  /** TODAY — the anchor the picker cannot pass and the history is measured back from. */
  date: string;
  /** Today's figures, as a seed so the dialog paints instantly; its own fetch is the
   *  authority thereafter. */
  total: number | null;
  entries: CalorieEntry[];
  /** Open already looking at this day — the /calories backlog's "edit" comes in here. */
  initialDay?: string;
  /** Fired after every write so whatever mounted this stays in agreement. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const [name, setName] = useState("");
  const [kcal, setKcal] = useState("");
  const [busy, setBusy] = useState(false);
  /** WHICH day the main pane is writing. Today by default; the date line moves it. */
  const [day, setDay] = useState(initialDay ?? date);
  /** The viewed day's record. Seeded from props for an instant first paint, then owned by
   *  the fetch below — one authority, whatever day is up. */
  const [view, setView] = useState<{
    total: number | null;
    entries: CalorieEntry[];
  }>({ total, entries });
  /** Bumped after every write; everything that reads re-reads. */
  const [v, setV] = useState(0);
  // null while the fetch is out: an empty history and an unanswered one are different
  // facts, and printing "nothing yet" during the wait would state the wrong one.
  const [days, setDays] = useState<CalorieDay[] | null>(null);
  /** The month as bars, for the right pane. Same null-while-loading rule. */
  const [series, setSeries] = useState<ChartPoint[] | null>(null);
  const [showChart, setShowChart] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const nameRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // Straight into typing — logging must cost nothing, same rule as the workout log.
    nameRef.current?.focus();
  }, []);

  // The viewed day's record — re-read on every day change and after every write.
  useEffect(() => {
    let alive = true;
    fetch(`/api/calories?date=${day}`)
      .then((r) => r.json())
      .then(
        (d: { error?: unknown; total?: number | null; entries?: CalorieEntry[] }) =>
          alive &&
          !d.error &&
          setView({ total: d.total ?? null, entries: d.entries ?? [] }),
      )
      .catch(() => {});
    return () => {
      alive = false;
    };
  }, [day, v]);

  useEffect(() => {
    let alive = true;
    fetch(`/api/calories?to=${date}`)
      .then((r) => (r.ok ? r.json() : { days: [] }))
      .then((d: { days?: CalorieDay[] }) => alive && setDays(d.days ?? []))
      .catch(() => alive && setDays([]));
    return () => {
      alive = false;
    };
  }, [date, v]);

  // Re-read whenever anything was written — a bar that lags the row you just logged
  // would be the dialog disagreeing with itself.
  useEffect(() => {
    let alive = true;
    fetch(`/api/trends?days=${TREND_DAYS}&to=${date}`)
      .then((r) => r.json())
      .then(
        (d: {
          error?: unknown;
          series?: { date: string; calories: number | null }[];
        }) =>
          alive &&
          !d.error &&
          setSeries(
            (d.series ?? []).map((s) => ({ date: s.date, value: s.calories })),
          ),
      )
      .catch(() => alive && setSeries([]));
    return () => {
      alive = false;
    };
  }, [date, v]);

  async function log() {
    const n = Number(kcal.replace(/[,\s]/g, ""));
    if (!Number.isFinite(n) || n < 1) return;
    setBusy(true);
    await fetch("/api/calories", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ date: day, kcal: n, note: name.trim() || null }),
    }).catch(() => {});
    setName("");
    setKcal("");
    setBusy(false);
    setV((x) => x + 1);
    onChanged();
    nameRef.current?.focus();
  }

  /** By id, not "last": after toast, laksa and a typo, the entry you want gone is usually
   *  not the most recent. */
  async function remove(id: number) {
    setBusy(true);
    await fetch(`/api/calories?id=${id}&date=${day}`, {
      method: "DELETE",
    }).catch(() => {});
    setBusy(false);
    setV((x) => x + 1);
    onChanged();
  }

  const met = (view.total ?? 0) >= CALORIE_FLOOR;

  return (
    // The WorkoutLog's dialog, measure for measure — see the header comment.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,920px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)] lg:overflow-hidden"
    >
      <div className="section-head">
        {/* Physical's hue, because the floor is the training floor — the same dot the
            workout log wears, saying which pillar this document belongs to. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: "var(--color-physical)" }}
          />
          Calories
        </h2>
        <div className="flex shrink-0 items-center gap-4">
          {/* The whole backlog, on its own page — the same show-all the workout log
              carries, to the same kind of place. */}
          <a
            href="/calories"
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            show all
          </a>
          <button
            onClick={onClose}
            disabled={busy}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
          >
            Close
          </button>
        </div>
      </div>

      {/* WHEN, editable — the workout log's date line, word for word. Max is TODAY: a
          dinner in the future has not happened, and this is a record. The floor rides on
          the same line: a total walking toward it, muted once met. */}
      <label className="mt-2 flex flex-wrap items-center gap-2 text-micro text-[var(--color-muted)]">
        <span>on</span>
        <input
          type="date"
          value={day}
          max={date}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded border border-transparent bg-transparent px-1 py-0.5 font-serif text-micro text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-line)] focus:border-[var(--color-accent)]"
        />
        {day !== date && (
          <button
            type="button"
            onClick={() => setDay(date)}
            className="underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            back to today
          </button>
        )}
        <span aria-hidden>·</span>
        <span
          className={`tabular-nums ${met ? "" : "text-[var(--color-ink)]"}`}
        >
          {view.total ?? 0}/{CALORIE_FLOOR}
        </span>
        <span>— a floor to reach, never a ceiling to stay under.</span>
      </label>

      <div className="mt-4 lg:grid lg:grid-cols-[1.35fr_1fr]">
        <div className={`${PANE} lg:pr-5`}>
          {/* THE LOGGING LINE, above the record it feeds: name, number, done. Enter moves
              through it, so a meal costs three keystrokes more than its number alone. */}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              log();
            }}
            className="flex items-end gap-3"
          >
            {/* The FOOD is the owner's word for it, so it takes the serif — same authorship
                rule as a goal title. Optional: a bare number is still a true entry. */}
            <input
              ref={nameRef}
              value={name}
              onChange={(e) => setName(e.target.value)}
              disabled={busy}
              placeholder="Food name"
              aria-label="Food name"
              maxLength={80}
              className="min-w-0 flex-1 border-b border-[var(--color-line-strong)] bg-transparent pb-1 font-serif text-body outline-none transition-colors placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-accent)]"
            />
            <input
              value={kcal}
              onChange={(e) => setKcal(e.target.value)}
              disabled={busy}
              inputMode="numeric"
              placeholder="kcal"
              aria-label="Calories"
              className="w-[4.5rem] shrink-0 border-b border-[var(--color-line-strong)] bg-transparent pb-1 text-right text-body tabular-nums outline-none transition-colors placeholder:text-[var(--color-placeholder)] focus:border-[var(--color-accent)]"
            />
            {/* The accent, like the workout log's "Log it" — one vocabulary for "this is
                the action". Disabled until there is a number, because the number is the
                entry; the name is only its label. */}
            <button
              type="submit"
              disabled={busy || !kcal.trim()}
              className="shrink-0 rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "…" : "Log it"}
            </button>
          </form>

          {/* THE VIEWED DAY'S RECORD, under the line that writes it. Newest last — the day
              reads downward the way it was eaten. Every row is removable, because in an
              additive log a mistyped 20000 must never be a permanent fact. */}
          {view.entries.length === 0 ? (
            <p className="mt-6 text-small text-[var(--color-muted)]">
              Nothing logged {day === date ? "today" : `on ${dayHeading(day)}`}{" "}
              yet.
            </p>
          ) : (
            <ul className="mt-5 divide-y divide-[var(--color-line)] border-t border-[var(--color-line)]">
              {view.entries.map((e) => (
                <li key={e.id} className="flex items-baseline gap-3 py-2">
                  <span className="min-w-0 flex-1 truncate font-serif text-small">
                    {e.note || (
                      <span className="text-[var(--color-muted)]">unnamed</span>
                    )}
                  </span>
                  <span className="shrink-0 text-small tabular-nums">
                    {e.kcal}
                  </span>
                  <button
                    onClick={() => remove(e.id)}
                    disabled={busy}
                    aria-label={`Remove ${e.note || "this entry"}`}
                    className="shrink-0 px-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
                  >
                    ×
                  </button>
                </li>
              ))}
              <li className="flex items-baseline gap-3 py-2">
                <span className="min-w-0 flex-1 text-micro text-[var(--color-muted)]">
                  total
                </span>
                <span className="shrink-0 pr-[1.375rem] text-small font-semibold tabular-nums">
                  {view.total ?? 0}
                </span>
              </li>
            </ul>
          )}

          {/* THE PAST, under today in the same scrolling column — the records read as one
              document, newest day first. Each day carries its own way in: "edit" points
              the pane above at that day, and the writing line writes THERE. */}
          <div className="mt-6">
            <div className="section-head">
              <h3 className="text-small font-semibold">Past days</h3>
              <span className="shrink-0 text-micro text-[var(--color-muted)]">
                last 14
              </span>
            </div>

            {days && days.length === 0 && (
              <p className="pt-3 text-small text-[var(--color-muted)]">
                Nothing logged yet.
              </p>
            )}

            {days && days.length > 0 && (
              <ul className="divide-y divide-[var(--color-line)]">
                {days.map((d) => (
                  <li key={d.date} className="py-3">
                    <div className="flex items-baseline gap-3">
                      <span className="min-w-0 flex-1 text-micro text-[var(--color-muted)]">
                        {dayHeading(d.date)}
                      </span>
                      <span className="shrink-0 text-small tabular-nums">
                        {d.total}
                        <span className="text-micro text-[var(--color-muted)]">
                          /{CALORIE_FLOOR}
                        </span>
                      </span>
                      <button
                        onClick={() => setDay(d.date)}
                        className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                      >
                        edit
                      </button>
                    </div>
                    <ul className="mt-1.5">
                      {d.entries.map((e) => (
                        <li
                          key={e.id}
                          className="flex items-baseline gap-3 py-0.5"
                        >
                          <span className="min-w-0 flex-1 truncate font-serif text-small text-[var(--color-muted)]">
                            {e.note || "unnamed"}
                          </span>
                          <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                            {e.kcal}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>

        {/* On a phone there is no room for a second column, and the chart must not cost
            the "straight into typing" open. It waits behind a quiet line instead. */}
        <button
          type="button"
          onClick={() => setShowChart((v2) => !v2)}
          aria-expanded={showChart}
          aria-controls="calorie-chart"
          className="mt-5 block text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline lg:hidden"
        >
          {showChart ? "Hide the month" : "Show the month"}
        </button>

        {/* THE MONTH, down the right: the record page's own calories chart — bars from
            zero, a day with no entry drawing nothing, the floor's red dotted line, the
            pointer answering with the date and the exact total. */}
        <div
          id="calorie-chart"
          className={`mt-4 lg:mt-0 lg:border-l lg:border-[var(--color-line)] lg:pl-5 ${showChart ? "" : "hidden"} lg:block`}
        >
          <div className="section-head">
            <h3 className="text-small font-semibold">The month</h3>
            <span className="shrink-0 text-micro text-[var(--color-muted)]">
              last {TREND_DAYS} days
            </span>
          </div>

          <div className="mt-3">
            {series == null ? (
              <p className="py-8 text-small text-[var(--color-muted)]">
                Loading…
              </p>
            ) : (
              <DayChart
                points={series}
                form="bars"
                unit="kcal"
                marker={CALORIE_FLOOR}
                height={180}
                emptyNote="Nothing logged this month yet."
              />
            )}
          </div>
        </div>
      </div>
    </dialog>
  );
}
