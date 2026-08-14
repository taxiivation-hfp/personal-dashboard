"use client";

import { useEffect, useRef, useState } from "react";
import { splitSession } from "@/lib/sessions";

/**
 * One SKILL SESSION, written as a document.
 *
 * Skills used to be logged in minutes, from three quick-add chips. That measured the wrong
 * thing twice over: it made Portfolio a stopwatch, and it duplicated the Physical pillar's
 * "Misc" workout — Calisthenics was one activity with two places to record it, so it got
 * written in whichever the owner happened to remember and both counts were wrong. Neither
 * said what was actually done.
 *
 * So this is deliberately the WORKOUT dialog's shape and idiom: a serif writing surface on
 * the recessed panel, plain text, saving IS logging, and THE FIRST LINE IS THE TITLE via the
 * same `splitSession` the gym log uses. A second convention for the same object is how two
 * screens end up disagreeing about one session.
 *
 * It is leaner than WorkoutLog in one respect, on purpose. That dialog puts last week's
 * numbers beside the textarea because a lift is written AGAINST them — closing the log to
 * go and find them is how a set gets guessed at. An hour of Mandarin is not written against
 * last Tuesday's, so the fortnight's sessions sit underneath as a way BACK into a document
 * rather than a reference pane.
 */

export type SkillSession = { id: number; date: string; note: string };

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const dayLabel = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", { day: "numeric", month: "short" });

export default function SkillLog({
  name,
  date,
  today,
  session,
  recent,
  hue,
  onSave,
  onDelete,
  onPick,
  onClose,
}: {
  name: string;
  /** The day the screen is showing — where a NEW session lands. */
  date: string;
  /** The real today, the one cap the picker may not pass. Separate from `date` because
   *  Today can show a past day: capping at the VIEWED day would make a session you did
   *  yesterday unwritable from a screen showing last Tuesday. */
  today?: string;
  /** The session being edited, or null when writing a new one. */
  session: SkillSession | null;
  /** This skill's sessions in the window, newest first. */
  recent: SkillSession[];
  hue: string;
  /** The date travels BACK on save, because the dialog may have moved it. */
  onSave: (note: string, day: string) => Promise<void>;
  onDelete: () => Promise<void>;
  /** Choose another session to edit, or null to start a new one. The caller re-keys this
   *  component on the chosen id, which is what re-seeds the textarea. */
  onPick: (s: SkillSession | null) => void;
  onClose: () => void;
}) {
  /**
   * THE DAY THIS DIALOG IS ABOUT — the session's own when editing one, the screen's when
   * writing a new one. Seeded from props and never synced back: the call site keys this
   * component by session id, so picking another session REMOUNTS it. Without that, choosing
   * a second session would leave the first one's text in a box now claiming another day.
   */
  const origin = session?.date ?? date;
  const [note, setNote] = useState(session?.note ?? "");
  const [day, setDay] = useState(origin);
  const [busy, setBusy] = useState(false);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // Straight into typing — the whole point is that logging costs nothing.
    areaRef.current?.focus();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    try {
      await fn();
      onClose();
    } finally {
      setBusy(false);
    }
  };

  // An empty document must not become a session: it would be a row nobody wrote, counting
  // toward the ring. The server refuses it too — this only keeps the button honest.
  const canSave = note.trim().length > 0 && !busy;

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,560px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        {/* The SKILL's own hue — the one its arc wears on the Portfolio ring — so the
            dialog and the segment it was opened from are visibly the same thing. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span
            aria-hidden
            className="h-2 w-2 shrink-0 rounded-full"
            style={{ background: hue }}
          />
          <span className="truncate">{name}</span>
        </h2>
        <button
          onClick={onClose}
          className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
        >
          close
        </button>
      </div>

      <label className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
        <span className="flex items-center gap-2">
          <span>on</span>
          <input
            type="date"
            value={day}
            max={today ?? date}
            onChange={(e) => setDay(e.target.value || day)}
            disabled={busy}
            className="rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-2 py-1 text-small tabular-nums text-[var(--color-ink)] outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
          />
        </span>
        {day !== origin && (
          <button
            type="button"
            onClick={() => setDay(origin)}
            className="underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            {/* Back to the day the dialog OPENED on — the SESSION's day when editing one,
                which is not always today either way. */}
            back to{" "}
            {origin === (today ?? date) ? "today" : dayLabel(origin)}
          </button>
        )}
      </label>

      {/* A writing surface, not a field — the same recessed sheet the workout log keeps,
          for the same reason: this is a document, and the app's other inputs are lines. */}
      <textarea
        ref={areaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        placeholder={"What did you work on?\nThe first line becomes its title."}
        spellCheck={false}
        rows={12}
        aria-label={`${name} session`}
        className="mt-4 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-3 font-serif text-body leading-[1.7] outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
      />

      <div className="mt-5 flex items-center justify-between gap-3">
        {session ? (
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
        {/* The accent, not the skill hue: every skill's dialog ends here, so filling the
            action with the hue would categorise nothing and give the app a second accent. */}
        <button
          onClick={() => run(() => onSave(note.trim(), day))}
          disabled={!canSave}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : session ? "Save" : "Log it"}
        </button>
      </div>

      {/* The fortnight's sessions — a way BACK to a document, not a reference you write
          against. Absent entirely when there are none: an empty heading over nothing is
          furniture. */}
      {recent.length > 0 && (
        <div className="mt-5 border-t border-[var(--color-line)] pt-3">
          <div className="section-head">
            <h3 className="text-small font-semibold">Last 14 days</h3>
            {session && (
              <button
                type="button"
                onClick={() => onPick(null)}
                disabled={busy}
                className="shrink-0 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
              >
                new session
              </button>
            )}
          </div>
          <ul className="divide-y divide-[var(--color-line)]">
            {recent.map((s) => {
              // A stored title never applies here — skill sessions have no imported
              // history — but splitSession is the ONE place that rule lives, so it is
              // asked rather than reimplemented.
              const { title } = splitSession({ note: s.note, title: null });
              return (
                <li key={s.id}>
                  <button
                    type="button"
                    onClick={() => onPick(s)}
                    disabled={busy}
                    className={`-mx-2 flex w-[calc(100%+1rem)] items-baseline gap-3 rounded-lg px-2 py-2.5 text-left transition-colors hover:bg-[var(--color-panel-2)] disabled:opacity-40 ${
                      session?.id === s.id ? "bg-[var(--color-panel-2)]" : ""
                    }`}
                  >
                    <span className="min-w-0 flex-1 truncate text-small">
                      {title || (
                        <span className="text-[var(--color-muted)]">
                          untitled
                        </span>
                      )}
                    </span>
                    <span className="shrink-0 text-micro tabular-nums text-[var(--color-muted)]">
                      {dayLabel(s.date)}
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>
      )}
    </dialog>
  );
}
