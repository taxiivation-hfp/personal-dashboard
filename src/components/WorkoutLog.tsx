"use client";

import { useEffect, useRef, useState } from "react";
import type { WorkoutKind } from "@/lib/rings";

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
 */

/** One SESSION, not one kind-per-day: a day can hold two lifts, so the id is what
 *  distinguishes them. */
export type Workout = { id: number; kind: WorkoutKind; title: string | null; note: string | null };

const PLACEHOLDER: Record<WorkoutKind, string> = {
  strength: "45kg OHP - 6 reps\n45kg OHP - 6 reps\n70kg Chest Flies - 6 reps",
  cardio: "5km, 27:40\nzone 2, felt easy",
  misc: "Bouldering — 3 x V4\nHandstand holds",
};

export default function WorkoutLog({
  kind,
  label,
  date,
  workout,
  hue,
  onSave,
  onDelete,
  onClose,
}: {
  kind: WorkoutKind;
  label: string;
  date: string;
  workout: Workout | null;
  hue: string;
  onSave: (note: string) => Promise<void>;
  onDelete: () => Promise<void>;
  onClose: () => void;
}) {
  const [note, setNote] = useState(workout?.note ?? "");
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

  const pretty = new Date(`${date}T12:00:00`).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
  });

  return (
    // A dialog is the one thing genuinely lifted off the page, so it keeps a panel where
    // the sections lost theirs.
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,640px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="section-head">
        {/* The hue is the pillar's, not this kind's — it categorises, so the label beside
            it carries the meaning and the dot only tints it. */}
        <h2 className="flex min-w-0 items-center gap-2 text-small font-semibold">
          <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: hue }} />
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

      <p className="pt-2 text-micro text-[var(--color-muted)]">{pretty}</p>

      {/* An imported title is rescued Discord history — the owner's words, so serif, but
          muted because it is context rather than the document being written. */}
      {workout?.title && (
        <p className="mt-3 font-serif text-body text-[var(--color-muted)]">{workout.title}</p>
      )}

      {/* A writing surface, not a field: it keeps its bordered sheet where the app's other
          inputs became lines. Recessed inside the lifted dialog, and tabular so a column
          of weights lines up the way it would on paper. */}
      <textarea
        ref={areaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        placeholder={PLACEHOLDER[kind]}
        spellCheck={false}
        rows={14}
        aria-label={`${label} log`}
        className="mt-4 w-full resize-y rounded-lg border border-[var(--color-line)] bg-[var(--color-panel-2)] px-3.5 py-3 font-serif text-body leading-[1.7] tabular-nums outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
      />

      <div className="mt-5 flex items-center justify-between gap-3">
        {/* Imported sessions carry a title — that is rescued Discord history and must not
            be deletable from a passing tap. */}
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
        {/* The accent, not the pillar hue: the same hue arrives here for all three kinds,
            so filling the action with it would categorise nothing and give the app a
            second accent. */}
        <button
          onClick={() => run(() => onSave(note))}
          disabled={busy}
          className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
        >
          {busy ? "Saving…" : workout ? "Save" : "Log it"}
        </button>
      </div>
    </dialog>
  );
}
