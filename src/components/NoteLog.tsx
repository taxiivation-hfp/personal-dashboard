"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ONE DOCUMENT, for a non-negotiable that carries one — outreach and reading, today.
 *
 * The third writing surface in the app and deliberately the plainest. A workout dialog puts
 * last week's numbers beside the textarea because a lift is written against them; a skill
 * dialog lists the fortnight because a session is one of many. Neither is true here: a
 * non-negotiable holds exactly ONE entry per day by the table's own UNIQUE constraint, and
 * the row you opened it from already names the day. So there is no date picker, no history
 * pane and no session list — there is nothing else it could be about.
 *
 * That per-day shape is not a limitation, it is the measurement. Outreach is
 * `perDayCapped: true`: a second message on a Tuesday is the same Tuesday however many were
 * sent, because what is being counted is consistency in reaching the floor and not volume
 * past it. A dialog that let you log three would be drawing a distinction the ring refuses.
 *
 * THIS DIALOG IS THE ROW'S ONE CONTROL now — the owner's ruling, 2026-08-21: the side
 * "log" button is gone and tapping the row opens this, like every other logger. Three
 * consequences, all deliberate:
 *
 *   - SAVING IS LOGGING, still: writing ticks the day in the same upsert. And on a day you
 *     did it with nothing to say, "Log it" over an empty page IS the tick — the button
 *     never gates on words, because the honest-logging rule governs this surface exactly
 *     as it governed the box it replaced.
 *   - UNTICKING LIVES HERE, because the box that used to retract a day is gone. It is the
 *     app's own two-step, never a native confirm(), and it says out loud that the words go
 *     with the tick — the entry is one row.
 *   - CLEARING THE NOTE STILL DOES NOT UNTICK. Deleting a sentence you no longer like must
 *     not quietly retract the day.
 *
 * A quantity may ride along — pages read, today. `pagesLabel` is what turns the field on;
 * the number lands in habit_entries.value beside the note, and clearing it leaves a bare
 * tick standing (see engine.setHabitNote).
 */

/**
 * The non-negotiables whose row IS a logger — one control, the owner's ruling 2026-08-21.
 * Keyed by system_key so a rename changes nothing; `pagesLabel` turns on the quantity
 * field. Lives HERE, beside the dialog it configures, because two surfaces open it now —
 * Today's checklist and the written log's day reader — and two hand-copied rosters would
 * be two placeholders drifting apart.
 *
 * The Journal row deliberately is NOT here: a page IS its document, and its row opens the
 * page chooser instead.
 */
export const DOC_HABITS: Record<
  string,
  { placeholder: string; pagesLabel?: string }
> = {
  outreach: { placeholder: "Who did you reach out to, and what about?" },
  reading: {
    placeholder: "What did you read — and what did it leave you with?",
    pagesLabel: "Pages read",
  },
  // ASC.ND — the owner's ask, 2026-08-24: a session logger on the outreach/reading
  // model. Its notes join the written log as their own kind (see dayLog.ts).
  // "What did you do?", the owner's own wording (spec §5). The routine is stretching,
  // skincare and posture — things you DO rather than work on, and the old verb read as a
  // question about a project.
  ascnd: { placeholder: "What did you do?" },
};

