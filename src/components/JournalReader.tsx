"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import JournalCanvas from "./JournalCanvas";
import JournalText from "./JournalText";
import Sheet from "./Sheet";
import type { JournalPage } from "@/lib/queries";

/**
 * ONE PAGE, OPEN — and the way through to the ones either side of it.
 *
 * The journal could be written and shelved but never read: a drawing opened as a raw PNG in
 * a browser tab, which is the file rather than the page, and a typed page could not be
 * opened at all — the shelf showed its first hundred and forty characters and there was no
 * way to the rest. Everything typed into this app before today was, in practice, write-only.
 *
 * LEAFING IS BY DATE, not by list position, and the words say so. `pages` arrives newest
 * first, so "older" walks down the array and "newer" walks up; labelling the controls with a
 * pair of arrows alone would have made the direction a thing you learn by pressing one.
 *
 * The sheet here GROWS. A page is at least A4 and then as long as the writing on it, rather
 * than a fixed rectangle with a scrollbar sliding the words across their own rules.
 */

/** Noon, never midnight: a bare ISO date parses as UTC and lands on the day before
 *  anywhere west of Greenwich. */
const onDay = (iso: string) => new Date(`${iso}T12:00:00`);

const longDay = (iso: string) =>
  onDay(iso).toLocaleDateString("en-AU", {
    weekday: "long",
    day: "numeric",
    month: "long",
    year: "numeric",
  });

type Loaded = {
  id: number;
  date: string;
  kind: string;
  body: string | null;
};

