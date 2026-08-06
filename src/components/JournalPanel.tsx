"use client";

import { useEffect, useRef, useState } from "react";
import JournalCanvas from "./JournalCanvas";
import JournalText from "./JournalText";
import type { JournalView } from "@/lib/queries";

/**
 * A page is saved as handwriting or as words, and left as whatever it was — no
 * transcription in either direction. So this panel shows the page itself rather than
 * anything read back out of it.
 *
 * `kind` is the discriminator throughout. A text entry stores image='' (see the schema
 * comment), so testing for an empty image would work by accident today and break the
 * moment anything else writes a blank — never do it.
 */
type Mode = null | "draw" | "type";

export default function JournalPanel({
  date,
  entries,
  onChanged,
}: {
  date: string;
  entries: JournalView[];
  onChanged: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (mode && !d.open) d.showModal();
    if (!mode && d.open) d.close();
  }, [mode]);

  async function post(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, ...payload }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "could not save");
      setMode(null);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/journal/${id}`, { method: "DELETE" });
    setConfirming(null);
    onChanged();
  }

  return (
    <>
      <div className="flex flex-wrap items-start gap-3">
        {entries.map((e) => (
          <div key={e.id} className="group relative">
            {e.kind === "text" ? (
              <div
                className="flex h-24 w-[68px] overflow-hidden rounded-lg border border-[var(--color-line)] p-2 text-[9px] leading-[1.45]"
                style={{ background: "#fdfbf6", color: "var(--color-muted)" }}
              >
                <span className="line-clamp-6">{e.preview || "…"}</span>
              </div>
            ) : (
              <a href={`/api/journal/${e.id}/image`} target="_blank" rel="noreferrer">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/journal/${e.id}/image`}
                  alt="Today's handwritten page"
                  className="h-24 w-[68px] rounded-lg border border-[var(--color-line)] object-cover object-top"
                />
              </a>
            )}
            <button
              onClick={() => setConfirming(e.id)}
              aria-label="Delete this page"
              className="absolute -right-2 -top-2 rounded-full bg-[var(--color-panel)] px-1.5 text-[var(--color-muted)] opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100"
            >
              ×
            </button>

            {/* One stray tap used to destroy a page with no undo, against real
                handwriting. It asks now. */}
            {confirming === e.id && (
              <div className="absolute left-0 top-full z-[var(--z-popover)] mt-1.5 w-40 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-2.5 shadow-sm">
                <p className="text-[12px] leading-snug">Delete this page? It can&apos;t be undone.</p>
                <div className="mt-2 flex gap-1.5">
                  <button
                    onClick={() => remove(e.id)}
                    className="rounded-lg bg-[var(--color-accent)] px-2.5 py-1 text-[11px] text-white"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="rounded-lg px-2.5 py-1 text-[11px] text-[var(--color-muted)] hover:text-[var(--color-ink)]"
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        <div className="flex flex-col gap-2">
          <button
            onClick={() => setMode("draw")}
            className="rounded-xl border border-[var(--color-line-strong)] px-4 py-2.5 text-[15px] transition-colors hover:bg-[var(--color-panel)]"
          >
            {entries.length ? "Write another page" : "Write today's page"}
          </button>
          <button
            onClick={() => setMode("type")}
            className="rounded-xl px-4 py-1.5 text-[13px] text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
          >
            or type it
          </button>
        </div>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-accent)]">
          {error}
        </p>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setMode(null)}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="h-[92dvh] w-[min(94vw,900px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[var(--color-ink)]"
      >
        {mode === "draw" && (
          <JournalCanvas
            onSave={(image, width, height) => post({ kind: "drawing", image, width, height })}
            onCancel={() => !busy && setMode(null)}
            busy={busy}
          />
        )}
        {mode === "type" && (
          <JournalText
            onSave={(body) => post({ kind: "text", body })}
            onCancel={() => !busy && setMode(null)}
            busy={busy}
          />
        )}
      </dialog>
    </>
  );
}
