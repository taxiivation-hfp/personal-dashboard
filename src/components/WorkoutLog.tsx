"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkoutKind } from "@/lib/rings";
import { splitSession } from "@/lib/sessions";

/**
 * Three kinds, three SEPARATE documents per day.
 *
 * A lift and a run on the same Tuesday are different sessions with different notes;
 * merging them into one field would lose that, and the rings count them separately
 * anyway. Saving IS logging — there is no second "did it" toggle to forget.
 *
 * Plain text on purpose. A workout log is a list of numbers you scribble between sets,
 * not a form: any structure imposed here would be structure to fight on a bad day, and
 * the rescued Discord history is already free text.
 *
 * The dialog is one document in two columns — the session being written on the left, the
 * last five of the same kind on the right, divided by a rule rather than a gap, the same
 * spread idiom the day itself uses. Last week's numbers are what today's are written
 * against, and closing the log to go and find them is how a set gets guessed at.
 */

/** One SESSION, not one kind-per-day: a day can hold two lifts, so the id is what
 *  distinguishes them. */
export type Workout = {
  id: number;
  /** The day it happened — its OWN day, which is not always the day the screen is showing.
   *  Editing opens here; see `origin` below. */
  date: string;
  kind: WorkoutKind;
  title: string | null;
  note: string | null;
};

const PLACEHOLDER: Record<WorkoutKind, string> = {
  strength: "Beat the Logbook. Stimulate, Don't Annihilate.",
  cardio: "Pace yourself. Focus on your breathing, focus on your form.",
};

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

/** Each pane scrolls itself, so the dialog stays one spread instead of a long page the
 *  textarea disappears up. */
const PANE =
  "overflow-y-auto max-h-[min(60dvh,480px)] lg:[scrollbar-gutter:stable]";