export default function JournalReader({
  pages: given,
  id,
  onId,
  onChanged,
  onClose,
}: {
  /**
   * The pages this reader can leaf through, newest first.
   *
   * Optional, and the fallback matters: opened from the archive it is handed the list that
   * screen already has, and opened from the day's checklist there is no list to hand — so
   * it fetches the archive itself rather than leafing only through the pages that happen
   * to share a date with the one you opened. Metadata only, and previews at 140 characters;
   * a year of it is a few hundred short rows.
   */
  pages?: JournalPage[];
  id: number;
  onId: (id: number) => void;
  /** Raised after a write, so the list behind this reloads its previews. */
  onChanged: () => void;
  onClose: () => void;
}) {
  const dialogRef = useRef<HTMLDialogElement>(null);
  const [fetched, setFetched] = useState<JournalPage[] | null>(null);
  const pages = given ?? fetched ?? [];

  const [page, setPage] = useState<Loaded | null>(null);
  const [editing, setEditing] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [confirming, setConfirming] = useState(false);
  /**
   * Bumped after a drawing is saved, and appended to the image URL.
   *
   * `[id]/image` is served with `cache-control: private, max-age=3600`, which is right for
   * a page that almost never changes and exactly wrong for the moment one just did — the
   * browser would answer the reload out of its own cache and show the page as it was
   * before the pen touched it.
   */
  const [rev, setRev] = useState(0);

  /** Re-read the list this reader owns. Only when it owns one: given a list, the screen
   *  behind is the authority and reloads it through `onChanged`. */
  const reloadList = useCallback(() => {
    if (given) return;
    fetch("/api/journal")
      .then((r) => r.json())
      .then((d) => !d.error && setFetched(d.pages ?? []))
      .catch(() => {});
  }, [given]);

  useEffect(() => {
    reloadList();
  }, [reloadList]);

  useEffect(() => {
    const d = dialogRef.current;
    if (d && !d.open) d.showModal();
  }, []);

  // The full words live only on this endpoint — every list in the app carries a 140-char
  // preview instead. Reset to null first so a slow read shows the page loading rather than
  // the PREVIOUS page's words under the new page's date.
  useEffect(() => {
    let alive = true;
    setPage(null);
    setEditing(false);
    setConfirming(false);
    setError(null);
    fetch(`/api/journal/${id}`)
      .then((r) => r.json())
      .then((d: Loaded & { error?: string }) => {
        if (!alive) return;
        if (d.error) return setError(d.error);
        setPage(d);
      })
      .catch(() => alive && setError("could not open this page"));
    return () => {
      alive = false;
    };
  }, [id]);

  const at = pages.findIndex((p) => p.id === id);
  /** Newest first, so the NEXT entry is the older page and the previous one is newer. */
  const older = at >= 0 ? (pages[at + 1] ?? null) : null;
  const newer = at > 0 ? pages[at - 1] : null;

  // ← and → leaf, because a reader is the one screen in this app where that is what those
  // keys are for. Escape is the dialog's own and is left alone.
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => {
      if (editing || busy) return;
      if (e.key === "ArrowLeft" && older) onId(older.id);
      if (e.key === "ArrowRight" && newer) onId(newer.id);
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [editing, busy, older, newer, onId]);

  async function patch(payload: Record<string, unknown>) {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/journal/${id}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify(payload),
      });
      const d = await res.json();
      if (!res.ok) throw new Error(d.error ?? "could not save");
      // Re-read rather than patch the copy in hand: the row is the record, and a screen
      // that shows what it SENT rather than what was stored is a screen that can be wrong
      // and look right.
      const fresh = await fetch(`/api/journal/${id}`).then((r) => r.json());
      if (!fresh.error) setPage(fresh);
      setRev((n) => n + 1);
      setEditing(false);
      reloadList();
      onChanged();
    } catch (e) {
      setError(e instanceof Error ? e.message : "could not save");
    } finally {
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    await fetch(`/api/journal/${id}`, { method: "DELETE" }).catch(() => {});
    setBusy(false);
    setConfirming(false);
    // Both, and in this order: the list this reader leafs through must lose the row too,
    // or "older" would walk straight into a page that is no longer there.
    reloadList();
    onChanged();
    // Land on the page next to the one just removed rather than dropping the reader — you
    // are usually somewhere in a run of pages, and closing back to the list to reopen the
    // one beside it is a round trip for nothing.
    const to = older ?? newer;
    if (to) onId(to.id);
    else onClose();
  }

  const isText = page?.kind === "text";

  return (
    <dialog
      ref={dialogRef}
      onClose={onClose}
      onCancel={(e) => {
        if (busy) e.preventDefault();
      }}
      className={`w-[min(94vw,46rem)] rounded-2xl border border-[var(--color-line)] bg-[var(--color-panel)] p-4 text-[var(--color-ink)] sm:p-5 ${
        editing ? "h-[92dvh]" : "max-h-[92dvh] overflow-y-auto"
      }`}
    >
      {editing && page ? (
        // The editor and, above it, anywhere a failed save has to be able to speak.
        // `error` used to be rendered only in the reading branch, so a rejected PATCH set a
        // message into a state this branch could not draw: Save re-enabled itself, the
        // status line went back to "Ready to save.", and nothing on screen said the write
        // had been refused. A write that fails silently is worse than one that fails.
        <div className="flex h-full min-h-0 flex-col">
          {error && (
            <p role="alert" className="mb-2 shrink-0 text-small font-semibold">
              {error}
            </p>
          )}
          <div className="min-h-0 flex-1">
            {isText ? (
              <JournalText
                editing
                initial={page.body ?? ""}
                onSave={(body) => patch({ body })}
                onCancel={() => !busy && setEditing(false)}
                busy={busy}
              />
            ) : (
              <JournalCanvas
                base={`/api/journal/${id}/image?v=${rev}`}
                onSave={(image, width, height) => patch({ image, width, height })}
                onCancel={() => !busy && setEditing(false)}
                busy={busy}
              />
            )}
          </div>
        </div>
      ) : (
        <>
          {/* The date IS the title. Out of the day's context it is the only thing that tells
              two Tuesdays apart, and a journal page has no other name. */}
          <div className="section-head">
            <h2 className="min-w-0 font-serif text-body">
              {page ? longDay(page.date) : "…"}
            </h2>
            <button
              onClick={onClose}
              aria-label="Close"
              className="shrink-0 rounded-lg px-2 py-1 text-body leading-none text-[var(--color-muted)] transition-colors hover:bg-[var(--color-bg)] hover:text-[var(--color-ink)]"
            >
              ×
            </button>
          </div>

          {/* THE CHROME, all of it, ABOVE the page.
              A page is a page — eighteen lines of A4 is taller than any dialog, so anything
              put under it is under a scroll. Leafing and editing are how you use this
              screen, not what you do after finishing it, so they sit where they can always
              be reached and the sheet below is left as one uninterrupted thing.

              Three groups on one line: what the page IS, how to leave it, what to do to it.
              The way back to the day is what makes the archive part of the app rather than
              a folder beside it — a page you are reading is usually a day you want to open. */}
          <div className="mt-2 flex flex-wrap items-center justify-between gap-x-4 gap-y-2.5">
            <p className="flex flex-wrap items-baseline gap-x-3 gap-y-1 text-micro text-[var(--color-muted)]">
              <span>{page ? (isText ? "typed" : "handwritten") : ""}</span>
              {page && (
                <a
                  href={`/?date=${page.date}`}
                  className="underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
                >
                  open that day →
                </a>
              )}
            </p>

            <div className="flex flex-wrap items-center gap-x-3 gap-y-2">
              {/* LEAFING BY DATE, and the words say so. `pages` runs newest first, so
                  "older" walks down it — a pair of bare arrows would have made the
                  direction something you learn by pressing one. */}
              <button
                onClick={() => older && onId(older.id)}
                disabled={!older || busy}
                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
              >
                ‹ older
              </button>
              <button
                onClick={() => newer && onId(newer.id)}
                disabled={!newer || busy}
                className="rounded-full border border-[var(--color-line-strong)] px-3 py-1 text-micro transition-colors hover:bg-[var(--color-bg)] disabled:opacity-40"
              >
                newer ›
              </button>
              {/* Padded to the height of the pills beside it. It stays a quiet word rather
                  than a button — it is the one destructive thing here — but a 16px target
                  12px from "newer ›" is one a thumb opens by accident. */}
              <button
                onClick={() => setConfirming(true)}
                disabled={!page || busy}
                aria-expanded={confirming}
                className="rounded-lg px-2 py-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setEditing(true)}
                disabled={!page || busy}
                className="rounded-lg bg-[var(--color-accent)] px-3.5 py-1.5 text-micro text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                {/* Never guessed. Until the page has arrived nobody knows whether it is
                    words or ink, and "Add to it" over a typed page would be the reader
                    telling you what you wrote before it had read it. */}
                {page && !isText ? "Add to it" : "Edit"}
              </button>
            </div>
          </div>

          {/* The second step, in a row of its own. Never a native confirm(): in a standalone
              PWA that is a system sheet dropped on the app. */}
          {confirming && (
            <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2 rounded-xl border border-[var(--color-line)] bg-[var(--color-bg)] p-3">
              <p className="min-w-0 flex-1 text-small leading-snug">
                Delete this page? It can&apos;t be undone.
              </p>
              <button
                onClick={remove}
                disabled={busy}
                className="rounded-lg bg-[var(--color-accent)] px-4 py-2 text-small text-white transition-opacity hover:opacity-90 disabled:opacity-40"
              >
                Delete
              </button>
              <button
                onClick={() => setConfirming(false)}
                className="rounded-lg px-2 py-1.5 text-micro text-[var(--color-muted)] underline-offset-4 transition-colors hover:text-[var(--color-ink)] hover:underline"
              >
                Keep
              </button>
            </div>
          )}

          {/* Ink at weight 600, not the accent: the accent measures 4.02:1 as text on this
              paper and fails the body floor. There is no red in this system, so an error
              stands out by weight — the same treatment the login screen uses. */}
          {error && (
            <p role="alert" className="mt-3 text-small font-semibold">
              {error}
            </p>
          )}

          <div className="mt-4 flex justify-center">
            {page && isText && (
              <Sheet
                a4={false}
                className="w-full max-w-[34rem] rounded-xl border border-[var(--color-line)]"
              >
                <div className="sheet-text sheet-page">{page.body}</div>
              </Sheet>
            )}
            {page && !isText && (
              // The PNG carries its own ruling, so the sheet under it draws none — see
              // Sheet's `rules` prop. Full width of the page, never cropped: a thumbnail
              // may cover, a reader may not.
              <Sheet
                rules={false}
                className="w-full max-w-[34rem] rounded-xl border border-[var(--color-line)]"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={`/api/journal/${id}/image?v=${rev}`}
                  alt={`Handwritten page from ${page.date}`}
                  className="block h-full w-full object-contain"
                />
              </Sheet>
            )}
            {!page && !error && (
              <p className="py-16 text-small text-[var(--color-muted)]">
                Opening…
              </p>
            )}
          </div>

        </>
      )}
    </dialog>
  );
}
