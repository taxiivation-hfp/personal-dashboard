"use client";

import { useEffect, useRef, useState } from "react";

/**
 * ONE DOCUMENT, for a non-negotiable that carries one — outreach, today.
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
 * SAVING IS LOGGING — writing ticks the day in the same upsert, so there is no second
 * control to forget. CLEARING DOES NOT UNTICK: deleting a sentence you no longer like must
 * not quietly retract the day, and the box beside the row is what retracts it.
 */
export default function NoteLog({
  name,
  date,
  note,
  hue,
  onSave,
  onClose,
}: {
  name: string;
  /** The day the row belongs to. Shown, never editable — the row IS the day. */
  date: string;
  /** What is already written, or null. */
  note: string | null;
  hue: string;
  /** null clears the document and leaves the tick standing. */
  onSave: (note: string | null) => Promise<void>;
  onClose: () => void;
}) {
  const [text, setText] = useState(note ?? "");
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

  const trimmed = text.trim();
  const had = Boolean(note && note.trim());

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

      <textarea
        ref={areaRef}
        value={text}
        onChange={(e) => setText(e.target.value)}
        disabled={busy}
        placeholder={"Who did you reach out to, and what about?"}
        spellCheck={false}
        rows={8}
        aria-label={`${name} note`}
        className="mt-3 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-3 font-serif text-body leading-[1.7] outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
      />

      <div className="mt-5 flex items-center justify-between gap-3">
        {/* Only where there is something to clear, and it says what it does: the tick is a
            separate act and stays exactly where it was. */}
        {had ? (
          <button
            onClick={() => run(() => onSave(null))}
            disabled={busy}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
          >
            Clear the note, keep the tick
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => run(() => onSave(trimmed || null))}
          disabled={busy || !trimmed}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : had ? "Save" : "Log it"}
        </button>
      </div>
    </dialog>
  );
}
