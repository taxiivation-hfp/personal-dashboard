"use client";

import { useEffect, useRef, useState } from "react";
import JournalCanvas from "./JournalCanvas";
import type { JournalView } from "@/lib/queries";

/**
 * The page is saved as handwriting and left as handwriting — no transcript, no themes.
 * So this panel shows the page itself rather than words read back out of it.
 */
export default function JournalPanel({
  date,
  entries,
  onChanged,
}: {
  date: string;
  entries: JournalView[];
  onChanged: () => void;
}) {
  const [open, setOpen] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);

  useEffect(() => {
    const d = dialogRef.current;
    if (!d) return;
    if (open && !d.open) d.showModal();
    if (!open && d.open) d.close();
  }, [open]);

  async function save(image: string, width: number, height: number) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch("/api/journal", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ date, image, width, height }),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "could not save");
      setOpen(false);
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove(id: number) {
    await fetch(`/api/journal/${id}`, { method: "DELETE" });
    onChanged();
  }

  return (
    <>
      <div className="flex flex-wrap items-center gap-3">
        {entries.map((e) => (
          <div key={e.id} className="group relative">
            <a href={`/api/journal/${e.id}/image`} target="_blank" rel="noreferrer">
              {/* eslint-disable-next-line @next/next/no-img-element */}
              <img
                src={`/api/journal/${e.id}/image`}
                alt="Today's handwritten page"
                className="h-24 w-20 rounded-lg border border-[var(--color-line)] object-cover object-top"
              />
            </a>
            <button
              onClick={() => remove(e.id)}
              aria-label="Delete this page"
              className="absolute -right-2 -top-2 rounded-full bg-[var(--color-panel)] px-1.5 text-[var(--color-muted)] opacity-0 shadow-sm transition group-hover:opacity-100 focus-visible:opacity-100"
            >
              ×
            </button>
          </div>
        ))}

        <button
          onClick={() => setOpen(true)}
          className="rounded-xl border border-[var(--color-line-strong)] px-4 py-2.5 text-[15px] transition-colors hover:bg-[var(--color-panel)]"
        >
          {entries.length ? "Write another page" : "Write today's page"}
        </button>
      </div>

      {error && (
        <p role="alert" className="mt-2 text-[13px] text-[var(--color-accent)]">
          {error}
        </p>
      )}

      <dialog
        ref={dialogRef}
        onClose={() => setOpen(false)}
        onCancel={(e) => {
          if (busy) e.preventDefault();
        }}
        className="h-[92dvh] w-[min(94vw,900px)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[var(--color-ink)] backdrop:bg-black/30"
      >
        {open && <JournalCanvas onSave={save} onCancel={() => !busy && setOpen(false)} busy={busy} />}
      </dialog>
    </>
  );
}