export default function NoteLog({
  name,
  date,
  note,
  hue,
  done,
  pages,
  pagesLabel,
  placeholder,
  onSave,
  onUntick,
  onClose,
}: {
  name: string;
  /** The day the row belongs to. Shown, never editable — the row IS the day. */
  date: string;
  /** What is already written, or null. */
  note: string | null;
  hue: string;
  /** Whether the day is already ticked — decides the primary label and whether the
   *  untick control exists at all. */
  done: boolean;
  /** The stored quantity, or null. Only read when pagesLabel is set. */
  pages?: number | null;
  /** Names the quantity field ("Pages read") — its presence is what enables it. */
  pagesLabel?: string;
  placeholder: string;
  /**
   * note null clears the document and leaves the tick standing. `pages` travels only when
   * the field exists: undefined = no field, leave the stored number alone; null = field
   * cleared, back to a bare tick; a number = set it.
   */
  onSave: (note: string | null, pages?: number | null) => Promise<void>;
  /** Retract the day entirely — the box's old job, behind the two-step below. Absent
   *  when the day is not ticked: there is nothing to retract. */
  onUntick?: () => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(note ?? "");
  const [pagesText, setPagesText] = useState(
    pagesLabel && pages != null && pages > 1 ? String(pages) : "",
  );
  const [busy, setBusy] = useState(false);
  const [confirming, setConfirming] = useState(false);
  /** A save that did not land. The one thing this dialog must never do is close over a
   *  failure — the words on screen are the only copy of the words. */
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const areaRef = useRef<HTMLTextAreaElement>(null);
  const pagesRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
    // Straight into typing — the whole point is that logging costs nothing.
    areaRef.current?.focus();
  }, []);

  const run = async (fn: () => Promise<void>) => {
    setBusy(true);
    setError(null);
    try {
      await fn();
      onClose();
    } catch {
      // The dialog STAYS OPEN, words intact. Closing over a failed save would discard
      // the only copy of what was typed while looking exactly like success — the one
      // failure the honest-logging surface cannot afford.
      setError("Couldn't save just now — nothing typed here was lost. Try again.");
    } finally {
      setBusy(false);
    }
  };

  const trimmed = text.trim();
  const had = Boolean(note && note.trim());

  /**
   * The field's reading, in the engine's own three shapes — and it must never emit a
   * value the route refuses, so it clamps exactly as engine.setHabitNote does:
   *
   *   undefined   the field is unreadable (a stray 'e' leaves a number input in
   *               badInput, reporting "" while still SHOWING the old digits) — no
   *               opinion, leave the stored number alone. Collapsing this into "cleared"
   *               would let a note edit eat a real page count.
   *   null        deliberately empty, or a number that rounds below one — back to a
   *               bare tick.
   *   a number    rounded FIRST, then range-checked, capped at the engine's own 10,000.
   */
  const parsedPages = (): number | null | undefined => {
    if (pagesRef.current?.validity.badInput) return undefined;
    if (!pagesText.trim()) return null;
    const n = Number(pagesText);
    if (!Number.isFinite(n)) return undefined;
    const r = Math.round(n);
    return r >= 1 ? Math.min(10_000, r) : null;
  };

  const save = () =>
    run(() =>
      onSave(trimmed || null, pagesLabel ? parsedPages() : undefined),
    );

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,520px)] overflow-y-auto rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          {/* The non-negotiable's PILLAR hue, the same one its checklist box wears, so the
              dialog and the row it opened from are visibly the same thing. */}
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

      {/* The day, stated rather than offered. Backdating happens by moving the whole screen
          — see CLAUDE.md — so a second date control here would be a way to write this row
          against a day the checklist above it is not showing. */}
      <p className="mt-2 text-micro text-[var(--color-muted)]">
        {new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
          weekday: "long",
          day: "numeric",
          month: "long",
        })}
      </p>

      {/* The quantity, where this habit carries one. A line to write a number on, the
          checklist's own field shape — optional exactly as the words are: a tick with
          neither is still a day you did it. */}
      {pagesLabel && (
        <label className="mt-3 flex items-baseline justify-between gap-3">
          <span className="font-serif text-small">{pagesLabel}</span>
          <input
            ref={pagesRef}
            type="number"
            min="1"
            max="10000"
            step="1"
            inputMode="numeric"
            placeholder="—"
            value={pagesText}
            onChange={(e) => setPagesText(e.target.value)}
            disabled={busy}
            className="w-[4rem] border-b border-[var(--color-line-strong)] bg-transparent pb-0.5 text-right text-small tabular-nums outline-none transition-colors placeholder:text-[var(--color-muted)] focus:border-[var(--color-accent)] disabled:opacity-60"
          />
        </label>
      )}

      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder={placeholder}
        spellCheck={false}
        rows={8}
        aria-label={`${name} note`}
        className="mt-3 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-3 font-serif text-body leading-[1.7] outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
      />

      <div className="mt-5 flex items-center justify-between gap-3">
        {/* The quiet acts, only where each has something to act on. Clearing keeps the
            tick; unticking is the two-step below — two different retractions, named
            apart so neither can be reached for by mistake. */}
        <span className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-1">
          {had && (
            <button
              // Clears the WORDS only, as it says — but it still commits what the pages
              // field visibly shows, exactly as Save would: this button closes the
              // dialog, and a control that closes over an edited field silently reverts
              // an edit that was on screen when it was pressed.
              onClick={() =>
                run(() => onSave(null, pagesLabel ? parsedPages() : undefined))
              }
              disabled={busy}
              className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
            >
              Clear the note, keep the tick
            </button>
          )}
          {done && onUntick && (
            <button
              onClick={() => setConfirming(true)}
              disabled={busy}
              aria-expanded={confirming}
              className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
            >
              Untick the day
            </button>
          )}
        </span>
        <button
          onClick={save}
          // Never gated on words: on an unticked day an empty "Log it" IS the tick, which
          // is the one-tap honesty the removed box used to carry.
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : done ? "Save" : "Log it"}
        </button>
      </div>

      {/* A save that failed, said quietly in muted ink — no red, no blame, and the words
          above it untouched. Cleared the moment another save is attempted. */}
      {error && (
        <p className="mt-3 text-micro leading-relaxed text-[var(--color-muted)]">
          {error}
        </p>
      )}

      {/* THE SECOND STEP, in a row of its own — the WeightEntry idiom, never a native
          confirm(), which in a standalone PWA is a system sheet dropped on the app. */}
      {confirming && done && onUntick && (
        <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel-2)] p-3">
          <p className="min-w-0 flex-1 text-small leading-snug">
            Untick {name} for the day? Anything written here goes with it.
          </p>
          <button
            onClick={() => run(onUntick)}
            disabled={busy}
            className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
          >
            Untick
          </button>
          <button
            onClick={() => setConfirming(false)}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            Keep it
          </button>
        </div>
      )}
    </dialog>
  );
}
