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

export type Workout = { kind: WorkoutKind; title: string | null; note: string | null };

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
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => busy && e.preventDefault()}
      className="w-[min(94vw,640px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
    >
      <div className="flex items-baseline justify-between gap-4">
        <div className="min-w-0">
          <h2 className="flex items-center gap-2 text-[16px] font-semibold">
            <span aria-hidden className="h-2 w-2 shrink-0 rounded-full" style={{ background: hue }} />
            {label}
          </h2>
          <p className="mt-0.5 text-[12px] text-[var(--color-muted)]">{pretty}</p>
        </div>
        <button
          onClick={onClose}
          disabled={busy}
          className="shrink-0 text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)] disabled:opacity-40"
        >
          Close
        </button>
      </div>

      {workout?.title && (
        <p className="mt-3 text-[13px] text-[var(--color-muted)]">{workout.title}</p>
      )}

      <textarea
        ref={areaRef}
        value={note}
        onChange={(e) => setNote(e.target.value)}
        disabled={busy}
        placeholder={PLACEHOLDER[kind]}
        spellCheck={false}
        rows={14}
        aria-label={`${label} log`}
        className="mt-4 w-full resize-y rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] px-3.5 py-3 text-[14px] leading-[1.7] outline-none focus-visible:border-[var(--color-line-strong)] disabled:opacity-60"
        style={{ fontVariantNumeric: "tabular-nums" }}
      />

      <div className="mt-4 flex items-center justify-between gap-3">
        {/* Imported sessions carry a title — that is rescued Discord history and must not
            be deletable from a passing tap. */}
        {workout && !workout.title ? (
          <button
            onClick={() => run(onDelete)}
            disabled={busy}
            className="text-[13px] text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
          >
            Remove this session
          </button>
        ) : (
          <span />
        )}
        <button
          onClick={() => run(() => onSave(note))}
          disabled={busy}
          className="rounded-xl px-4 py-2 text-[14px] text-white transition-opacity disabled:opacity-40"
          style={{ background: hue }}
        >
          {busy ? "Saving…" : workout ? "Save" : "Log it"}
        </button>
      </div>
    </dialog>
  );
}