export default function WorkoutLog({
  kind,
  label,
  date,
  today,
  workout,
  hue,
  onSave,
  onDelete,
  onClose,
}: {
  kind: WorkoutKind;
  label: string;
  date: string;
  /** The real today — the one thing the picker may not pass. Separate from `date` since
   *  Today learned to show a past day: capping at the VIEWED day would have made a
   *  session you did yesterday unwritable from a screen showing last Tuesday. */
  today?: string;
  workout: Workout | null;
  hue: string;
  /** The date is passed BACK on save, because the dialog may have changed it. */
  onSave: (note: string, date: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(workout?.note ?? "");
  /**
   * THE DAY THIS DIALOG IS ABOUT — the session's own when editing one, the screen's when
   * writing a new one.
   *
   * The distinction is the fix for a real bug rather than a nicety. Both callers used to
   * pass the screen's date and the dialog opened on it unconditionally; SessionHistory even
   * carried a comment arguing that the dialog "cannot tell" an edit from a fresh write. It
   * can — `workout` is null for one and not the other. Opening a 3 August session on the
   * 12th put the wrong date in the picker, and saving then sent that wrong date to a write
   * that took it literally.
   */
  const origin = workout?.date ?? date;
  /**
   * WHEN it happened, and it is editable.
   *
   * Sessions get written up after the fact — on the train home, or on Sunday for the week —
   * and a log that can only record today is a log you fall behind on and then abandon.
   * Moving it MOVES the session now; it used to silently clone it onto the new day.
   */
  const [day, setDay] = useState(origin);
  const [busy, setBusy] = useState(false);
  // null while the fetch is out: an empty list and an unanswered one are different facts,
  // and printing "Nothing logged yet." during the wait would state the wrong one.
  const [recent, setRecent] = useState<Workout[] | null>(null);
  const [showHistory, setShowHistory] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // Straight into typing — the whole point is that logging costs nothing.
    areaRef.current?.focus();
  }, []);

  useEffect(() => {
    let alive = true;
    const q = new URLSearchParams({ kind, before: day, limit: "5" });
    // History is context, never the reason the dialog opened: a failed fetch leaves the
    // pane empty and the writing surface untouched.
    fetch(`/api/gym/recent?${q}`)
      .then((r) => (r.ok ? r.json() : { recent: [] }))
      .then((d: { recent?: Workout[] }) => alive && setRecent(d.recent ?? []))
      .catch(() => alive && setRecent([]));
    return () => {
      alive = false;
    };
  }, [kind, day]);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } finally {
      setBusy(false);
    }
  };



  return (
    // A dialog is the one thing genuinely lifted off the page, so it keeps a panel where
    // the sections lost theirs.
    //
    // The dialog scrolls only below lg, where the two panes stack and can outrun 92dvh
    // between them. At lg it never does: the panes are side by side and each carries its
    // own scroller, which is what keeps the spread readable.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,920px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)] lg:overflow-hidden"
    >
      <div className="section-head">
        {/* The hue is the pillar's, not this kind's — it categorises, so the label beside
            it carries the meaning and the dot only tints it. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: hue }}
          />
          {label}
        </h2>
        <button
          onClick={onClose}
          disabled={busy}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
        >
          Close
        </button>
      </div>

      {/* The date reads as a line of prose until you touch it, which is what keeps a field
          nobody usually needs from looking like a form. max is TODAY: a session in the
          future has not happened, and this is a record. */}
      <label className="mt-2 flex items-center gap-2 text-micro text-[var(--color-muted)]">
        <span>on</span>
        <input
          type="date"
          value={day}
          max={today ?? date}
          onChange={(e) => e.target.value && setDay(e.target.value)}
          className="rounded border border-transparent bg-transparent px-1 py-0.5 font-serif text-micro text-[var(--color-ink)] outline-none transition-colors hover:border-[var(--color-line)] focus:border-[var(--color-accent)]"
        />
        {day !== origin && (
          <button
            type="button"
            onClick={() => setDay(origin)}
            className="underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            {/* Back to the day the dialog OPENED on — which is the SESSION's day when
                editing one, and not always today either way. Undoing a stray tap on the
                picker must put the date back where it was, not where the screen is. */}
            back to{" "}
            {origin === (today ?? date)
              ? "today"
              : onDay(origin).toLocaleDateString("en-AU", {
                  day: "numeric",
                  month: "short",
                })}
          </button>
        )}
      </label>

      {/* A 1px rule between the columns, not a gap: one document in two columns is the
          spread the rest of the app is built on. The toggle is a grid child too, but
          display:none removes it from the grid entirely above lg. */}
      <div className="mt-4 lg:grid lg:grid-cols-[1.35fr_1fr]">
        <div className={`${PANE} lg:pr-5`}>
          {/* An imported title is rescued Discord history — the owner's words, so serif,
              but muted because it is context rather than the document being written. */}
          {workout?.title && (
            <p className="font-serif text-body text-[var(--color-muted)]">
              {workout.title}
            </p>
          )}

          {/* A writing surface, not a field: it keeps its bordered sheet where the app's
              other inputs became lines. Recessed inside the lifted dialog, and tabular so
              a column of weights lines up the way it would on paper. */}
          <textarea
            ref={areaRef}
            value={note}
            onChange={(e) => setNote(e.target.value)}
            disabled={busy}
            placeholder={PLACEHOLDER[kind]}
            spellCheck={false}
            rows={14}
            aria-label={`${label} log`}
            className={`w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-3 font-serif text-body leading-[1.7] tabular-nums outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60 ${workout?.title ? "mt-4" : ""}`}
          />

          <div className="mt-5 flex items-center justify-between gap-3">
            {/* Imported sessions carry a title — that is rescued Discord history and must
                not be deletable from a passing tap. */}
            {workout && !workout.title ? (
              <button
                onClick={() => run(onDelete)}
                disabled={busy}
                className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
              >
                Remove this session
              </button>
            ) : (
              <span />
            )}
            {/* The accent, not the pillar hue: the same hue arrives here for all three
                kinds, so filling the action with it would categorise nothing and give the
                app a second accent. */}
            <button
              onClick={() => run(() => onSave(note, day))}
              disabled={busy}
              className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
            >
              {busy ? "Saving…" : workout ? "Save" : "Log it"}
            </button>
          </div>
        </div>

        {/* On a phone there is no room for a second column, and the history must not cost
            the "straight into typing" open. It waits behind a quiet line instead. */}
        <button
          type="button"
          onClick={() => setShowHistory((v) => !v)}
          aria-expanded={showHistory}
          aria-controls="workout-history"
          className="mt-5 block text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline lg:hidden"
        >
          {showHistory ? "Hide last 5" : "Show last 5"}
        </button>

        {/* READ-ONLY, and deliberately so: these are finished sessions, some of them
            rescued Discord history that exists nowhere else. A pane you can edit by
            accident while looking a number up is a pane that eventually loses one. */}
        <div
          id="workout-history"
          className={`${PANE} mt-4 lg:mt-0 lg:border-l lg:border-[var(--color-line)] lg:pl-5 ${showHistory ? "" : "hidden"} lg:block`}
        >
          <div className="section-head">
            <h3 className="text-small font-semibold">Last 5</h3>
            {/* The whole log is a page, not a taller pane. This one is REFERENCE — last
                week is what today is written against — and a scrollable list of two hundred
                does not belong beside a textarea. */}
            <a
              href="/sessions"
              className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
            >
              show all
            </a>
          </div>

          {recent && recent.length === 0 && (
            <p className="pt-3 text-small text-[var(--color-muted)]">
              Nothing logged yet.
            </p>
          )}

          {recent && recent.length > 0 && (
            <ul className="divide-y divide-[var(--color-line)]">
              {recent.map((s) => (
                <li key={s.id} className="page-margin py-3">
                  <div className="text-right text-micro tabular-nums text-[var(--color-muted)]">
                    {onDay(s.date).toLocaleDateString("en-AU", {
                      weekday: "short",
                      day: "numeric",
                      month: "short",
                    })}
                  </div>

                  {/* THE FIRST LINE IS THE TITLE — derived, never stored, so a session
                      written here reads the same way the rescued history does. See
                      splitSession: it is one document, and this is a view of it. */}
                  {(() => {
                    const { title, body } = splitSession(s);
                    return (
                      <div className="min-w-0">
                        {title && (
                          <p className="font-serif text-small text-[var(--color-muted)]">
                            {title}
                          </p>
                        )}
                        {/* pre-wrap because the line breaks ARE the log — a set per line is
                            the only structure this document has. */}
                        {body && (
                          <p className="whitespace-pre-wrap font-serif text-small text-[var(--color-ink)]">
                            {body}
                          </p>
                        )}
                      </div>
                    );
                  })()}
                </li>
              ))}
            </ul>
          )}
        </div>
      </div>
    </dialog>
  );
}
