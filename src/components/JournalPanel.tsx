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
  prompt = false,
  actions = true,
  onPromptHandled,
}: {
  date: string;
  entries: JournalView[];
  onChanged: () => void;
  /** Raised by the Journal row in the day's checklist. The journal is written, not ticked,
   *  so its row asks which kind of page rather than toggling a box. */
  prompt?: boolean;
  /**
   * Show the inline write / type buttons.
   *
   * False on Today, where the checklist row is the way in and these were the same two
   * choices offered a second time twenty lines below. The shelf of pages stays either
   * way — that is the artefact, and it exists nowhere else.
   */
  actions?: boolean;
  onPromptHandled?: () => void;
}) {
  const [mode, setMode] = useState<Mode>(null);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState<number | null>(null);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const chooserRef = useRef<HTMLDialogElement>(null);

  // The chooser stands down the moment a kind is picked — the page itself is the next
  // thing on screen, and two stacked modals would be one too many.
  useEffect(() => {
    const d = chooserRef.current;
    if (!d) return;
    if (prompt && !mode && !d.open) d.showModal();
    if ((!prompt || mode) && d.open) d.close();
  }, [prompt, mode]);

  const choose = (m: Mode) => {
    onPromptHandled?.();
    setMode(m);
  };

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
          <div key={e.id} className="relative">
            {e.kind === "text" ? (
              // Paper, not panel. The colour is the same one baked into a drawn page's PNG,
              // so a typed page and a handwritten one sit on the shelf as one artefact
              // rather than reading as two features — and the preview takes the serif
              // because the words in it are the owner's.
              <div
                className="flex h-[119px] w-[84px] overflow-hidden rounded-lg border border-[var(--color-line)] p-2"
                style={{ background: "#fdfbf6" }}
              >
                <span className="line-clamp-6 font-serif text-micro text-[var(--color-ink)]">
                  {e.preview || "…"}
                </span>
              </div>
            ) : (
              <a
                href={`/api/journal/${e.id}/image`}
                target="_blank"
                rel="noreferrer"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/journal/${e.id}/image`}
                  alt="Today's handwritten page"
                  className="h-[119px] w-[84px] rounded-lg border border-[var(--color-line)] object-cover object-top"
                />
              </a>
            )}
            {/* Always present rather than revealed on hover: this app is opened from a phone
                home screen, where hover never fires and a hidden control is an absent one.
                Quiet enough that the eye isn't drawn to the one destructive thing here. */}
            <button
              onClick={() => setConfirming(e.id)}
              aria-label="Delete this page"
              className="absolute -right-2 -top-2 rounded-full p-1 text-micro leading-none text-[var(--color-muted)] transition-colors hover:text-[var(--color-ink)]"
            >
              ×
            </button>

            {/* One stray tap used to destroy a page with no undo, against real
                handwriting. It asks now.

                No shadow, despite genuinely floating. It was the last one left in the
                codebase after this pass, and a single unexplained lift reads as an
                oversight rather than a system. The panel surface against the page, the
                hairline and the z-index already say "above"; that is the whole depth
                model, and it is enough. */}
            {confirming === e.id && (
              <div className="absolute left-0 top-full z-[var(--z-popover)] mt-1.5 w-48 rounded-xl border border-[var(--color-line)] bg-[var(--color-panel)] p-3">
                <p className="text-small leading-snug">
                  Delete this page? It can&apos;t be undone.
                </p>
                <div className="mt-3 flex items-center gap-3">
                  <button
                    onClick={() => remove(e.id)}
                    className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90"
                  >
                    Delete
                  </button>
                  <button
                    onClick={() => setConfirming(null)}
                    className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                  >
                    Keep
                  </button>
                </div>
              </div>
            )}
          </div>
        ))}

        {/* Sitting on the same bottom edge as the pages beside it, so the shelf has one
            line rather than controls hovering at the top of tall thumbnails. */}
        <div
          className={`items-center gap-3 self-end ${actions ? "flex" : "hidden"}`}
        >
          <button
            onClick={() => setMode("draw")}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-panel)]"
          >
            {entries.length ? "Write another page" : "Write today's page"}
          </button>
          <button
            onClick={() => setMode("type")}
            className="text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            or type it
          </button>
        </div>
      </div>

      {/* The chooser, raised from the day's checklist. Two equally-weighted options: a
          handwritten page and a typed one are the same artefact here, and giving either a
          filled button would quietly nominate one as the proper way to keep a journal. */}
      <dialog
        ref={chooserRef}
        onClose={() => onPromptHandled?.()}
        className="w-[min(92vw,22rem)] rounded-2xl bg-[var(--color-panel)] p-5 text-[var(--color-ink)]"
      >
        <p className="font-serif text-body">Tonight&apos;s page</p>
        <p className="mt-1 text-micro text-[var(--color-muted)]">
          Both land on the same sheet. Nothing reads it back.
        </p>
        <div className="mt-4 flex flex-wrap gap-2.5">
          <button
            onClick={() => choose("draw")}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-bg)]"
          >
            Write it
          </button>
          <button
            onClick={() => choose("type")}
            className="rounded-full border border-[var(--color-line-strong)] px-3.5 py-1.5 text-small transition-colors hover:bg-[var(--color-bg)]"
          >
            Type it
          </button>
          <button
            onClick={() => onPromptHandled?.()}
            className="ml-auto text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
          >
            not now
          </button>
        </div>
      </dialog>

      {/* Ink at weight 600, not the accent. The accent is certified at 4.7:1 with WHITE ON
          TOP — as a fill. As text on the beige page it measures 4.02:1 and fails the body
          floor, and it also made error-ness ride on hue alone. Same treatment as the login
          screen: there is no red in this system, so an error stands out by weight. */}
      {error && (
        <p role="alert" className="mt-3 text-small font-semibold">
          {error}
        </p>
      )}

      {/* One of the few surfaces still allowed a panel: a modal really does leave the page
          plane, so the lift is true rather than decoration. */}
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
            onSave={(image, width, height) =>
              post({ kind: "drawing", image, width, height })
            }
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
